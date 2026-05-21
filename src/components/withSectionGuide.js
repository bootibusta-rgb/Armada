import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import SectionGuideModal from './SectionGuideModal';
import { SECTION_GUIDES } from '../data/sectionGuides';
import { useTheme } from '../context/ThemeContext';
import { useLocale } from '../context/LocaleContext';
import { useAuth } from '../context/AuthContext';
import {
  SECTION_GUIDE_FAB_HIDDEN_KEY,
  isSectionGuideDismissed,
  persistSectionGuideDismissed,
} from '../constants/sectionGuidePrefs';

/**
 * Wraps a screen: shows guide on first visit; floating ? reopens anytime (unless disabled in Settings).
 */
export function withSectionGuide(WrappedComponent, sectionId) {
  if (!SECTION_GUIDES[sectionId]) {
    console.warn(`withSectionGuide: unknown sectionId "${sectionId}"`);
  }

  function GuidedScreen(props) {
    const { theme } = useTheme();
    const { t } = useLocale();
    const { user, loading: authLoading } = useAuth();
    const uid = user?.uid || null;
    const [modalVisible, setModalVisible] = useState(false);
    const [showFab, setShowFab] = useState(true);
    const openedThisFocus = useRef(false);
    const dismissedCacheRef = useRef(null);

    useEffect(() => {
      dismissedCacheRef.current = null;
    }, [uid]);

    const openGuide = useCallback(() => setModalVisible(true), []);
    const closeGuide = useCallback(() => setModalVisible(false), []);

    const dismissForever = useCallback(async () => {
      dismissedCacheRef.current = true;
      await persistSectionGuideDismissed(sectionId, uid);
    }, [sectionId, uid]);

    useFocusEffect(
      useCallback(() => {
        let cancelled = false;
        openedThisFocus.current = false;

        if (authLoading) {
          return () => {
            cancelled = true;
          };
        }

        (async () => {
          try {
            if (!SECTION_GUIDES[sectionId]) {
              if (cancelled) return;
              const fabOnly = await AsyncStorage.getItem(SECTION_GUIDE_FAB_HIDDEN_KEY);
              if (!cancelled) setShowFab(fabOnly !== '1');
              return;
            }
            if (dismissedCacheRef.current === true) {
              if (cancelled) return;
              const fabHiddenPref = await AsyncStorage.getItem(SECTION_GUIDE_FAB_HIDDEN_KEY);
              if (!cancelled) setShowFab(fabHiddenPref !== '1');
              return;
            }
            const dismissed = await isSectionGuideDismissed(sectionId, uid);
            dismissedCacheRef.current = dismissed;
            const fabHiddenPref = await AsyncStorage.getItem(SECTION_GUIDE_FAB_HIDDEN_KEY);
            if (cancelled) return;
            setShowFab(fabHiddenPref !== '1');
            if (dismissed) return;
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
      }, [sectionId, authLoading, uid]),
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
            accessibilityLabel={t('sectionGuides.common.openFab')}
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
