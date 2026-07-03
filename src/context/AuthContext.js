import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileUnsub = null;
    let profileTimeout = null;

    const authUnsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }
      if (profileTimeout) { clearTimeout(profileTimeout); profileTimeout = null; }

      if (firebaseUser) {
        setUser(firebaseUser);
        setUserProfile(null); // clear stale profile while loading new one

        profileUnsub = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            if (snap.exists()) {
              setUserProfile({ uid: firebaseUser.uid, ...snap.data() });
              setLoading(false);
              if (profileTimeout) clearTimeout(profileTimeout);
            }
            // If doc doesn't exist yet (race with setDoc during registration),
            // stay in loading state until the snapshot fires again with data.
          },
          (_err) => {
            // Firestore error (e.g. not configured) — unblock the UI
            setLoading(false);
          }
        );

        // Safety valve: never block the UI forever
        profileTimeout = setTimeout(() => setLoading(false), 8000);
      } else {
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    },
    (_err) => {
      // Auth error (e.g. Firebase not configured)
      setLoading(false);
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
      if (profileTimeout) clearTimeout(profileTimeout);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userProfile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
