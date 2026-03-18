import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'armada_route_history';
const MAX = 10;

export async function getRouteHistory(userId) {
  try {
    const raw = await AsyncStorage.getItem(`${KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export async function addRoute(userId, pickup, dropoff) {
  if (!pickup?.trim() || !dropoff?.trim()) return;
  const list = await getRouteHistory(userId);
  const entry = { pickup: pickup.trim(), dropoff: dropoff.trim(), at: Date.now() };
  const filtered = list.filter((r) => !(r.pickup === entry.pickup && r.dropoff === entry.dropoff));
  const next = [entry, ...filtered].slice(0, MAX);
  await AsyncStorage.setItem(`${KEY}_${userId}`, JSON.stringify(next));
  return next;
}
