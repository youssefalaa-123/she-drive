/**
 * settle-ride — server-side payment settlement for She Drive.
 *
 * Replaces the client-side wallet increment() calls in TripSummaryScreen.
 * All financial mutations run here with service-account authority, so
 * Firestore rules can block direct client writes to wallet fields.
 *
 * Required Supabase secrets (supabase secrets set --env-file .env.supabase):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_SERVICE_ACCOUNT_JSON   (Firebase Console → Service Accounts)
 *   ANTHROPIC_API_KEY               (for coaching message trigger)
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (auto-provided in Edge Functions)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyFirebaseToken, extractBearerToken } from '../_shared/firebaseAuth.ts';
import { getDoc, commitWrites, readField, Write } from '../_shared/firestoreAdmin.ts';

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

const COMMISSION_RATE = 0.15;
const CANCEL_FEE      = 10;

function splitFare(fare: number, isFirstRide: boolean) {
  const effectiveFare = isFirstRide ? fare / (1 - COMMISSION_RATE) * (1 - COMMISSION_RATE) : fare;
  const adminAmount  = Math.round(effectiveFare * COMMISSION_RATE * 100) / 100;
  const driverAmount = Math.round((effectiveFare - adminAmount) * 100) / 100;
  return { adminAmount, driverAmount };
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
      status: 401, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  const caller = await verifyFirebaseToken(token);
  if (!caller) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  try {
    const { rideId, rating, comment } = await req.json();
    if (!rideId || typeof rideId !== 'string') {
      return new Response(JSON.stringify({ error: 'rideId required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // ── Load & validate ride ────────────────────────────────────────────────
    const rideFields = await getDoc(`rides/${rideId}`);
    if (!rideFields) {
      return new Response(JSON.stringify({ error: 'Ride not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const passengerId = readField(rideFields, 'passengerId') as string;
    if (passengerId !== caller.uid) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Idempotency: block double-settlement
    if (readField(rideFields, 'settledAt')) {
      return new Response(JSON.stringify({ ok: true, alreadySettled: true }), {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    const driverId      = readField(rideFields, 'driverId') as string | undefined;
    const method        = readField(rideFields, 'paymentMethod') as string;
    const estimatedFare = readField(rideFields, 'estimatedFare') as number;
    const finalFare     = (readField(rideFields, 'finalFare') as number) || estimatedFare;
    const isFirstRide   = readField(rideFields, 'isFirstRide') as boolean ?? false;
    const walletPaid    = (readField(rideFields, 'walletAmountPaid') as number) || 0;
    const cashOrCardPaid = (readField(rideFields, 'remainingAmount') as number) || 0;
    const fromAddr      = (readField(rideFields, 'from') as string) || '';
    const toAddr        = (readField(rideFields, 'to') as string) || '';
    const routeLabel    = `${fromAddr} → ${toAddr}`;

    const { adminAmount, driverAmount } = splitFare(finalFare, isFirstRide);

    // ── Load passenger for trip count / badge ──────────────────────────────
    const passengerFields = await getDoc(`users/${passengerId}`);
    const currentTrips    = (readField(passengerFields ?? {}, 'totalTrips') as number) || 0;
    const newTotal        = currentTrips + 1;
    const newBadges       = Math.floor(newTotal / 10);

    // ── Verify wallet balance hasn't dropped since booking ─────────────────
    // Protects against race conditions where another transaction depletes the
    // wallet between ride booking and settlement.
    if (walletPaid > 0) {
      const liveBalance = (readField(passengerFields ?? {}, 'wallet') as number) || 0;
      if (liveBalance < walletPaid - 0.01) {
        return new Response(JSON.stringify({ error: 'Insufficient wallet balance' }), {
          status: 402, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
    }

    // ── Build Firestore write batch ────────────────────────────────────────
    const writes: Write[] = [];
    const histId = () => crypto.randomUUID();

    // Payment settlement by method
    if (method === 'cash') {
      if (driverId) {
        writes.push({ type: 'increment', path: `users/${driverId}`, field: 'wallet', amount: -adminAmount });
        writes.push({ type: 'set', path: `users/${driverId}/walletHistory/${histId()}`, fields: { amount: -adminAmount, type: 'commission', description: `Commission (cash) · ${routeLabel}`, createdAt: new Date() } });
      }
      writes.push({ type: 'set', path: 'wallets/admin', fields: { balance: adminAmount }, merge: true });

    } else if (method === 'card') {
      if (driverId) {
        writes.push({ type: 'increment', path: `users/${driverId}`, field: 'wallet', amount: driverAmount });
        writes.push({ type: 'set', path: `users/${driverId}/walletHistory/${histId()}`, fields: { amount: driverAmount, type: 'trip_earning', description: `Trip earning (card) · ${routeLabel}`, createdAt: new Date() } });
      }
      writes.push({ type: 'set', path: 'wallets/admin', fields: { balance: adminAmount }, merge: true });

    } else if (method === 'wallet') {
      writes.push({ type: 'increment', path: `users/${passengerId}`, field: 'wallet', amount: -finalFare });
      writes.push({ type: 'set', path: `users/${passengerId}/walletHistory/${histId()}`, fields: { amount: -finalFare, type: 'ride_payment', description: `Trip payment (wallet) · ${routeLabel}`, createdAt: new Date() } });
      if (driverId) {
        writes.push({ type: 'increment', path: `users/${driverId}`, field: 'wallet', amount: driverAmount });
        writes.push({ type: 'set', path: `users/${driverId}/walletHistory/${histId()}`, fields: { amount: driverAmount, type: 'trip_earning', description: `Trip earning (wallet) · ${routeLabel}`, createdAt: new Date() } });
      }
      writes.push({ type: 'set', path: 'wallets/admin', fields: { balance: adminAmount }, merge: true });

    } else if (method === 'wallet+card') {
      writes.push({ type: 'increment', path: `users/${passengerId}`, field: 'wallet', amount: -walletPaid });
      writes.push({ type: 'set', path: `users/${passengerId}/walletHistory/${histId()}`, fields: { amount: -walletPaid, type: 'ride_payment', description: `Trip payment (wallet portion) · ${routeLabel}`, createdAt: new Date() } });
      if (driverId) {
        writes.push({ type: 'increment', path: `users/${driverId}`, field: 'wallet', amount: driverAmount });
        writes.push({ type: 'set', path: `users/${driverId}/walletHistory/${histId()}`, fields: { amount: driverAmount, type: 'trip_earning', description: `Trip earning (wallet+card) · ${routeLabel}`, createdAt: new Date() } });
      }
      writes.push({ type: 'set', path: 'wallets/admin', fields: { balance: adminAmount }, merge: true });

    } else if (method === 'wallet+cash') {
      // Booking-time validation prevents cashOrCardPaid > driverAmount (Sub-case B) for new rides.
      // Reject server-side as a safety net — prevents a crafted request from debiting a driver's wallet.
      if (driverId && cashOrCardPaid > driverAmount + 1) {
        return new Response(JSON.stringify({ error: 'Invalid wallet+cash amounts: cash exceeds driver share. Please contact support.' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      writes.push({ type: 'increment', path: `users/${passengerId}`, field: 'wallet', amount: -walletPaid });
      writes.push({ type: 'set', path: `users/${passengerId}/walletHistory/${histId()}`, fields: { amount: -walletPaid, type: 'ride_payment', description: `Trip payment (wallet portion) · ${routeLabel}`, createdAt: new Date() } });
      if (driverId && cashOrCardPaid < driverAmount - 0.01) {
        // Sub-case A: driver received less cash than their share — top up from platform
        const topUp = Math.round((driverAmount - cashOrCardPaid) * 100) / 100;
        writes.push({ type: 'increment', path: `users/${driverId}`, field: 'wallet', amount: topUp });
        writes.push({ type: 'set', path: `users/${driverId}/walletHistory/${histId()}`, fields: { amount: topUp, type: 'trip_earning', description: `Trip top-up (wallet+cash) · ${routeLabel}`, createdAt: new Date() } });
      }
      writes.push({ type: 'set', path: 'wallets/admin', fields: { balance: adminAmount }, merge: true });
    }

    // Driver rating update
    if (rating > 0 && driverId) {
      const driverFields = await getDoc(`users/${driverId}`);
      if (driverFields) {
        const prevRating = (readField(driverFields, 'rating') as number) || 0;
        const prevCount  = (readField(driverFields, 'ratingCount') as number) || 0;
        const newCount   = prevCount + 1;
        const newRating  = (prevRating * prevCount + rating) / newCount;
        writes.push({ type: 'set', path: `users/${driverId}`, fields: { rating: newRating, ratingCount: newCount }, merge: true });
      }
    }

    // Passenger trip count + badge + mark settled
    writes.push({ type: 'set', path: `users/${passengerId}`, fields: { totalTrips: newTotal, badges: newBadges }, merge: true });
    writes.push({ type: 'set', path: `rides/${rideId}`, fields: {
      passengerRating:  rating > 0 ? rating : null,
      passengerComment: comment?.trim() || null,
      finalFare,
      settledAt: new Date(),
    }, merge: true });

    await commitWrites(writes);

    // ── Supabase: upsert ride + insert review ──────────────────────────────
    await supabase.from('rides').upsert({
      id: rideId,
      passenger_id:   passengerId,
      driver_id:      driverId,
      from_address:   fromAddr,
      to_address:     toAddr,
      distance_km:    readField(rideFields, 'distanceKm') as number,
      duration_mins:  readField(rideFields, 'durationMins') as number,
      estimated_fare: estimatedFare,
      final_fare:     finalFare,
      base_fare:      readField(rideFields, 'baseFare') as number,
      card_fee:       (readField(rideFields, 'cardFee') as number) ?? 0,
      payment_method: method,
      status:         'completed',
      is_first_ride:  isFirstRide,
      driver_earnings: driverAmount,
      cancellation_fee: 0,
    }, { onConflict: 'id' });

    if (rating > 0 || comment?.trim()) {
      const passengerName = readField(passengerFields ?? {}, 'name') as string | undefined;
      await supabase.from('reviews').upsert({
        ride_id:        rideId,
        driver_id:      driverId,
        passenger_id:   passengerId,
        passenger_name: passengerName,
        rating:         rating > 0 ? rating : null,
        comment:        comment?.trim() || null,
      }, { onConflict: 'ride_id,passenger_id', ignoreDuplicates: true });
    }

    // Streak update
    const today = new Date().toISOString().split('T')[0];
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_streak, longest_streak, last_ride_date')
      .eq('id', passengerId)
      .single();
    if (profile) {
      const last = profile.last_ride_date;
      if (last !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        const newStreak = last === yesterdayStr ? (profile.current_streak ?? 0) + 1 : 1;
        const newLongest = Math.max(profile.longest_streak ?? 0, newStreak);
        await supabase.from('profiles')
          .update({ current_streak: newStreak, longest_streak: newLongest, last_ride_date: today })
          .eq('id', passengerId);
      }
    }

    return new Response(JSON.stringify({ ok: true, newTotal, newBadges }), {
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (err) {
    console.error('[settle-ride] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
});
