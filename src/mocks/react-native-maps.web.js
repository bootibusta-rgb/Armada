/**
 * Web mock for react-native-maps. Maps don't work on web - this prevents
 * the "codegenNativeCommands" bundling error. Shows a placeholder instead.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Placeholder MapView - shows message on web
const MapView = ({ style, children, ...props }) => (
  <View style={[styles.placeholder, style]}>
    <Text style={styles.text}>Map (native only)</Text>
    <Text style={styles.sub}>Use Expo Go on device for maps</Text>
  </View>
);

// Marker is a no-op on web
const Marker = () => null;

export default MapView;
export { Marker };

const styles = StyleSheet.create({
  placeholder: {
    minHeight: 200,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  sub: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
});
