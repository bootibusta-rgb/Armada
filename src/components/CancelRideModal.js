/**
 * Modal for cancelling a ride with reason selection.
 * Rider reasons: Driver late, Changed mind, Wrong pickup, Other
 * Driver reasons: Rider no-show, Safety concern, Other
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export const RIDER_CANCEL_REASONS = [
  { id: 'driver_late', label: 'Driver late' },
  { id: 'changed_mind', label: 'Changed mind' },
  { id: 'wrong_pickup', label: 'Wrong pickup' },
  { id: 'other', label: 'Other' },
];

export const DRIVER_CANCEL_REASONS = [
  { id: 'rider_no_show', label: 'Rider no-show' },
  { id: 'safety_concern', label: 'Safety concern' },
  { id: 'other', label: 'Other' },
];

export default function CancelRideModal({ visible, onCancel, onConfirm, isDriver }) {
  const { theme } = useTheme();
  const [reason, setReason] = useState(null);
  const reasons = isDriver ? DRIVER_CANCEL_REASONS : RIDER_CANCEL_REASONS;
  const styles = createStyles(theme);

  const handleConfirm = () => {
    if (!reason) return;
    onConfirm(reason);
    setReason(null);
  };

  const handleClose = () => {
    setReason(null);
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose}>
        <View style={styles.content} onStartShouldSetResponder={() => true}>
          <Text style={styles.title}>Cancel ride</Text>
          <Text style={styles.subtitle}>Why are you cancelling? (helps us improve)</Text>
          {reasons.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.option, reason === r.id && styles.optionActive]}
              onPress={() => setReason(r.id)}
            >
              <Text style={[styles.optionText, { color: reason === r.id ? theme.colors.onPrimary : theme.colors.text }]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelText}>Keep ride</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !reason && styles.confirmDisabled]}
              onPress={handleConfirm}
              disabled={!reason}
            >
              <Text style={styles.confirmText}>Cancel ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  option: {
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  optionActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  optionText: { fontSize: 16 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center', borderWidth: 2, borderColor: theme.colors.primaryLight },
  cancelText: { color: theme.colors.textSecondary, fontWeight: '600' },
  confirmBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.error, alignItems: 'center' },
  confirmDisabled: { opacity: 0.5 },
  confirmText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
});
