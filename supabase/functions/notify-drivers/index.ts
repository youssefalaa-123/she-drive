// notify-drivers — sends Web Push notifications to all eligible drivers
// when a new ride request comes in via Supabase database webhook.
//
// Required secrets (supabase secrets set):
//   VAPID_PUBLIC_KEY   — from npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY  — from npx web-push generate-vapid-keys
//   WEBHOOK_SECRET     — any random string; set same value in the DB webhook header
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-provided

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

webpush.setVapidDetails(
  'mailto:shedrive.eg.app@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

const db = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  // Validate webhook secret
  const auth = req.headers.get('Authorization') ?? '';
  if (WEBHOOK_SECRET && auth !== `Bearer ${WEBHOOK_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Only handle new ride inserts with status = pending
  if (body.type !== 'INSERT' || body.table !== 'rides') {
    return new Response('OK');
  }
  const ride = body.record as Record<string, unknown>;
  if (!ride || ride.status !== 'pending') {
    return new Response('OK');
  }

  // Fetch all eligible drivers (approved + car license approved + has push subscription)
  const { data: drivers, error } = await db
    .from('profiles')
    .select('id, push_subscription')
    .eq('role', 'driver')
    .eq('approved', true)
    .eq('car_license_approved', true)
    .not('push_subscription', 'is', null);

  if (error) {
    console.error('Failed to fetch drivers:', error.message);
    return new Response('Error', { status: 500 });
  }

  const payload = JSON.stringify({
    title: '🚗 طلب رحلة جديد!',
    body: 'يوجد راكبة تنتظر — اضغطي بسرعة للقبول!',
    url: 'https://www.shedrivegypt.com',
  });

  const staleIds: string[] = [];

  await Promise.allSettled(
    (drivers ?? []).map(async (driver) => {
      try {
        await webpush.sendNotification(driver.push_subscription, payload);
      } catch (err: unknown) {
        // HTTP 410 = subscription expired / unsubscribed — clean it up
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          staleIds.push(driver.id);
        } else {
          console.warn(`Push failed for ${driver.id}:`, (err as Error).message);
        }
      }
    })
  );

  // Remove stale subscriptions in one batch
  if (staleIds.length > 0) {
    await db
      .from('profiles')
      .update({ push_subscription: null })
      .in('id', staleIds);
  }

  return new Response(
    JSON.stringify({ notified: (drivers ?? []).length - staleIds.length, stale: staleIds.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
