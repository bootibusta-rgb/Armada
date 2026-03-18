import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';

const VENDOR_PIN_COLORS = ['orange', 'purple', 'red', 'green', 'blue'];

const toMenu = (data) => {
  const menu = data?.menu;
  if (Array.isArray(menu) && menu.length > 0) {
    return menu.map((m) => ({
      id: m.id || m.name,
      name: m.name || 'Item',
      price: typeof m.price === 'number' ? m.price : parseInt(m.price, 10) || 0,
    }));
  }
  const items = data?.items;
  if (Array.isArray(items)) {
    return items.map((name, i) => ({
      id: `legacy-${i}`,
      name: typeof name === 'string' ? name : name?.name || 'Item',
      price: typeof name === 'object' && name?.price != null ? name.price : 0,
    }));
  }
  return [];
};

const toVendor = (d, i) => {
  const data = d.data();
  const menu = toMenu(data);
  return {
    id: data.vendorId || d.id,
    uid: d.id,
    name: data.name || 'Vendor',
    lat: typeof data.lat === 'number' ? data.lat : parseFloat(data.lat) || 18.007,
    lng: typeof data.lng === 'number' ? data.lng : parseFloat(data.lng) || -76.782,
    menu,
    items: menu.map((m) => m.name),
    pinColor: VENDOR_PIN_COLORS[i % VENDOR_PIN_COLORS.length],
  };
};

export const getRegisteredVendors = async () => {
  if (!isFirebaseReady || !db) return [];
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('role', '==', 'vendor'));
  const snap = await getDocs(q);
  return snap.docs
    .filter((d) => {
      const data = d.data();
      return data.lat != null && data.lng != null && !Number.isNaN(parseFloat(data.lat)) && !Number.isNaN(parseFloat(data.lng));
    })
    .map((d, i) => toVendor(d, i));
};

export const subscribeToVendors = (callback) => {
  if (!isFirebaseReady || !db) return () => {};
  const usersRef = collection(db, 'users');
  const q = query(usersRef, where('role', '==', 'vendor'));
  return onSnapshot(q, (snap) => {
    const vendors = snap.docs
      .filter((d) => {
        const data = d.data();
        return data.lat != null && data.lng != null && !Number.isNaN(parseFloat(data.lat)) && !Number.isNaN(parseFloat(data.lng));
      })
      .map((d, i) => toVendor(d, i));
    callback(vendors);
  });
};
