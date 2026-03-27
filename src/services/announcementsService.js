import { collection, getDocs, query, orderBy, limit, db } from '../config/firestore';
import { isFirebaseReady } from '../config/firebase';
import { DEFAULT_ANNOUNCEMENTS } from '../config/announcements';

/**
 * Fetch announcements. Uses Firestore if configured, else returns defaults.
 */
export async function getAnnouncements() {
  try {
    if (isFirebaseReady && db) {
      const q = query(
        collection(db, 'announcements'),
        orderBy('date', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    }
  } catch (e) {
    console.warn('Announcements fetch failed:', e.message);
  }
  return DEFAULT_ANNOUNCEMENTS;
}
