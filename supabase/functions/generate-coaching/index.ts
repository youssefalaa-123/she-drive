import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';
import { verifyFirebaseToken, extractBearerToken } from '../_shared/firebaseAuth.ts';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '';

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-firebase-token',
  };
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

const RATE_LIMIT_MINUTES = 10;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = extractBearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const caller = await verifyFirebaseToken(token);
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  try {
    const { passenger_id } = await req.json();
    if (!passenger_id || typeof passenger_id !== 'string') {
      return new Response('Missing passenger_id', { status: 400, headers: cors });
    }

    // Caller may only generate coaching for themselves
    if (passenger_id !== caller.uid) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Rate limit: one coaching message per passenger per RATE_LIMIT_MINUTES
    const windowStart = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('coaching_messages')
      .select('id', { count: 'exact', head: true })
      .eq('passenger_id', passenger_id)
      .gte('created_at', windowStart);

    if (count && count > 0) {
      return new Response(
        JSON.stringify({ error: 'Rate limited. Try again later.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...cors } },
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, current_streak, longest_streak, total_trips')
      .eq('id', passenger_id)
      .single();

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: recentRides } = await supabase
      .from('rides')
      .select('created_at')
      .eq('passenger_id', passenger_id)
      .eq('status', 'completed')
      .gte('created_at', since.toISOString());

    const streak     = profile?.current_streak ?? 0;
    const longest    = profile?.longest_streak ?? 0;
    const totalTrips = profile?.total_trips ?? 0;
    const ridesMonth = recentRides?.length ?? 0;
    // Sanitize name before prompt interpolation to prevent injection
    const rawName   = profile?.name?.split(' ')[0] ?? 'there';
    const firstName = rawName.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim() || 'there';

    const milestones: string[] = [];
    if (streak > 0 && streak % 7 === 6) milestones.push(`one more day completes ${Math.floor((streak + 1) / 7)} week(s) in a row`);
    if (streak > 0 && streak % 30 === 29) milestones.push('one more day completes a full month streak');
    if (streak > longest) milestones.push('this is her longest streak ever');

    const milestoneHint = milestones.length > 0
      ? `Notable milestone: ${milestones.join(', ')}.`
      : '';

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 120,
      system: 'You are a warm, encouraging coach for a women-only ride-hailing app called SheDrive. Output ONLY the coaching message — no labels, no quotes.',
      messages: [{
        role: 'user',
        content: `Write a single short motivational message (max 2 sentences) for a passenger named ${firstName}.

Her stats:
- Current streak: ${streak} consecutive days with a completed ride
- Longest streak ever: ${longest} days
- Total trips: ${totalTrips}
- Rides in the last 30 days: ${ridesMonth}
${milestoneHint}

Rules:
- If streak is 0, welcome her back warmly (no guilt).
- Be specific about her streak number — don't be generic.
- Sound like Duolingo: friendly, brief, specific.
- Max 1 emoji.`,
      }],
    });

    const message = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

    await supabase.from('coaching_messages').insert({
      passenger_id,
      message,
      streak_days: streak,
    });

    return new Response(JSON.stringify({ message, streak }), {
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (_) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  }
});
