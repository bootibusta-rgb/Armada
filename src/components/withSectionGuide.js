import React, { useState, useCallback, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import SectionGuideModal from './SectionGuideModal';
import { SECTION_GUIDES } from '../data/sectionGuides';
import { useTheme } from '../context/ThemeContext';

const storageKey = (id) => `armada_section_guide_dismissed_${id}`;

/**
 * Wraps a screen: shows guide on first visit; floating ? reopens anytime.
 */
export function withSectionGuide(WrappedComponent, sectionId) {
  if (!SECTION_GUIDES[sectionId]) {
    console.warn(`withSectionGuide: unknown sectionId "${sectionId}"`);
  }

  function GuidedScreen(props) {
    const { theme } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    const openedThisFocus = useRef(false);

    const openGuide = useCallback(() => setModalVisible(true), []);
    const closeGuide = useCallback(() => setModalVisible(false), []);

    const dismissForever = useCallback(async () => {
      try {
        await AsyncStorage.setItem(storageKey(sectionId), '1');
      } catch (e) {}
    }, []);

    useFocusEffect(
      useCallback(() => {
        let cancelled = false;
        openedThisFocus.current = false;
        (async () => {
          try {
            const dismissed = await AsyncStorage.getItem(storageKey(sectionId));
            if (cancelled || dismissed === '1' || !SECTION_GUIDES[sectionId]) return;
            // Brief delay so the screen paints first
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
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primaryDark || theme.colors.primary }]}
          onPress={openGuide}
          accessibilityLabel="Open help guide for this section"
          activeOpacity={0.85}
        >
          <Ionicons name="help" size={22} color={theme.colors.onPrimary} />
        </TouchableOpacity>
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
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 88,
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
});
