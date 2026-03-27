import React, { useState, useCallback, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import SectionGuideModal from './SectionGuideModal';
import { SECTION_GUIDES } from '../data/sectionGuides';
import { useTheme } from '../context/ThemeContext';
import { SECTION_GUIDE_FAB_HIDDEN_KEY } from '../constants/sectionGuidePrefs';

const storageKey = (id) => `armada_section_guide_dismissed_${id}`;

/**
 * Wraps a screen: shows guide on first visit; floating ? reopens anytime (unless disabled in Settings).
 */
export function withSectionGuide(WrappedComponent, sectionId) {
  if (!SECTION_GUIDES[sectionId]) {
    console.warn(`withSectionGuide: unknown sectionId "${sectionId}"`);
  }

  function GuidedScreen(props) {
    const { theme } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    const [showFab, setShowFab] = useState(true);
    const openedThisFocus = useRef(false);

    const openGuide = useCallback(() => setModalVisible(true), []);
    const closeGuide = useCallback(() => setModalVisible(false), []);

    const dismissForever = useCallback(async () => {
      try {
        await AsyncStorage.setItem(storageKey(sectionId), '1');
      } catch (e) {}
    }, [sectionId]);

    useFocusEffect(
      useCallback(() => {
        let cancelled = false;
        openedThisFocus.current = false;
        (async () => {
          try {
            const [dismissed, fabHiddenPref] = await Promise.all([
              AsyncStorage.getItem(storageKey(sectionId)),
              AsyncStorage.getItem(SECTION_GUIDE_FAB_HIDDEN_KEY),
            ]);
            if (cancelled) return;
            setShowFab(fabHiddenPref !== '1');
            if (dismissed === '1' || !SECTION_GUIDES[sectionId]) return;
            await new Promise((r) => setTimeout(r, 400));
            if (!cancelled && !openedThisFocus.current) {
              openedThisFocus.current = true;
              setModalVisible(true);
            }
          } catch (e) {}
        })();
        return () => {
          cancelled = true;
        };
      }, [sectionId])
    );

    return (
      <View style={styles.wrap}>
        <WrappedComponent {...props} />
        {showFab ? (
          <TouchableOpacity
            style={[
              styles.fab,
              { backgroundColor: theme.colors.primary, borderColor: theme.colors.primaryDark || theme.colors.primary },
            ]}
            onPress={openGuide}
            accessibilityLabel="Open help guide for this section"
            activeOpacity={0.85}
          >
            <Ionicons name="help" size={20} color={theme.colors.onPrimary} />
          </TouchableOpacity>
        ) : null}
        <SectionGuideModal
          visible={modalVisible}
          onClose={closeGuide}
          sectionId={sectionId}
          onDismissForever={dismissForever}
        />
      </View>
    );
  }

  GuidedScreen.displayName = `WithSectionGuide(${WrappedComponent.displayName || WrappedComponent.name || 'Screen'})`;
  return GuidedScreen;
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  // Top-right of screen content (below stack/tab headers) — avoids map/footer controls and tab bar.
  fab: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
