import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { toProfile } from '../lib/transforms';

const AuthContext = createContext({});

// Maximum ms to wait for the profile network request before unblocking the UI.
// On slow mobile connections the fetch may hang — this guarantees the spinner
// resolves even if the server never responds.
const PROFILE_TIMEOUT_MS = 5000;

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const channelRef = useRef(null);
  const timeoutRef = useRef(null);

  const teardownProfile = async () => {
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    clearTimeout(timeoutRef.current);
  };

  const setupProfile = async (supabaseUser) => {
    await teardownProfile();

    supabaseUser.uid = supabaseUser.id;
    setUser(supabaseUser);

    // Safety timeout is armed BEFORE the network call so that if the fetch
    // hangs forever (no signal, Safari background throttling, etc.) the
    // spinner is guaranteed to dismiss within PROFILE_TIMEOUT_MS.
    timeoutRef.current = setTimeout(() => {
      console.warn('[auth] profile fetch timed out — unblocking UI');
      setLoading(false);
    }, PROFILE_TIMEOUT_MS);

    try {
      const { data: row, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (error) console.error('[auth] profile fetch error:', error.message);
      if (row) setUserProfile(toProfile(row));
    } catch (err) {
      console.error('[auth] profile fetch threw:', err);
    } finally {
      // Clears the timeout if we got here before it fired, then unblocks the UI.
      clearTimeout(timeoutRef.current);
      setLoading(false);
    }

    // Real-time profile updates (wallet, approval status, etc.)
    // Runs after loading resolves — subscription failure never blocks the UI.
    try {
      const ch = supabase
        .channel('my-profile-' + supabaseUser.id)
        .on('postgres_changes', {
          event:  'UPDATE',
          schema: 'public',
          table:  'profiles',
          filter: `id=eq.${supabaseUser.id}`,
        }, (payload) => {
          setUserProfile(toProfile(payload.new));
        })
        .subscribe();
      channelRef.current = ch;
    } catch (err) {
      console.error('[auth] realtime subscribe error:', err);
    }
  };

  useEffect(() => {
    let cancelled = false;

    // getSession reads from AsyncStorage/localStorage — not a network call, but
    // on Safari Private Browsing storage can be restricted and throw.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          setupProfile(session.user);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[auth] getSession failed:', err);
        if (!cancelled) setLoading(false);
      });

    // IMPORTANT: this callback must NOT be async. Supabase auth-js v2 awaits all
    // onAuthStateChange callbacks via Promise.all before signInWithPassword resolves.
    // An async callback here adds PROFILE_TIMEOUT_MS (5 s) to signInWithPassword's
    // resolution time, which — combined with a slow auth request — trips the 15 s
    // outer timeout in LoginScreen. Making it synchronous breaks that dependency:
    // setupProfile runs as fire-and-forget and signInWithPassword resolves as soon
    // as the auth HTTP response arrives.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setUser(session.user);
        setRecoveryMode(true);
        setLoading(false);
        return;
      }
      if (session?.user) {
        setRecoveryMode(false);
        setupProfile(session.user); // fire-and-forget — never blocks signInWithPassword
      } else {
        setRecoveryMode(false);
        teardownProfile().then(() => {
          setUser(null);
          setUserProfile(null);
          setLoading(false);
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      teardownProfile();
    };
  }, []);

  const signOut = () => supabase.auth.signOut();
  const exitRecovery = () => setRecoveryMode(false);

  const refreshProfile = async () => {
    const currentUser = await supabase.auth.getUser();
    const uid = currentUser?.data?.user?.id;
    if (!uid) return;
    const { data: row } = await supabase.from('profiles').select('*').eq('id', uid).single();
    if (row) setUserProfile(toProfile(row));
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, signOut, recoveryMode, exitRecovery, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
