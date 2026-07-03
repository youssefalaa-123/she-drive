import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

Deno.serve(async (req) => {
  try {
    const { passenger_id } = await req.json();
    if (!passenger_id) return new Response('Missing passenger_id', { status: 400 });

    // Fetch profile + streak data
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, current_streak, longest_streak, total_trips')
      .eq('id', passenger_id)
      .single();

    // Rides in the last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data: recentRides } = await supabase
      .from('rides')
      .select('created_at')
      .eq('passenger_id', passenger_id)
      .eq('status', 'completed')
      .gte('created_at', since.toISOString());

    const streak       = profile?.current_streak  ?? 0;
    const longest      = profile?.longest_streak  ?? 0;
    const totalTrips   = profile?.total_trips      ?? 0;
    const ridesMonth   = recentRides?.length       ?? 0;
    const firstName    = profile?.name?.split(' ')[0] ?? 'there';

    // Build milestone hints for Claude
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
      messages: [{
        role: 'user',
        content: `You are a warm, encouraging coach for a women-only ride-hailing app called SheDrive.
Write a single short motivational message (max 2 sentences) for a passenger named ${firstName}.

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
- Max 1 emoji.
- Output ONLY the message, no labels or quotes.`,
      }],
    });

    const message = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

    await supabase.from('coaching_messages').insert({
      passenger_id,
      message,
      streak_days: streak,
    });

    return new Response(JSON.stringify({ message, streak }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
