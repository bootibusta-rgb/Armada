/**
 * Offline cache - stores last 5 routes + favs for offline fallback.
 * Route history and favs are already in AsyncStorage; this provides a unified cache layer.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRouteHistory } from './routeHistoryService';

const CACHE_KEY = 'armada_offline_cache';
const MAX_ROUTES = 5;

export async function getCachedRoutes(userId) {
  try {
    const list = await getRouteHistory(userId);
    return list.slice(0, MAX_ROUTES);
  } catch (_) {
    return [];
  }
}

export async function getCachedFavourites(userId) {
  try {
    const raw = await AsyncStorage.getItem(`armada_favourite_drivers_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}
