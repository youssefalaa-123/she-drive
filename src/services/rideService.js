/**
 * rideService — thin Supabase wrappers for ride operations.
 *
 * All raw `supabase.from('rides')` calls in screens should migrate here over
 * time. New features must call these functions instead of inlining queries.
 *
 * Existing inline calls (for context when auditing):
 *   Passenger HomeScreen  – ride insert, status listener, bid-driver fetch
 *   Passenger ActiveRideScreen – ride UPDATE (accept, arrived, in_progress)
 *   Driver    HomeScreen  – active-ride recovery check, bid watch
 *   Driver    ActiveTripScreen – ride UPDATE (arrived → in_progress → completed)
 */

import { supabase } from '../lib/supabase';

const ACTIVE_STATUSES = ['searching', 'bidding', 'accepted', 'arrived', 'in_progress'];

/** Returns the single active ride for a passenger, or null. */
export async function getActivePassengerRide(passengerId) {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('passenger_id', passengerId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Returns the single active ride assigned to a driver, or null. */
export async function getActiveDriverRide(driverId) {
  const { data, error } = await supabase
    .from('rides')
    .select('id, status')
    .eq('driver_id', driverId)
    .in('status', ['accepted', 'arrived', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Fetches a single ride by ID with all columns. */
export async function getRideById(rideId) {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('id', rideId)
    .single();
  if (error) throw error;
  return data;
}

/** Cancels a ride. Rejects all pending bids first. */
export async function cancelRide(rideId, passengerId) {
  const { data: pendingBids } = await supabase
    .from('bids')
    .select('driver_id')
    .eq('ride_id', rideId)
    .eq('status', 'pending');

  if (pendingBids?.length) {
    await Promise.all(
      pendingBids.map(b =>
        supabase.rpc('reject_bid', {
          p_ride_id:    rideId,
          p_driver_id:  b.driver_id,
          p_passenger_id: passengerId,
        })
      )
    );
  }

  const { error } = await supabase
    .from('rides')
    .update({ status: 'cancelled' })
    .eq('id', rideId);
  if (error) throw error;
}
