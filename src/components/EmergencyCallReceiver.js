import React, { useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { subscribeToIncomingEmergency, updateEmergencyCallStatus } from '../services/emergencyService';
import { navigate } from '../navigation/navigationRef';

/**
 * Listens for incoming emergency calls via Firestore onSnapshot.
 * When contact receives emergency, shows alert with Video call, Call back, Open location.
 */
export default function EmergencyCallReceiver() {
  const { userProfile } = useAuth();

  useEffect(() => {
    if (!userProfile?.id) return;
    const unsub = subscribeToIncomingEmergency(userProfile.id, (call) => {
      const fromName = call.fromName || 'Someone';
      const loc = call.lat && call.lng ? `https://maps.google.com/?q=${call.lat},${call.lng}` : '';
      const buttons = [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'Video call',
          onPress: async () => {
            try {
              await updateEmergencyCallStatus(call.id, 'video-call-requested');
              navigate('EmergencyVideoCall', {
                callId: call.id,
                isCaller: true,
                fromUid: call.fromUid,
                fromName: call.fromName,
                toUid: call.toUid,
                toName: userProfile?.name || 'You',
              });
            } catch (e) {
              Alert.alert('Error', 'Could not start video call. Try phone call.');
            }
          },
        },
        {
          text: 'Call back',
          onPress: () => call.fromPhone && Linking.openURL(`tel:${call.fromPhone}`),
        },
        {
          text: 'Open location',
          onPress: () => loc && Linking.openURL(loc),
        },
      ];
      Alert.alert(
        'Emergency - Incoming',
        `${fromName} needs help on their Armada ride.${loc ? '\n\nTap "Open location" to track them.' : ''}`,
        buttons
      );
    });
    return unsub;
  }, [userProfile?.id]);

  return null;
}
