import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'armada_favourite_drivers';

export async function getFavouriteDrivers(userId) {
  try {
    const raw = await AsyncStorage.getItem(`${KEY}_${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export async function addFavouriteDriver(userId, driver) {
  const list = await getFavouriteDrivers(userId);
  if (list.some((d) => d.id === driver.id)) return list;
  const next = [...list, { id: driver.id, name: driver.name, rating: driver.rating }];
  await AsyncStorage.setItem(`${KEY}_${userId}`, JSON.stringify(next));
  return next;
}

export async function removeFavouriteDriver(userId, driverId) {
  const list = (await getFavouriteDrivers(userId)).filter((d) => d.id !== driverId);
  await AsyncStorage.setItem(`${KEY}_${userId}`, JSON.stringify(list));
  return list;
}

export async function isFavourite(userId, driverId) {
  const list = await getFavouriteDrivers(userId);
  return list.some((d) => d.id === driverId);
}
