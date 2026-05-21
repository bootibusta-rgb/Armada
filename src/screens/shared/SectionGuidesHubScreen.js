import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import SectionGuideModal from '../../components/SectionGuideModal';
import { SECTION_GUIDES, SECTION_GUIDE_KEYS_BY_ROLE } from '../../data/sectionGuides';
import { useLocale } from '../../context/LocaleContext';
import { persistSectionGuideDismissed } from '../../constants/sectionGuidePrefs';

export default function SectionGuidesHubScreen() {
  const { theme } = useTheme();
  const { t } = useLocale();
  const { userProfile, user } = useAuth();
  const role = userProfile?.role || 'rider';
  const keys = SECTION_GUIDE_KEYS_BY_ROLE[role] || SECTION_GUIDE_KEYS_BY_ROLE.rider;
  const [openId, setOpenId] = useState(null);

  const rows = useMemo(
    () => keys.filter((k) => SECTION_GUIDES[k]).map((k) => ({ id: k, title: SECTION_GUIDES[k].title })),
    [keys]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
        {t('sectionGuides.hubHint')}
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primaryLight }]}
            onPress={() => setOpenId(item.id)}
            activeOpacity={0.85}
          >
            <Text style={[styles.rowTitle, { color: theme.colors.text }]}>{item.title}</Text>
            <Text style={[styles.rowAction, { color: theme.colors.primary }]}>
              {t('sectionGuides.hubOpen')}
            </Text>
          </TouchableOpacity>
        )}
      />
      {openId ? (
        <SectionGuideModal
          visible
          onClose={() => setOpenId(null)}
          sectionId={openId}
          onDismissForever={async () => {
            await persistSectionGuideDismissed(openId, user?.uid || null);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 10,
  },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: '600', marginRight: 12 },
  rowAction: { fontSize: 15, fontWeight: '700' },
});
