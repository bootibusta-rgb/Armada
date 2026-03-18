import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseReady } from '../config/firebase';

export const getVendorMenu = async (vendorId) => {
  if (!isFirebaseReady || !db || !vendorId) return [];
  const snap = await getDoc(doc(db, 'users', vendorId));
  const data = snap.data();
  const menu = data?.menu;
  if (Array.isArray(menu)) return menu;
  const legacyItems = data?.items;
  if (Array.isArray(legacyItems)) {
    return legacyItems.map((name, i) => ({
      id: `legacy-${i}`,
      name: typeof name === 'string' ? name : name?.name || 'Item',
      price: typeof name === 'object' && name?.price != null ? name.price : 0,
    }));
  }
  return [];
};

export const updateVendorMenu = async (vendorId, menu) => {
  if (!isFirebaseReady || !db) throw new Error('Firebase not configured');
  const userRef = doc(db, 'users', vendorId);
  const menuWithIds = menu.map((item) => ({
    id: item.id || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: String(item.name || '').trim(),
    price: Math.max(0, parseInt(item.price, 10) || 0),
  })).filter((item) => item.name);
  await updateDoc(userRef, {
    menu: menuWithIds,
    items: menuWithIds.map((m) => m.name),
    updatedAt: serverTimestamp(),
  });
  return menuWithIds;
};

export const addMenuItem = async (vendorId, name, price) => {
  const menu = await getVendorMenu(vendorId);
  const newItem = {
    id: `item-${Date.now()}`,
    name: String(name || '').trim(),
    price: Math.max(0, parseInt(price, 10) || 0),
  };
  if (!newItem.name) throw new Error('Item name is required');
  const updated = [...menu, newItem];
  await updateVendorMenu(vendorId, updated);
  return updated;
};

export const updateMenuItem = async (vendorId, itemId, updates) => {
  const menu = await getVendorMenu(vendorId);
  const idx = menu.findIndex((m) => m.id === itemId);
  if (idx < 0) throw new Error('Item not found');
  const updated = [...menu];
  updated[idx] = {
    ...updated[idx],
    name: updates.name != null ? String(updates.name).trim() : updated[idx].name,
    price: updates.price != null ? Math.max(0, parseInt(updates.price, 10) || 0) : updated[idx].price,
  };
  if (!updated[idx].name) throw new Error('Item name is required');
  await updateVendorMenu(vendorId, updated);
  return updated;
};

export const removeMenuItem = async (vendorId, itemId) => {
  const menu = await getVendorMenu(vendorId);
  const updated = menu.filter((m) => m.id !== itemId);
  await updateVendorMenu(vendorId, updated);
  return updated;
};
