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

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

/** Strip characters that could be used for prompt injection. */
function sanitizeText(s: unknown, maxLen = 200): string {
  if (!s || typeof s !== 'string') return '';
  return s.replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '').slice(0, maxLen).trim();
}

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
    const {
      driver_id,
      period_type,
      driver_name,
      all_time_rating,
      all_time_rating_count,
      stats,
      reviews,
      language,
    } = await req.json();

    if (!driver_id || !period_type || !stats) {
      return new Response('Missing required fields', { status: 400, headers: cors });
    }

    // Caller may only request summaries for themselves
    if (driver_id !== caller.uid) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const isArabic = language === 'ar';
    const label = period_type === 'weekly'
      ? (isArabic ? 'أسبوع' : 'week')
      : (isArabic ? 'شهر' : 'month');

    // Sanitize all user-supplied strings before prompt interpolation
    const firstName = sanitizeText(driver_name?.split(' ')[0] || (isArabic ? 'السائقة' : 'there'), 50);
    const safeReviews = (Array.isArray(reviews) ? reviews : [])
      .filter((r: any) => r?.comment && typeof r.comment === 'string')
      .slice(0, 6)
      .map((r: any) => ({ comment: sanitizeText(r.comment, 300), rating: Number(r.rating) || 0 }));

    const commentLines = safeReviews
      .filter(r => r.comment.length > 0)
      .map(r => `- "${r.comment}" (${r.rating}⭐)`)
      .join('\n');

    const hasComments = commentLines.length > 0;
    const hasRatings  = (stats.review_count ?? 0) > 0;

    const prompt = isArabic
      ? `أنتِ مدربة أداء دافئة وصادقة لتطبيق SheDrive، تطبيق نقل حصري للنساء في مصر.

اكتبي فقرة واحدة متدفقة (4-6 جمل) للسائقة ${firstName} تلخّصين فيها أداءها هذا ${label}.

المعلومات التي يجب دمجها في الفقرة:
- أتمّت ${stats.completed_rides} رحلة هذا ${label}، وحققت ${stats.total_earnings} جنيه.
- ${hasRatings ? `منحتها الراكبات تقييمًا متوسطًا ${stats.avg_rating} ⭐ هذا ${label} (${stats.review_count} تقييم: ${stats.five_star_count} خمس نجوم، ${stats.low_rating_count} تقييمات منخفضة).` : 'لم تحصل على تقييمات من الراكبات هذا ' + label + ' بعد.'}
- تقييمها الإجمالي ${all_time_rating ? all_time_rating.toFixed(1) + ' ⭐ من ' + all_time_rating_count + ' تقييم' : 'لم يُحدَّد بعد'}.
${hasComments ? `\nما كتبته الراكبات هذا ${label}:\n${commentLines}` : `\nلا توجد تعليقات مكتوبة من الراكبات هذا ${label}.`}

قواعد الأسلوب:
- خاطبيها مباشرةً بضمير المخاطبة المؤنث ("أنتِ"، "رحلاتكِ"، "أداؤكِ").
- اذكري الأرقام بشكل طبيعي داخل الفقرة — لا قوائم ولا نقاط.
- إن كانت هناك تعليقات مكتوبة، اقتبسي منها أو استشهدي بمضمون واحد على الأقل.
- إن كانت التقييمات مرتفعة، احتفلي بصدق. وإن كانت منخفضة، اذكري ذلك بصدق ودفء واقترحي شيئًا واحدًا ملموسًا يمكنها تحسينه.
- إن لم تكن لديها رحلات بعد، شجّعيها بدفء على البدء.
- اختتمي بنصيحة تدريبية قصيرة وعملية كجملة أخيرة.
- اكتبي الفقرة فقط. لا عناوين، لا نقاط، لا تسميات.`
      : `You are a warm, honest performance coach for SheDrive, a women-only ride-hailing app in Egypt.

Write a single flowing paragraph (4-6 sentences) for driver ${firstName} summarising her performance this ${label}.

Facts to weave into the paragraph:
- She completed ${stats.completed_rides} trip${stats.completed_rides !== 1 ? 's' : ''} this ${label}, earning ${stats.total_earnings} EGP.
- ${hasRatings ? `Passengers gave her an average of ${stats.avg_rating} ⭐ this ${label} (${stats.review_count} rating${stats.review_count !== 1 ? 's' : ''}: ${stats.five_star_count} five-star, ${stats.low_rating_count} low).` : 'She has no passenger ratings yet this ' + label + '.'}
- Her all-time rating is ${all_time_rating ? all_time_rating.toFixed(1) + ' ⭐ from ' + all_time_rating_count + ' total ratings' : 'not yet established'}.
${hasComments ? `\nWhat passengers wrote this ${label}:\n${commentLines}` : `\nNo written comments from passengers this ${label}.`}

Tone rules:
- Speak directly to her using "you" and "your".
- Mention specific numbers naturally in the flow of the paragraph — do not bullet-point them.
- If she has written comments, quote or closely paraphrase at least one of them.
- If ratings are high, celebrate genuinely. If low, name it honestly and warmly suggest one concrete thing she can do differently.
- If she has no trips yet, encourage her to get started with warmth.
- End with one short, actionable coaching tip as the final sentence.
- Output ONLY the paragraph. No headers, no bullet points, no labels.`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const summary = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

    return new Response(JSON.stringify({ summary, stats }), {
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (err) {
    console.error('[generate-driver-summary] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...cors } },
    );
  }
});
