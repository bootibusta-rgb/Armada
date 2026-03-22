import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  TextInput,
  Image,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  subscribeToVehicles,
  addVehicle,
  updateVehicle,
  deleteVehicle,
  uploadVehiclePhoto,
  uploadDocumentPhoto,
} from '../../services/vehicleService';
import { scheduleDocExpiryNotifications, getExpiringDocsBanner } from '../../services/docExpiryNotificationService';
import { isFirebaseReady } from '../../config/firebase';
import { useTheme } from '../../context/ThemeContext';

function isExpired(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d < new Date();
}

export default function FleetScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const [vehicles, setVehicles] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [photoUri, setPhotoUri] = useState(null);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [fitnessExpiry, setFitnessExpiry] = useState('');
  const [registrationPhotoUri, setRegistrationPhotoUri] = useState(null);
  const [fitnessPhotoUri, setFitnessPhotoUri] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isFirebaseReady || !userProfile?.id) return;
    return subscribeToVehicles(userProfile.id, (v) => {
      setVehicles(v);
      scheduleDocExpiryNotifications(v);
    });
  }, [userProfile?.id]);

  const openAdd = () => {
    setEditingId(null);
    setPhotoUri(null);
    setMake('');
    setModel('');
    setYear('');
    setColor('');
    setLicensePlate('');
    setRegistrationNumber('');
    setRegistrationExpiry('');
    setFitnessExpiry('');
    setRegistrationPhotoUri(null);
    setFitnessPhotoUri(null);
    setModalVisible(true);
  };

  const openEdit = (v) => {
    setEditingId(v.id);
    setPhotoUri(v.photoUrl || null);
    setMake(v.make || '');
    setModel(v.model || '');
    setYear(v.year || '');
    setColor(v.color || '');
    setLicensePlate(v.licensePlate || '');
    setRegistrationNumber(v.registrationNumber || '');
    setRegistrationExpiry(v.registrationExpiry || '');
    setFitnessExpiry(v.fitnessExpiry || '');
    setRegistrationPhotoUri(v.registrationPhotoUrl || null);
    setFitnessPhotoUri(v.fitnessPhotoUrl || null);
    setModalVisible(true);
  };

  const pickPhoto = async (setter) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission', 'Camera roll access needed');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) (setter || (() => setPhotoUri))(result.assets[0].uri);
  };

  const pickDocPhoto = (type) => async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission', 'Camera roll access needed');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) {
      if (type === 'registration') setRegistrationPhotoUri(result.assets[0].uri);
      else setFitnessPhotoUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!make.trim() || !model.trim() || !color.trim() || !licensePlate.trim()) {
      Alert.alert('Error', 'Fill in make, model, color, and license plate');
      return;
    }
    if (!photoUri && !editingId) {
      Alert.alert('Error', 'Upload a vehicle photo');
      return;
    }
    setLoading(true);
    try {
      let photoUrl = null;
      if (photoUri) {
        photoUrl = photoUri.startsWith('http') ? photoUri : await uploadVehiclePhoto(userProfile.id, photoUri);
      }
      let registrationPhotoUrl = null;
      let fitnessPhotoUrl = null;
      if (registrationPhotoUri) {
        registrationPhotoUrl = registrationPhotoUri.startsWith('http') ? registrationPhotoUri : await uploadDocumentPhoto(userProfile.id, editingId || 'new', 'registration', registrationPhotoUri);
      }
      if (fitnessPhotoUri) {
        fitnessPhotoUrl = fitnessPhotoUri.startsWith('http') ? fitnessPhotoUri : await uploadDocumentPhoto(userProfile.id, editingId || 'new', 'fitness', fitnessPhotoUri);
      }
      const data = {
        make: make.trim(),
        model: model.trim(),
        year: year.trim() || null,
        color: color.trim(),
        licensePlate: licensePlate.trim(),
        registrationNumber: registrationNumber.trim() || null,
        registrationExpiry: registrationExpiry.trim() || null,
        fitnessExpiry: fitnessExpiry.trim() || null,
        ...(photoUrl && { photoUrl }),
        ...(registrationPhotoUrl && { registrationPhotoUrl }),
        ...(fitnessPhotoUrl && { fitnessPhotoUrl }),
      };
      if (editingId) {
        await updateVehicle(userProfile.id, editingId, data);
        Alert.alert('Updated', 'Vehicle updated');
      } else {
        await addVehicle(userProfile.id, data);
        Alert.alert('Added', 'Vehicle added to fleet');
      }
      setModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (v) => {
    Alert.alert('Remove vehicle', `Remove ${v.make} ${v.model}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVehicle(userProfile.id, v.id);
          } catch (e) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const expiringBanner = getExpiringDocsBanner(vehicles);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Fleet</Text>
      <Text style={styles.subtitle}>Manage your vehicles</Text>
      {expiringBanner.length > 0 && (
        <View style={styles.expiringBanner}>
          <Ionicons name="warning" size={20} color={theme.colors.orange} />
          <View style={styles.expiringTextWrap}>
            {expiringBanner.map((msg, i) => (
              <Text key={i} style={styles.expiringText}>{msg}</Text>
            ))}
          </View>
        </View>
      )}
      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Ionicons name="add-circle" size={24} color={theme.colors.onPrimary} />
        <Text style={styles.addBtnText}>Add vehicle</Text>
      </TouchableOpacity>
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No vehicles yet</Text>
            <Text style={styles.emptySub}>Add your first vehicle to get started</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.photoUrl ? (
              <Image source={{ uri: item.photoUrl }} style={styles.cardPhoto} />
            ) : (
              <View style={styles.cardPhotoPlaceholder}>
                <Ionicons name="car" size={48} color={theme.colors.textSecondary} />
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.make} {item.model}</Text>
              <Text style={styles.cardDetail}>{item.color} • {item.year || '—'} • {item.licensePlate}</Text>
              {(item.registrationNumber || item.registrationExpiry || item.fitnessExpiry) ? (
                <View style={styles.cardBadges}>
                  {item.registrationNumber ? <Text style={styles.badge}>Reg: {item.registrationNumber}</Text> : null}
                  {item.registrationExpiry ? <Text style={[styles.badge, isExpired(item.registrationExpiry) && styles.badgeExpired]}>Reg expiry: {item.registrationExpiry}</Text> : null}
                  {item.fitnessExpiry ? <Text style={[styles.badge, isExpired(item.fitnessExpiry) && styles.badgeExpired]}>Fitness: {item.fitnessExpiry}</Text> : null}
                </View>
              ) : null}
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit vehicle' : 'Add vehicle'}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(setPhotoUri)}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="camera" size={32} color={theme.colors.textSecondary} />
                    <Text style={styles.photoPlaceholderText}>Vehicle photo</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TextInput style={styles.input} placeholder="Make *" value={make} onChangeText={setMake} placeholderTextColor={theme.colors.textSecondary} />
              <TextInput style={styles.input} placeholder="Model *" value={model} onChangeText={setModel} placeholderTextColor={theme.colors.textSecondary} />
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.half]} placeholder="Year" value={year} onChangeText={setYear} keyboardType="number-pad" placeholderTextColor={theme.colors.textSecondary} />
                <TextInput style={[styles.input, styles.half]} placeholder="Color *" value={color} onChangeText={setColor} placeholderTextColor={theme.colors.textSecondary} />
              </View>
              <TextInput style={styles.input} placeholder="License plate *" value={licensePlate} onChangeText={setLicensePlate} autoCapitalize="characters" placeholderTextColor={theme.colors.textSecondary} />
              <Text style={styles.fieldLabel}>Vehicle fitness & registration</Text>
              <TextInput style={styles.input} placeholder="Registration number" value={registrationNumber} onChangeText={setRegistrationNumber} autoCapitalize="characters" placeholderTextColor={theme.colors.textSecondary} />
              <TextInput style={styles.input} placeholder="Registration expiry (YYYY-MM-DD)" value={registrationExpiry} onChangeText={setRegistrationExpiry} placeholderTextColor={theme.colors.textSecondary} />
              <TouchableOpacity style={styles.docPhotoBtn} onPress={pickDocPhoto('registration')}>
                {registrationPhotoUri ? (
                  <Image source={{ uri: registrationPhotoUri }} style={styles.docPhotoPreview} />
                ) : (
                  <View style={styles.docPhotoPlaceholder}>
                    <Ionicons name="document-text" size={24} color={theme.colors.textSecondary} />
                    <Text style={styles.docPhotoText}>Registration doc</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TextInput style={styles.input} placeholder="Fitness expiry (YYYY-MM-DD)" value={fitnessExpiry} onChangeText={setFitnessExpiry} placeholderTextColor={theme.colors.textSecondary} />
              <TouchableOpacity style={styles.docPhotoBtn} onPress={pickDocPhoto('fitness')}>
                {fitnessPhotoUri ? (
                  <Image source={{ uri: fitnessPhotoUri }} style={styles.docPhotoPreview} />
                ) : (
                  <View style={styles.docPhotoPlaceholder}>
                    <Ionicons name="document-text" size={24} color={theme.colors.textSecondary} />
                    <Text style={styles.docPhotoText}>Fitness certificate</Text>
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, loading && styles.buttonDisabled]} onPress={handleSave} disabled={loading}>
                <Text style={styles.saveText}>{loading ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  addBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  expiringBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.orange + '20',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.orange,
  },
  expiringTextWrap: { flex: 1, marginLeft: 10 },
  expiringText: { fontSize: 13, color: theme.colors.text, marginBottom: 2 },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, fontWeight: '600', color: theme.colors.textSecondary },
  emptySub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
  card: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardPhoto: { width: 100, height: 100 },
  cardPhotoPlaceholder: { width: 100, height: 100, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' },
  cardBody: { flex: 1, padding: 12, justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary },
  cardDetail: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.primaryLight, borderRadius: 8 },
  editBtnText: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.colors.error + '30', borderRadius: 8 },
  deleteBtnText: { fontSize: 12, color: theme.colors.error, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 16 },
  photoBtn: { marginBottom: 16 },
  photoPlaceholder: { height: 120, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 2, borderColor: theme.colors.primaryLight, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderText: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
  photoPreview: { width: '100%', height: 120, borderRadius: 12 },
  input: { backgroundColor: theme.colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 2, borderColor: theme.colors.primaryLight },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.primary, marginTop: 8, marginBottom: 8 },
  docPhotoBtn: { marginBottom: 12 },
  docPhotoPlaceholder: { height: 80, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.primaryLight, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  docPhotoText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6 },
  docPhotoPreview: { width: '100%', height: 80, borderRadius: 10 },
  cardBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: { fontSize: 11, color: theme.colors.textSecondary, backgroundColor: theme.colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeExpired: { color: theme.colors.error, backgroundColor: theme.colors.error + '20' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center' },
  cancelText: { color: theme.colors.textSecondary, fontWeight: 'bold' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center' },
  saveText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
  buttonDisabled: { opacity: 0.6 },
});
