import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function OfflineBanner({ visible, showCached }) {
  const { theme } = useTheme();
  if (!visible) return null;
  return (
    <View style={[styles.banner, { backgroundColor: theme.colors.accent }]}>
      <Text style={[styles.text, { color: theme.colors.onPrimary }]}>
        {showCached ? 'No internet—showing cached rides' : 'Offline – requests will be queued'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: 8,
    alignItems: 'center',
  },
  text: { fontWeight: 'bold' },
});
