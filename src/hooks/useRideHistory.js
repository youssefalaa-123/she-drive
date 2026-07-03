import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useRideHistory(uid, role = 'passenger') {
  const column = role === 'driver' ? 'driver_id' : 'passenger_id';
  return useQuery({
    queryKey: ['ride_history', uid, role],
    queryFn: async () => {
      if (!uid) return [];
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq(column, uid)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!uid,
  });
}

export function useRideSummary(rideId) {
  return useQuery({
    queryKey: ['ride', rideId],
    queryFn: async () => {
      if (!rideId) return null;
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq('id', rideId)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data ?? null;
    },
    enabled: !!rideId,
  });
}
