import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useProfile(uid) {
  return useQuery({
    queryKey: ['profile', uid],
    queryFn: async () => {
      if (!uid) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
      return data ?? null;
    },
    enabled: !!uid,
  });
}

export function useUpsertProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profile) => {
      const { error } = await supabase
        .from('profiles')
        .upsert(profile, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: (_, profile) => {
      qc.invalidateQueries({ queryKey: ['profile', profile.id] });
    },
  });
}
