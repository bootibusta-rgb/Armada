import { ref, push, onChildAdded } from 'firebase/database';
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
