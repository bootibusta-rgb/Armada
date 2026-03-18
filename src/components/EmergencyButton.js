import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export default function EmergencyButton({ onPress }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Ionicons name="alert-circle" size={28} color={theme.colors.onPrimary} />
      <Text style={styles.text}>SOS</Text>
    </TouchableOpacity>
  );
}

const createStyles = (theme) => StyleSheet.create({
  button: {
    backgroundColor: theme.colors.error,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 70,
  },
  text: { color: theme.colors.onPrimary, fontWeight: 'bold', marginTop: 4 },
});
