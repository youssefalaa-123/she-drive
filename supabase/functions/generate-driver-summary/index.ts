import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

Deno.serve(async (req) => {
  try {
    const { driver_id, period_type } = await req.json();
    if (!driver_id || !period_type) return new Response('Missing driver_id or period_type', { status: 400 });

    const now = new Date();
    const periodStart = new Date();
    if (period_type === 'weekly') {
      periodStart.setDate(now.getDate() - 7);
    } else {
      periodStart.setDate(now.getDate() - 30);
    }

    // Fetch driver profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, rating, rating_count, total_trips, wallet')
      .eq('id', driver_id)
      .single();

    // Fetch rides in the period
    const { data: rides } = await supabase
      .from('rides')
      .select('final_fare, driver_earnings, status, created_at, cancelled_by, cancellation_fee, payment_method')
      .eq('driver_id', driver_id)
      .gte('created_at', periodStart.toISOString())
      .order('created_at', { ascending: false });

    // Fetch reviews in the period
    const { data: reviews } = await supabase
      .from('reviews')
      .select('rating, comment, created_at')
      .eq('driver_id', driver_id)
      .gte('created_at', periodStart.toISOString())
      .order('created_at', { ascending: false });

    // Compute stats
    const completedRides  = rides?.filter(r => r.status === 'completed') ?? [];
    const cancelledRides  = rides?.filter(r => r.status === 'cancelled')  ?? [];
    const totalEarnings   = completedRides.reduce((s, r) => s + (r.driver_earnings ?? 0), 0);
    const avgRating       = reviews && reviews.length > 0
      ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
      : null;
    const fiveStarCount   = reviews?.filter(r => r.rating === 5).length ?? 0;
    const lowRatingCount  = reviews?.filter(r => r.rating <= 2).length ?? 0;
    const recentComments  = reviews
      ?.filter(r => r.comment && r.comment.trim().length > 0)
      .slice(0, 5)
      .map(r => `"${r.comment}" (${r.rating}★)`)
      .join('\n') ?? 'No written comments this period.';

    const firstName = profile?.name?.split(' ')[0] ?? 'there';
    const label = period_type === 'weekly' ? 'week' : 'month';

    const stats = {
      completed_rides: completedRides.length,
      cancelled_rides: cancelledRides.length,
      total_earnings: Math.round(totalEarnings),
      avg_rating: avgRating ? Math.round(avgRating * 10) / 10 : null,
      five_star_count: fiveStarCount,
      low_rating_count: lowRatingCount,
      review_count: reviews?.length ?? 0,
    };

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 350,
      messages: [{
        role: 'user',
        content: `You are a warm, honest performance coach for a women-only ride-hailing app called SheDrive.
Write a ${label}ly reflection summary for a driver named ${firstName}.

Stats for this ${label}:
- Completed trips: ${stats.completed_rides}
- Cancelled trips: ${stats.cancelled_rides}
- Total earnings: ${stats.total_earnings} EGP
- Average rating this ${label}: ${stats.avg_rating ?? 'no ratings yet'}
- Overall all-time rating: ${profile?.rating?.toFixed(2) ?? 'N/A'} (${profile?.rating_count ?? 0} ratings total)
- 5-star ratings this ${label}: ${stats.five_star_count}
- Low ratings (1-2 stars) this ${label}: ${stats.low_rating_count}

Passenger comments this ${label}:
${recentComments}

Rules:
- Be honest but warm — highlight wins, flag concerns constructively.
- Be specific with numbers.
- If ratings dropped, acknowledge it gently and suggest possible reasons.
- 3-4 sentences max.
- Output ONLY the summary text, no headers or labels.`,
      }],
    });

    const summary = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

    await supabase.from('driver_summaries').insert({
      driver_id,
      period_type,
      period_start: periodStart.toISOString().split('T')[0],
      period_end:   now.toISOString().split('T')[0],
      summary,
      stats,
    });

    return new Response(JSON.stringify({ summary, stats }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
