import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const QUEUE_KEY = '@armada_offline_queue';
const LEGACY_QUEUE_KEY = '@irie_ride_queue';

async function migrateLegacyQueue() {
  try {
    const legacy = await AsyncStorage.getItem(LEGACY_QUEUE_KEY);
    if (!legacy) return;
    const current = await AsyncStorage.getItem(QUEUE_KEY);
    if (current) {
      await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
      return;
    }
    await AsyncStorage.setItem(QUEUE_KEY, legacy);
    await AsyncStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch (e) {
    /* ignore */
  }
}

export function useOfflineQueue() {
  const [isOnline, setIsOnline] = useState(true);
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    migrateLegacyQueue().then(() => {
      AsyncStorage.getItem(QUEUE_KEY).then((data) => {
        if (!data) return;
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) setQueue(parsed);
        } catch (e) {
          AsyncStorage.removeItem(QUEUE_KEY);
        }
      });
    });
  }, []);

  const addToQueue = useCallback(async (item) => {
    const newQueue = [...queue, { ...item, id: Date.now() }];
    setQueue(newQueue);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
  }, [queue]);

  const clearQueue = useCallback(async () => {
    setQueue([]);
    await AsyncStorage.removeItem(QUEUE_KEY);
  }, []);

  return { isOnline, queue, addToQueue, clearQueue };
}
