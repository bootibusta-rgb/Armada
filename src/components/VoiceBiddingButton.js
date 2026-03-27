import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Modal,
  View,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { useTheme } from '../context/ThemeContext';

export default function VoiceBiddingButton({ onResult }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const [showInputModal, setShowInputModal] = useState(false);
  const [spokenBid, setSpokenBid] = useState('');

  const handlePress = async () => {
    if (recorderState.isRecording) {
      try {
        await audioRecorder.stop();
      } catch (e) {
        /* ignore */
      }
      setShowInputModal(true);
      return;
    }
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission', 'Microphone access needed for voice bidding');
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      Alert.alert('Error', 'Could not start recording. Enter bid manually.');
    }
  };

  const handleSubmitBid = () => {
    const val = spokenBid.trim();
    if (val && !isNaN(parseInt(val, 10))) {
      onResult?.(val);
      setSpokenBid('');
      setShowInputModal(false);
    } else {
      Alert.alert('Invalid', 'Enter a valid bid amount (J$)');
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, recorderState.isRecording && styles.recording]}
        onPress={handlePress}
      >
        <Ionicons name="mic" size={24} color={theme.colors.onPrimary} />
        <Text style={styles.text}>{recorderState.isRecording ? 'Tap to stop' : 'Voice bid'}</Text>
      </TouchableOpacity>
      <Modal visible={showInputModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowInputModal(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Enter your bid</Text>
            <Text style={styles.modalSub}>
              Voice recorded. Enter amount (J$) – or connect Google Cloud Speech-to-Text for auto conversion.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1500"
              value={spokenBid}
              onChangeText={setSpokenBid}
              keyboardType="number-pad"
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowInputModal(false); setSpokenBid(''); }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitBid}>
                <Text style={styles.submitText}>Use bid</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const createStyles = (theme) => StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primaryLight,
    padding: 12,
    borderRadius: 12,
  },
  recording: { backgroundColor: theme.colors.accent },
  text: { color: theme.colors.onPrimary, fontWeight: 'bold' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: theme.colors.white, padding: 24, borderRadius: 16, borderWidth: 2, borderColor: theme.colors.primaryLight },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  modalSub: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  input: { borderWidth: 2, borderColor: theme.colors.primaryLight, borderRadius: 12, padding: 14, fontSize: 18, marginBottom: 16 },
  modalRow: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center' },
  cancelText: { color: theme.colors.textSecondary, fontWeight: 'bold' },
  submitBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center' },
  submitText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
});
