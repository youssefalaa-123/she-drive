import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDriverReviews(driverId, limit = 5) {
  return useQuery({
    queryKey: ['driver_reviews', driverId],
    queryFn: async () => {
      if (!driverId) return [];
      const { data, error } = await supabase
        .from('reviews')
        .select('rating, comment, passenger_name, created_at')
        .eq('driver_id', driverId)
        .not('comment', 'is', null)
        .neq('comment', '')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!driverId,
    staleTime: 1000 * 60 * 5,
  });
}
