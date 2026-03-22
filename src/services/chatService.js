import { ref, push, onChildAdded, set } from 'firebase/database';
import { realtimeDb } from '../config/firebase';

export const sendChatMessage = (rideId, message) => {
  const chatRef = ref(realtimeDb, `chats/${rideId}/messages`);
  return push(chatRef, {
    ...message,
    timestamp: Date.now(),
  });
};

export const subscribeToChat = (rideId, callback) => {
  const chatRef = ref(realtimeDb, `chats/${rideId}/messages`);
  return onChildAdded(chatRef, (snap) => {
    callback({ id: snap.key, ...snap.val() });
  });
};

/** Car rental request threads (rider ↔ owner) */
export const ensureRentalChatParticipants = async (requestId, riderId, ownerId) => {
  if (!realtimeDb || !requestId || !riderId || !ownerId) return Promise.resolve();
  const pRef = ref(realtimeDb, `rentalChats/${requestId}/_participants`);
  await set(pRef, { riderId, ownerId });
};

export const sendRentalChatMessage = (requestId, message) => {
  const chatRef = ref(realtimeDb, `rentalChats/${requestId}/messages`);
  return push(chatRef, {
    ...message,
    timestamp: Date.now(),
  });
};

export const subscribeToRentalChat = (requestId, callback) => {
  const chatRef = ref(realtimeDb, `rentalChats/${requestId}/messages`);
  return onChildAdded(chatRef, (snap) => {
    callback({ id: snap.key, ...snap.val() });
  });
};
