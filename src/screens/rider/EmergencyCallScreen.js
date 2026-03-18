import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { startEmergencyCall, subscribeToEmergencyCall } from '../../services/emergencyService';

/**
 * Screen shown when rider taps Emergency and contact has app.
 * Contact can video call or phone call. Rider sees "Accept video call" when contact initiates.
 */
export default function EmergencyCallScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { callId, contact, fromUser, location } = route.params || {};
  const { userProfile } = useAuth();
  const styles = createStyles(theme);
  const [status, setStatus] = useState('calling');
  const [videoCallRequested, setVideoCallRequested] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setStatus('waiting'), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!callId) return;
    const unsub = subscribeToEmergencyCall(callId, (call) => {
      if (call?.status === 'video-call-requested') setVideoCallRequested(true);
    });
    return unsub;
  }, [callId]);

  const handleVideoCall = () => {
    navigation.navigate('EmergencyVideoCall', {
      callId,
      isCaller: false,
      fromUid: contact?.uid,
      fromName: contact?.name,
      toUid: userProfile?.id,
      toName: userProfile?.name,
    });
  };

  const handleCallPhone = () => {
    startEmergencyCall(contact);
  };

  const handleCancel = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="alert-circle" size={64} color={theme.colors.error} />
        </View>
        <Text style={styles.title}>Emergency Call</Text>
        <Text style={styles.subtitle}>
          {status === 'calling'
            ? `Calling ${contact?.name || 'contact'}...`
            : videoCallRequested
            ? `${contact?.name || 'Contact'} wants to video call`
            : `Waiting for ${contact?.name || 'contact'} to answer`}
        </Text>
        {videoCallRequested && (
          <TouchableOpacity style={styles.videoBtn} onPress={handleVideoCall}>
            <Ionicons name="videocam" size={24} color={theme.colors.onPrimary} />
            <Text style={styles.videoBtnText}>Accept video call</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.hint}>
          If they don't answer in app, tap below to call their phone directly.
        </Text>
        <TouchableOpacity style={styles.callBtn} onPress={handleCallPhone}>
          <Ionicons name="call" size={24} color={theme.colors.white} />
          <Text style={styles.callBtnText}>Call {contact?.name || contact?.phone}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  iconWrap: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: theme.colors.error, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, color: theme.colors.text, textAlign: 'center', marginBottom: 12 },
  hint: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  videoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  videoBtnText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.success,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  callBtnText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  cancelBtn: { alignItems: 'center', padding: 12 },
  cancelText: { color: theme.colors.textSecondary, fontSize: 16 },
});
