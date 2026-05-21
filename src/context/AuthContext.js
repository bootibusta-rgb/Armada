import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, isFirebaseReady } from '../config/firebase';
import {
  getUserProfile,
  signOut as authSignOut,
  useNativeAuth,
  roleListFromProfile,
} from '../services/authService';
import { registerForPushNotificationsAsync, savePushToken } from '../services/notificationService';
import { ensureFirebaseJsAuthForCallables } from '../utils/ensureFirebaseJsAuthForCallables';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const PROFILE_LOAD_RETRY_MS = [0, 450, 900];

async function getUserProfileWithRetries(uid) {
  let lastErr;
  for (let i = 0; i < PROFILE_LOAD_RETRY_MS.length; i += 1) {
    const wait = PROFILE_LOAD_RETRY_MS[i];
    if (wait > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      return await getUserProfile(uid);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (useNativeAuth) {
      const { onAuthStateChanged: rnOnAuthStateChanged } = require('@react-native-firebase/auth');
      const { getNativeAuth } = require('../config/rnFirebaseAuth');
      const rnAuth = getNativeAuth();
      const unsubscribe = rnOnAuthStateChanged(rnAuth, async (firebaseUser) => {
        setUser(firebaseUser);
        if (firebaseUser) {
          try {
            if (isFirebaseReady && auth) {
              try {
                await ensureFirebaseJsAuthForCallables();
              } catch (syncErr) {
                console.warn('[Auth] JS token sync failed; continuing with native session', syncErr?.message || syncErr);
              }
            }
            const profile = await getUserProfileWithRetries(firebaseUser.uid);
            setUserProfile(profile);
            const token = await registerForPushNotificationsAsync();
            if (token) savePushToken(firebaseUser.uid, token);
          } catch (e) {
            setUserProfile(null);
          }
        } else {
          setUserProfile(null);
        }
        setLoading(false);
      });
      return unsubscribe;
    }
    if (!isFirebaseReady || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const profile = await getUserProfileWithRetries(firebaseUser.uid);
          setUserProfile(profile);
          const token = await registerForPushNotificationsAsync();
          if (token) savePushToken(firebaseUser.uid, token);
        } catch (e) {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /** Re-sync modular auth after PayPal / browser or OS resume — keeps callables authenticated. */
  useEffect(() => {
    if (!useNativeAuth) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        ensureFirebaseJsAuthForCallables().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  /** Refresh Expo push token when app returns to foreground (token can rotate; fixes missing lock-screen alerts). */
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const uid = user?.uid;
      if (!uid) return;
      registerForPushNotificationsAsync()
        .then((token) => {
          if (token) savePushToken(uid, token);
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, [user?.uid]);

  const logout = async () => {
    setUserProfile(null);
    setUser(null);
    try {
      await authSignOut();
    } catch (e) {}
  };

  const refreshUserProfile = useCallback(async () => {
    let uid = auth?.currentUser?.uid;
    if (useNativeAuth) {
      try {
        const { getNativeAuth } = require('../config/rnFirebaseAuth');
        uid = getNativeAuth().currentUser?.uid;
      } catch (e) {}
    }
    if (!uid) return undefined;
    try {
      const profile = await getUserProfileWithRetries(uid);
      setUserProfile(profile);
      return profile;
    } catch (e) {
      return undefined;
    }
  }, []);

  /** Switch active app mode when the user has multiple roles (rider, driver, vendor, car rental). */
  const switchRole = async (newRole) => {
    if (!userProfile || newRole === userProfile?.role) return;
    const roles = roleListFromProfile(userProfile);
    if (!roles.includes(newRole)) return;
    const allowed = ['rider', 'driver', 'vendor', 'carRental', 'corporate'];
    if (!allowed.includes(newRole)) return;
    const updated = { ...userProfile, role: newRole };
    setUserProfile(updated);
    try {
      let uid = user?.uid || auth?.currentUser?.uid;
      if (useNativeAuth) {
        try {
          const { getNativeAuth } = require('../config/rnFirebaseAuth');
          uid = getNativeAuth().currentUser?.uid;
        } catch (e) {}
      }
      if (uid) await import('../services/authService').then((m) => m.updateUserProfile(uid, { role: newRole }));
    } catch (e) {}
  };

  const value = {
    user,
    userProfile,
    loading,
    setUserProfile,
    logout,
    refreshUserProfile,
    switchRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
