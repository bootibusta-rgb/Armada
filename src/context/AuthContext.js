import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isFirebaseReady } from '../config/firebase';
import { registerForPushNotificationsAsync, savePushToken } from '../services/notificationService';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseReady || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (demoMode) return;
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const profileRef = doc(db, 'users', firebaseUser.uid);
          const profileSnap = await getDoc(profileRef);
          setUserProfile(profileSnap.exists() ? { id: profileSnap.id, ...profileSnap.data() } : null);
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
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch (e) {}
    }
  };

  const refreshUserProfile = async () => {
    if (demoMode && userProfile) return; // Demo: update via setUserProfile
    if (!isFirebaseReady || !auth?.currentUser) return;
    try {
      const profileRef = doc(db, 'users', auth.currentUser.uid);
      const profileSnap = await getDoc(profileRef);
      setUserProfile(profileSnap.exists() ? { id: profileSnap.id, ...profileSnap.data() } : null);
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
