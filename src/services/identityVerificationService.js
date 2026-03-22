/**
 * Upload government ID image during signup (path matches selected idType).
 */
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, isFirebaseReady } from '../config/firebase';

export const uploadUserIdDocument = async (userId, idType, uri) => {
  if (!isFirebaseReady || !storage || !userId || !uri) {
    throw new Error('Firebase not configured or missing file');
  }
  const safeType = String(idType || 'id').replace(/[^a-z0-9_]/gi, '_');
  const filename = `id_verification/${userId}/${safeType}_${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);
  const response = await fetch(uri);
  const blob = await response.blob();
  await uploadBytesResumable(storageRef, blob);
  return getDownloadURL(storageRef);
};

/** Upload selfie with ID in hand (face + ID visible). */
export const uploadUserSelfieWithId = async (userId, uri) => {
  if (!isFirebaseReady || !storage || !userId || !uri) {
    throw new Error('Firebase not configured or missing file');
  }
  const filename = `id_verification/${userId}/selfie_with_id_${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);
  const response = await fetch(uri);
  const blob = await response.blob();
  await uploadBytesResumable(storageRef, blob);
  return getDownloadURL(storageRef);
};
