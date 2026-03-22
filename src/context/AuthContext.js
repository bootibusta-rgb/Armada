import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions, isFirebaseReady } from '../config/firebase';
import { getUserProfile, signOut as authSignOut, useNativeAuth } from '../services/authService';
import { registerForPushNotificationsAsync, savePushToken } from '../services/notificationService';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (useNativeAuth) {
      const { getAuth, onAuthStateChanged } = require('@react-native-firebase/auth');
      const rnAuth = getAuth();
      const unsubscribe = onAuthStateChanged(rnAuth, async (firebaseUser) => {
        if (demoMode) return;
        setUser(firebaseUser);
        if (firebaseUser) {
          try {
            // Sync RNFB auth to Firebase JS SDK so Firestore has permissions
            if (isFirebaseReady && functions) {
              const idToken = await firebaseUser.getIdToken();
              const getCustomToken = httpsCallable(functions, 'getCustomToken');
              const { data } = await getCustomToken({ idToken });
              if (data?.customToken) {
                await signInWithCustomToken(auth, data.customToken);
              }
            }
            const profile = await getUserProfile(firebaseUser.uid);
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
      if (demoMode) return;
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const profile = await getUserProfile(firebaseUser.uid);
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
  }, [demoMode]);

  const loginDemo = (profile) => {
    setDemoMode(true);
    setUserProfile(profile);
    setLoading(false);
  };

  const logout = async () => {
    setDemoMode(false);
    setUserProfile(null);
    setUser(null);
    try {
      await authSignOut();
    } catch (e) {}
  };

  const refreshUserProfile = async () => {
    if (demoMode && userProfile) return;
    let uid = auth?.currentUser?.uid;
    if (useNativeAuth) {
      try {
        const { getAuth } = require('@react-native-firebase/auth');
        uid = getAuth().currentUser?.uid;
      } catch (e) {}
    }
    if (!uid) return;
    try {
      const profile = await getUserProfile(uid);
      setUserProfile(profile);
    } catch (e) {}
  };

  /** Switch active role between rider and driver when user is verified in both. */
  const switchRole = async (newRole) => {
    if (!userProfile || newRole === userProfile?.role) return;
    const roles = userProfile?.roles || (userProfile?.role ? [userProfile.role] : []);
    if (!roles.includes(newRole)) return;
    if (newRole !== 'rider' && newRole !== 'driver') return;
    const updated = { ...userProfile, role: newRole };
    setUserProfile(updated);
    try {
      let uid = user?.uid || auth?.currentUser?.uid;
      if (useNativeAuth) {
        try {
          const { getAuth } = require('@react-native-firebase/auth');
          uid = getAuth().currentUser?.uid;
        } catch (e) {}
      }
      if (uid) await import('../services/authService').then((m) => m.updateUserProfile(uid, { role: newRole }));
    } catch (e) {}
  };

  const value = {
    user,
    userProfile,
    loading,
    demoMode,
    setUserProfile,
    loginDemo,
    logout,
    refreshUserProfile,
    switchRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
