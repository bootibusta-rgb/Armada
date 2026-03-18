import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const ID_TYPES = [
  { id: 'passport', label: 'Passport' },
  { id: 'drivers_license', label: "Driver's License" },
  { id: 'national_id', label: 'National ID / TRN' },
];

export default function IdVerificationSection({
  idType,
  setIdType,
  idNumber,
  setIdNumber,
  idExpiry,
  setIdExpiry,
  showExpiry = false,
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>ID Verification *</Text>
      <Text style={styles.sectionHint}>Verify your identity to use Armada</Text>
      <View style={styles.typeRow}>
        {ID_TYPES.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[styles.typeBtn, idType === t.id && styles.typeBtnActive]}
            onPress={() => setIdType(t.id)}
          >
            <Text style={[styles.typeBtnText, idType === t.id && styles.typeBtnTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="ID / Passport / License number *"
        value={idNumber}
        onChangeText={setIdNumber}
        placeholderTextColor={theme.colors.textSecondary}
        autoCapitalize="characters"
      />
      {showExpiry && (
        <TextInput
          style={styles.input}
          placeholder="License expiry (e.g. 2026-12)"
          value={idExpiry}
          onChangeText={setIdExpiry}
          placeholderTextColor={theme.colors.textSecondary}
        />
      )}
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 12 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  typeBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '20' },
  typeBtnText: { fontSize: 13, color: theme.colors.textSecondary },
  typeBtnTextActive: { color: theme.colors.primary, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
});
