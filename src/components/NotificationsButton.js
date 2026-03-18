import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getAnnouncements } from '../services/announcementsService';

const TYPE_ICONS = {
  info: 'information-circle',
  promo: 'pricetag',
  feature: 'sparkles',
  safety: 'shield-checkmark',
  default: 'megaphone',
};

export default function NotificationsButton({ userProfile }) {
  const { theme } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const isDriver = userProfile?.role === 'driver';

  useEffect(() => {
    if (modalVisible) {
      setLoading(true);
      getAnnouncements()
        .then(setAnnouncements)
        .finally(() => setLoading(false));
    }
  }, [modalVisible]);

  const handleAnnouncementPress = (item) => {
    if (item.url) {
      Linking.canOpenURL(item.url).then((supported) => {
        if (supported) Linking.openURL(item.url);
      });
    }
  };

  const styles = createStyles(theme);
  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => handleAnnouncementPress(item)}
      activeOpacity={item.url ? 0.7 : 1}
      disabled={!item.url}
    >
      <View style={styles.cardHeader}>
        <Ionicons
          name={TYPE_ICONS[item.type] || TYPE_ICONS.default}
          size={22}
          color={theme.colors.primary}
        />
        <Text style={styles.cardDate}>{item.date}</Text>
        {item.url && <Ionicons name="open-outline" size={16} color={theme.colors.primary} />}
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardBody}>{item.body}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, isDriver && styles.fabDriver]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="notifications" size={26} color={theme.colors.white} />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Announcements</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            ) : (
              <FlatList
                data={announcements}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                style={styles.list}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No announcements yet.</Text>
                }
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (theme) => StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 8,
  },
  fabDriver: {
    bottom: 220,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
  },
  list: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.primaryLight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  closeBtn: { padding: 4 },
  loadingWrap: { padding: 48, alignItems: 'center' },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cardDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    padding: 32,
  },
});
