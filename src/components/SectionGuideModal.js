import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { SECTION_GUIDES } from '../data/sectionGuides';

/**
 * 3D-style guide popup with section-specific accent colors.
 */
export default function SectionGuideModal({ visible, onClose, sectionId, onDismissForever }) {
  const { theme } = useTheme();
  const guide = SECTION_GUIDES[sectionId];
  if (!guide) return null;

  const accent = guide.accent;
  const accentDark = guide.accentDark;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.stopPropagate} onPress={(e) => e.stopPropagation()}>
          <View style={styles.outerShadow}>
            {/* 3D “plate” — offset layers */}
            <View style={[styles.plateBack, { borderColor: accentDark, backgroundColor: accentDark + '40' }]} />
            <View
              style={[
                styles.card3d,
                {
                  backgroundColor: theme.colors.surface,
                  borderTopColor: accent,
                  borderLeftColor: accent,
                  borderRightColor: accentDark,
                  borderBottomColor: accentDark,
                  ...Platform.select({
                    ios: {
                      shadowColor: accent,
                      shadowOffset: { width: 0, height: 12 },
                      shadowOpacity: 0.45,
                      shadowRadius: 20,
                    },
                    android: { elevation: 18 },
                  }),
                },
              ]}
            >
              <View style={[styles.accentBar, { backgroundColor: accent }]} />
              <View style={styles.innerGlow}>
                <View style={styles.headerRow}>
                  <View style={[styles.iconBadge, { backgroundColor: accent + '35', borderColor: accent }]}>
                    <Ionicons name="map-outline" size={26} color={accentDark} />
                  </View>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                    <Ionicons name="close" size={26} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.title, { color: theme.colors.text }]}>{guide.title}</Text>
                <Text style={[styles.sub, { color: theme.colors.textSecondary }]}>Quick tips for this area</Text>
                <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                  {guide.steps.map((step, i) => (
                    <View key={i} style={[styles.stepRow, { borderLeftColor: accent }]}>
                      <View style={[styles.stepNum, { backgroundColor: accent }]}>
                        <Text style={styles.stepNumText}>{i + 1}</Text>
                      </View>
                      <Text style={[styles.stepText, { color: theme.colors.text }]}>{step}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btnSecondary, { borderColor: theme.colors.primaryLight }]}
                    onPress={onClose}
                  >
                    <Text style={[styles.btnSecondaryText, { color: theme.colors.primary }]}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnPrimary, { backgroundColor: accent, borderColor: accentDark }]}
                    onPress={() => {
                      onDismissForever?.();
                      onClose();
                    }}
                  >
                    <Text style={styles.btnPrimaryText}>Got it — don’t show again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 25, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
  },
  stopPropagate: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  outerShadow: {
    position: 'relative',
  },
  plateBack: {
    position: 'absolute',
    left: 8,
    top: 10,
    right: -6,
    bottom: -10,
    borderRadius: 22,
    borderWidth: 2,
    transform: [{ rotate: '-1.2deg' }],
    opacity: 0.9,
  },
  card3d: {
    borderRadius: 20,
    borderWidth: 3,
    overflow: 'hidden',
    transform: [{ rotate: '0.4deg' }],
  },
  accentBar: {
    height: 6,
    width: '100%',
  },
  innerGlow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: { padding: 4 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  sub: { fontSize: 14, marginBottom: 16 },
  scroll: { maxHeight: 280 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingLeft: 12,
    borderLeftWidth: 3,
  },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22 },
  actions: { marginTop: 18, gap: 10 },
  btnSecondary: {
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  btnSecondaryText: { fontWeight: '700', fontSize: 15 },
  btnPrimary: {
    paddingVertical: 14,
    borderRadius: 12,
    borderBottomWidth: 4,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
