/**
 * profileService — thin Supabase wrappers for profile operations.
 *
 * Existing inline callers (for context when auditing):
 *   AuthContext           – profiles SELECT on login
 *   Driver HomeScreen     – current_lat/lng UPDATE, is_online UPDATE
 *   Passenger HomeScreen  – saved_cards UPDATE
 *   Onboarding screens    – profiles INSERT
 *   admin-drivers/admin-passengers Edge Functions – SELECT via service role
 */

import { supabase } from '../lib/supabase';

/** Pushes the driver's GPS coordinates to the database. */
export async function updateDriverLocation(driverId, lat, lng) {
  const { error } = await supabase
    .from('profiles')
    .update({ current_lat: lat, current_lng: lng })
    .eq('id', driverId);
  if (error) throw error;
}

/** Sets the driver's online/offline flag.
 *  Clears coordinates on offline so stale markers don't appear to passengers. */
export async function setDriverOnline(driverId, isOnline) {
  const { error } = await supabase
    .from('profiles')
    .update({
      is_online: isOnline,
      ...(!isOnline ? { current_lat: null, current_lng: null } : {}),
    })
    .eq('id', driverId);
  if (error) throw error;
}

/** Fetches a single profile row by user ID. */
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}
