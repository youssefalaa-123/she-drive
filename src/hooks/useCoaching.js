import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { auth } from '../firebase/config';

async function getFirebaseToken() {
  try {
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch (_) {
    return null;
  }
}

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coaching'] });
    },
  });
}

// Call the Edge Function to generate a new coaching message
export async function generateCoachingMessage(passengerId) {
  try {
    const token = await getFirebaseToken();
    if (!token) return null;
    const { data } = await supabase.functions.invoke('generate-coaching', {
      body: { passenger_id: passengerId },
      headers: { 'x-firebase-token': `Bearer ${token}` },
    });
    return data;
  } catch (_) {
    return null;
  }
}
