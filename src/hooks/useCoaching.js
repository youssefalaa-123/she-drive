import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = 'https://loymslushwxzfkewereb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IyUrUd774Phi68T01DLLqw_f-Hc1v7j';

// Latest unseen coaching message for this passenger
export function useLatestCoaching(passengerId) {
  return useQuery({
    queryKey: ['coaching', passengerId],
    queryFn: async () => {
      if (!passengerId) return null;
      const { data } = await supabase
        .from('coaching_messages')
        .select('id, message, streak_days, created_at')
        .eq('passenger_id', passengerId)
        .eq('seen', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    enabled: !!passengerId,
    staleTime: 0,
  });
}

// Mark a coaching message as seen
export function useMarkCoachingSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (messageId) => {
      await supabase.from('coaching_messages').update({ seen: true }).eq('id', messageId);
    },
    onSuccess: (_, __, ctx) => {
      qc.invalidateQueries({ queryKey: ['coaching'] });
    },
  });
}

// Call the Edge Function to generate a new coaching message
export async function generateCoachingMessage(passengerId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-coaching`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ passenger_id: passengerId }),
    });
    return await res.json();
  } catch (_) {
    return null;
  }
}

// Call the Edge Function to generate a driver summary
export async function generateDriverSummary(driverId, periodType = 'weekly') {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-driver-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ driver_id: driverId, period_type: periodType }),
  });
  if (!res.ok) throw new Error('Failed to generate summary');
  return await res.json();
}
