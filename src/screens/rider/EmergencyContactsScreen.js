import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getEmergencyContacts,
  saveEmergencyContacts,
  findAppUserByPhone,
} from '../../services/emergencyContactsService';
import { withSectionGuide } from '../../components/withSectionGuide';

function EmergencyContactsScreen() {
  const { theme } = useTheme();
  const { userProfile } = useAuth();
  const styles = createStyles(theme);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContacts();
  }, [userProfile?.id]);

  const loadContacts = async () => {
    setLoading(true);
    const list = await getEmergencyContacts(userProfile?.id);
    setContacts(list.length ? list : [{ id: '1', name: '', phone: '', uid: null }]);
    setLoading(false);
  };

  const addContact = () => {
    setContacts([...contacts, { id: Date.now().toString(), name: '', phone: '', uid: null }]);
  };

  const updateContact = (id, field, value) => {
    setContacts(contacts.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeContact = (id) => {
    if (contacts.length <= 1) return;
    setContacts(contacts.filter((c) => c.id !== id));
  };

  const handlePickFromContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to contacts to pick an emergency contact.');
        return;
      }
      const contact = await Contacts.presentContactPickerAsync();
      if (!contact) return;
      const phone = contact.phoneNumbers?.[0]?.number?.replace(/\D/g, '')?.slice(-10);
      const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Contact';
      if (!phone) {
        Alert.alert('No phone', 'Selected contact has no phone number.');
        return;
      }
      const formatted = contact.phoneNumbers?.[0]?.number || `+1${phone}`;
      const appUser = await findAppUserByPhone(formatted);
      setContacts([
        ...contacts,
        { id: Date.now().toString(), name, phone: formatted, uid: appUser?.uid || null },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to pick contact');
    }
  };

  const handleLinkToAppUser = async (id) => {
    const contact = contacts.find((c) => c.id === id);
    if (!contact?.phone?.trim()) {
      Alert.alert('Enter phone first', 'Add a phone number to check if they use Armada.');
      return;
    }
    const appUser = await findAppUserByPhone(contact.phone.trim());
    if (appUser) {
      updateContact(id, 'uid', appUser.uid);
      updateContact(id, 'name', appUser.name || contact.name);
      Alert.alert('Linked', `${appUser.name || 'User'} uses Armada. They can receive video calls.`);
    } else {
      Alert.alert('Not found', 'No Armada user with this phone. They will get SMS/call only.');
    }
  };

  const handleSave = async () => {
    const valid = contacts.filter((c) => c.phone?.trim());
    if (valid.length === 0) {
      Alert.alert('Error', 'Add at least one emergency number');
      return;
    }
    try {
      const saved = await saveEmergencyContacts(userProfile?.id, valid);
      setContacts(saved);
      Alert.alert('Saved', 'Emergency contacts updated');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Emergency Contacts</Text>
        <Text style={styles.subtitle}>
          These contacts will be used when you tap Emergency during a ride. App users get video call; others get SMS + location.
        </Text>

        <View style={styles.pickRow}>
          <TouchableOpacity style={styles.pickBtn} onPress={handlePickFromContacts}>
            <Ionicons name="people" size={22} color={theme.colors.primary} />
            <Text style={styles.pickBtnText}>Pick from contacts</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder="Name (e.g. Mom, Spouse)"
                value={item.name}
                onChangeText={(v) => updateContact(item.id, 'name', v)}
                placeholderTextColor={theme.colors.textSecondary}
              />
              <TextInput
                style={styles.input}
                placeholder="Phone (e.g. +18761234567)"
                value={item.phone}
                onChangeText={(v) => updateContact(item.id, 'phone', v)}
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="phone-pad"
              />
              {item.phone?.trim() && (
                <TouchableOpacity
                  style={[styles.linkBtn, item.uid && styles.linkBtnActive]}
                  onPress={() => handleLinkToAppUser(item.id)}
                >
                  <Ionicons name={item.uid ? 'checkmark-circle' : 'link'} size={18} color={item.uid ? theme.colors.success : theme.colors.primary} />
                  <Text style={styles.linkBtnText}>{item.uid ? 'Armada user' : 'Check if on Armada'}</Text>
                </TouchableOpacity>
              )}
              {contacts.length > 1 && (
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeContact(item.id)}>
                  <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                </TouchableOpacity>
              )}
            </View>
          )}
        />

        <TouchableOpacity style={styles.addBtn} onPress={addContact}>
          <Ionicons name="add-circle-outline" size={24} color={theme.colors.primary} />
          <Text style={styles.addBtnText}>Add another contact</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default withSectionGuide(EmergencyContactsScreen, 'rider_safety');

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  pickRow: { flexDirection: 'row', marginBottom: 20 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  pickBtnText: { fontSize: 15, color: theme.colors.primary, fontWeight: '600' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  linkBtnActive: { opacity: 0.9 },
  linkBtnText: { fontSize: 13, color: theme.colors.primary, fontWeight: '500' },
  removeBtn: { position: 'absolute', top: 12, right: 12 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 16, color: theme.colors.primary, fontWeight: '600' },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
});
