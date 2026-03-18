import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { updatePresence } from '../services/emergencyContactsService';

/**
 * Updates user's lastSeen in Firestore when app is active (for emergency contact online status)
 */
export default function PresenceUpdater({ userId }) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => updatePresence(userId), 60 * 1000); // every min
    updatePresence(userId);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') updatePresence(userId);
    });
    return () => {
      clearInterval(interval);
      sub?.remove?.();
    };
  }, [userId]);

  return null;
}
