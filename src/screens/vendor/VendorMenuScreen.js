import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  getVendorMenu,
  addMenuItem,
  updateMenuItem,
  removeMenuItem,
  updateVendorMenu,
} from '../../services/vendorMenuService';
import { useTheme } from '../../context/ThemeContext';
import { withSectionGuide } from '../../components/withSectionGuide';

function VendorMenuScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile, refreshUserProfile } = useAuth();
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const loadMenu = async () => {
    if (!userProfile?.id) return;
    const items = await getVendorMenu(userProfile.id);
    setMenu(items);
  };

  useEffect(() => {
    loadMenu();
  }, [userProfile?.id]);

  const openAdd = () => {
    setEditingItem(null);
    setName('');
    setPrice('');
    setModalVisible(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(String(item.price || ''));
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingItem(null);
    setName('');
    setPrice('');
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Error', 'Enter item name');
      return;
    }
    const priceNum = Math.max(0, parseInt(price, 10) || 0);
    setLoading(true);
    try {
      if (editingItem) {
        await updateMenuItem(userProfile.id, editingItem.id, { name: trimmedName, price: priceNum });
        Alert.alert('Saved', 'Menu item updated');
      } else {
        await addMenuItem(userProfile.id, trimmedName, priceNum);
        Alert.alert('Added', 'Menu item added');
      }
      await loadMenu();
      refreshUserProfile?.();
      closeModal();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (item) => {
    Alert.alert(
      'Remove item',
      `Remove "${item.name}" from menu?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await removeMenuItem(userProfile.id, item.id);
              await loadMenu();
              refreshUserProfile?.();
              if (editingItem?.id === item.id) closeModal();
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to remove');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Menu</Text>
        <Text style={styles.subtitle}>Add items with prices. Riders will see these when ordering.</Text>

        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add-circle" size={24} color={theme.colors.primary} />
          <Text style={styles.addBtnText}>Add menu item</Text>
        </TouchableOpacity>

        {menu.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No menu items yet</Text>
            <Text style={styles.emptySub}>Tap "Add menu item" to get started</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {menu.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>J${item.price || 0}</Text>
                </View>
                <View style={styles.itemActions}>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                    <Ionicons name="pencil" size={20} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(item)}>
                    <Ionicons name="trash" size={20} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeModal}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>{editingItem ? 'Edit item' : 'Add item'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Item name *"
              value={name}
              onChangeText={setName}
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Price (J$) *"
              value={price}
              onChangeText={setPrice}
              placeholderTextColor={theme.colors.textSecondary}
              keyboardType="number-pad"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={loading}
              >
                <Text style={styles.saveText}>{loading ? 'Saving...' : editingItem ? 'Update' : 'Add'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

export default withSectionGuide(VendorMenuScreen, 'vendor_menu');

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  addBtnText: { fontSize: 16, fontWeight: '600', color: theme.colors.primary },
  empty: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  emptyText: { fontSize: 18, fontWeight: '600', color: theme.colors.textSecondary },
  emptySub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
  list: { gap: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '600', color: theme.colors.primary },
  itemPrice: { fontSize: 14, color: theme.colors.accent, marginTop: 4 },
  itemActions: { flexDirection: 'row', gap: 12 },
  editBtn: { padding: 8 },
  removeBtn: { padding: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: theme.colors.white,
    padding: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 20 },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  cancelText: { color: theme.colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
});
