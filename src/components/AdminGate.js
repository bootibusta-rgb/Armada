import React, { useRef } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { navigate } from '../navigation/navigationRef';
import { useTheme } from '../context/ThemeContext';

const TAP_COUNT = 5;

export default function AdminGate() {
  const { theme } = useTheme();
  const tapCount = useRef(0);
  const timeout = useRef(null);

  const handlePress = () => {
    tapCount.current += 1;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => { tapCount.current = 0; }, 2000);
    if (tapCount.current >= TAP_COUNT) {
      tapCount.current = 0;
      navigate('Admin');
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1}>
      <Text style={[styles.title, { color: theme.colors.onPrimary }]}>Armada</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: 'bold' },
});
