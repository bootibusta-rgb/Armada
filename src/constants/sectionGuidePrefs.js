import AsyncStorage from '@react-native-async-storage/async-storage';

/** When set to '1', floating section-guide buttons are hidden on main screens (see Settings). */
export const SECTION_GUIDE_FAB_HIDDEN_KEY = 'armada_section_guide_fab_hidden';

/** “Don’t show again” on any section guide — applies to all sections for this user. */
export function sectionGuidesDismissedAllKey(uid) {
  return uid ? `armada_section_guides_dismissed_all_${uid}` : 'armada_section_guides_dismissed_all';
}

/** Same key shape as {@link withSectionGuide} and hub modal “Don’t show again”. */
export function sectionGuideDismissedStorageKey(sectionId, uid) {
  return uid ? `armada_section_guide_dismissed_${sectionId}_${uid}` : `armada_section_guide_dismissed_${sectionId}`;
}

/** Pre–per-user keys (dismissals before uid-suffix was added). Migrated on read when signed in. */
export function legacySectionGuideDismissedStorageKey(sectionId) {
  return `armada_section_guide_dismissed_${sectionId}`;
}

/** @returns {Promise<boolean>} */
export async function isSectionGuideDismissed(sectionId, uid) {
  try {
    if ((await AsyncStorage.getItem(sectionGuidesDismissedAllKey(uid))) === '1') return true;
    if (uid && (await AsyncStorage.getItem(sectionGuidesDismissedAllKey(null))) === '1') return true;
    let dismissed = await AsyncStorage.getItem(sectionGuideDismissedStorageKey(sectionId, uid));
    if (dismissed === '1') return true;
    if (uid) {
      const legacy = await AsyncStorage.getItem(legacySectionGuideDismissedStorageKey(sectionId));
      if (legacy === '1') {
        try {
          await AsyncStorage.setItem(sectionGuideDismissedStorageKey(sectionId, uid), '1');
        } catch (_) {}
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/** Persist section + global dismiss keys (survives uid arriving late on first launch). */
export async function persistSectionGuideDismissed(sectionId, uid) {
  const keys = new Set([
    sectionGuideDismissedStorageKey(sectionId, uid),
    sectionGuideDismissedStorageKey(sectionId, null),
    legacySectionGuideDismissedStorageKey(sectionId),
    sectionGuidesDismissedAllKey(uid),
    sectionGuidesDismissedAllKey(null),
  ]);
  await Promise.all([...keys].map((k) => AsyncStorage.setItem(k, '1').catch(() => {})));
}
