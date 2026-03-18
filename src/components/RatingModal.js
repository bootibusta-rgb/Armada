import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const STARS = [1, 2, 3, 4, 5];

export default function RatingModal({ visible, onRate, onSkip, title = 'Rate your driver', subTitle }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [selected, setSelected] = useState(0);

  const handleSubmit = () => {
    if (selected > 0) onRate(selected);
    else onSkip?.();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {subTitle ? <Text style={styles.subTitle}>{subTitle}</Text> : null}
          <View style={styles.stars}>
            {STARS.map((n) => (
              <TouchableOpacity
                key={n}
                onPress={() => setSelected(n)}
                style={styles.starBtn}
              >
                <Ionicons
                  name={n <= selected ? 'star' : 'star-outline'}
                  size={40}
                  color={n <= selected ? theme.colors.secondary : theme.colors.textSecondary}
                />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.skipBtn} onPress={() => onSkip?.()}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, selected === 0 && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={selected === 0}
            >
              <Text style={styles.submitText}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  content: { backgroundColor: theme.colors.white, borderRadius: 16, padding: 24 },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, textAlign: 'center', marginBottom: 8 },
  subTitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 24 },
  starBtn: { padding: 4 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  skipBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center' },
  skipText: { color: theme.colors.textSecondary, fontWeight: '600' },
  submitBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
});
