import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { isFirebaseReady } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { updateUserProfile, getUserProfile } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IdVerificationSection from '../../components/IdVerificationSection';
import { addVehicle, uploadVehiclePhoto, uploadDocumentPhoto } from '../../services/vehicleService';
import { uploadUserIdDocument, uploadUserSelfieWithId } from '../../services/identityVerificationService';

export default function DriverFormScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { user, setUserProfile, loginDemo } = useAuth();
  const styles = createStyles(theme);
  const { demo, referredBy } = route.params || {};
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [vehiclePhotoUri, setVehiclePhotoUri] = useState(null);
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
  const [idType, setIdType] = useState('drivers_license');
  const [idNumber, setIdNumber] = useState('');
  const [idExpiry, setIdExpiry] = useState('');
  const [idPhotoUri, setIdPhotoUri] = useState(null);
  const [selfieWithIdPhotoUri, setSelfieWithIdPhotoUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const requireIdUpload = !demo && isFirebaseReady;

  const pickVehiclePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission', 'Camera roll access needed to upload vehicle photo');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) {
      setVehiclePhotoUri(result.assets[0].uri);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter your name');
      return;
    }
    if (!idType || !idNumber.trim()) {
      Alert.alert('Error', 'Select ID type and enter your license/ID number');
      return;
    }
    if (requireIdUpload && !idPhotoUri) {
      Alert.alert('Error', 'Upload a clear photo of your selected ID (must match the type you chose)');
      return;
    }
    if (requireIdUpload && !selfieWithIdPhotoUri) {
      Alert.alert('Error', 'Take a selfie holding your ID next to your face');
      return;
    }
    if (!vehiclePhotoUri && !demo && isFirebaseReady) {
      Alert.alert('Error', 'Upload a photo of your vehicle');
      return;
    }
    if ((!make.trim() || !model.trim() || !color.trim() || !licensePlate.trim()) && !demo && isFirebaseReady) {
      Alert.alert('Error', 'Fill in vehicle details: make, model, color, license plate');
      return;
    }
    if (!demo && isFirebaseReady && (!registrationPhotoUri || !fitnessPhotoUri)) {
      Alert.alert('Error', 'Upload both registration and fitness certificate document photos');
      return;
    }
    setLoading(true);
    try {
      if (demo || !isFirebaseReady) {
        loginDemo({
          id: 'demo-driver',
          role: 'driver',
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          vehicle: `${make} ${model}`.trim() || 'Vehicle',
          licensePlate: licensePlate.trim() || undefined,
          idType,
          idNumber: idNumber.trim(),
          idExpiry: idExpiry.trim() || undefined,
          rating: 4.8,
        });
        return;
      }
      const uid = user?.uid;
      if (!uid) throw new Error('Not authenticated');
      const existing = await getUserProfile(uid);
      const roles = [...(existing?.roles || (existing?.role ? [existing.role] : []))];
      if (!roles.includes('driver')) roles.push('driver');

      const idDocumentUrl = await uploadUserIdDocument(uid, idType, idPhotoUri);
      const idSelfieWithIdUrl = await uploadUserSelfieWithId(uid, selfieWithIdPhotoUri);

      let photoUrl = null;
      if (vehiclePhotoUri) {
        photoUrl = await uploadVehiclePhoto(uid, vehiclePhotoUri);
      }

      const vehicleData = {
        make: make.trim(),
        model: model.trim(),
        year: year.trim() || null,
        color: color.trim(),
        licensePlate: licensePlate.trim(),
        registrationNumber: registrationNumber.trim() || null,
        registrationExpiry: registrationExpiry.trim() || null,
        fitnessExpiry: fitnessExpiry.trim() || null,
        photoUrl,
      };
      const vehicleId = await addVehicle(uid, vehicleData);
      const docUpdates = {};
      if (registrationPhotoUri) {
        docUpdates.registrationPhotoUrl = await uploadDocumentPhoto(uid, vehicleId, 'registration', registrationPhotoUri);
      }
      if (fitnessPhotoUri) {
        docUpdates.fitnessPhotoUrl = await uploadDocumentPhoto(uid, vehicleId, 'fitness', fitnessPhotoUri);
      }
      if (Object.keys(docUpdates).length > 0) {
        const { updateVehicle } = await import('../../services/vehicleService');
        await updateVehicle(uid, vehicleId, docUpdates);
      }

      const now = new Date().toISOString();
      const profileData = {
        role: 'driver',
        roles,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        vehicle: `${make} ${model}`.trim(),
        licensePlate: licensePlate.trim(),
        primaryVehicleId: vehicleId,
        idType,
        idNumber: idNumber.trim(),
        idExpiry: idExpiry.trim() || null,
        idDocumentUrl,
        idSelfieWithIdUrl,
        idDocumentUploadedAt: new Date().toISOString(),
        idVerified: true,
        rating: 4.8,
        createdAt: existing?.createdAt || now,
        signedUpAt: existing?.signedUpAt || now,
      };
      if (referredBy) {
        profileData.driverSubscription = { referredBy };
      }
      await updateUserProfile(uid, profileData);
      setUserProfile({
        id: uid,
        ...existing,
        role: 'driver',
        roles,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        vehicle: `${make} ${model}`.trim(),
        licensePlate: licensePlate.trim(),
        primaryVehicleId: vehicleId,
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl,
        idSelfieWithIdUrl,
        rating: 4.8,
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Driver Profile</Text>
        <Text style={styles.subtitle}>Register to start accepting rides</Text>
        <TextInput
          style={styles.input}
          placeholder="Full name *"
          value={name}
          onChangeText={setName}
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Email (optional)"
          value={email}
          onChangeText={setEmail}
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Phone (optional, for emergency call-back)"
          value={phone}
          onChangeText={setPhone}
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="phone-pad"
        />
        <IdVerificationSection
          idType={idType}
          setIdType={setIdType}
          idNumber={idNumber}
          setIdNumber={setIdNumber}
          idExpiry={idExpiry}
          setIdExpiry={setIdExpiry}
          showExpiry={true}
          idPhotoUri={idPhotoUri}
          setIdPhotoUri={setIdPhotoUri}
          selfieWithIdPhotoUri={selfieWithIdPhotoUri}
          setSelfieWithIdPhotoUri={setSelfieWithIdPhotoUri}
          requireIdPhoto={true}
          driversLicenseOnly
        />
        <Text style={styles.sectionTitle}>Vehicle (required)</Text>
        <TouchableOpacity style={styles.photoBtn} onPress={pickVehiclePhoto}>
          {vehiclePhotoUri ? (
            <Image source={{ uri: vehiclePhotoUri }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>+ Vehicle photo</Text>
              <Text style={styles.photoHint}>Tap to upload</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Make (e.g. Toyota)"
            value={make}
            onChangeText={setMake}
            placeholderTextColor={theme.colors.textSecondary}
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Model (e.g. Corolla)"
            value={model}
            onChangeText={setModel}
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Year"
            value={year}
            onChangeText={setYear}
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="number-pad"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Color"
            value={color}
            onChangeText={setColor}
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="License plate *"
          value={licensePlate}
          onChangeText={setLicensePlate}
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="characters"
        />
        <Text style={styles.sectionTitle}>Vehicle fitness & registration</Text>
        <TextInput
          style={styles.input}
          placeholder="Registration number (optional)"
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="Registration expiry (YYYY-MM-DD)"
          value={registrationExpiry}
          onChangeText={setRegistrationExpiry}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          placeholder="Fitness certificate expiry (YYYY-MM-DD)"
          value={fitnessExpiry}
          onChangeText={setFitnessExpiry}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <Text style={styles.docLabel}>Document photos (required)</Text>
        <View style={styles.docPhotoRow}>
          <TouchableOpacity style={styles.docPhotoBtn} onPress={async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') return;
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
            if (!r.canceled) setRegistrationPhotoUri(r.assets[0].uri);
          }}>
            {registrationPhotoUri ? <Image source={{ uri: registrationPhotoUri }} style={styles.docPhotoPreview} /> : <View style={styles.docPhotoPlaceholder}><Ionicons name="document-text" size={24} color={theme.colors.textSecondary} /><Text style={styles.docPhotoText}>Registration</Text></View>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.docPhotoBtn} onPress={async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') return;
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.8 });
            if (!r.canceled) setFitnessPhotoUri(r.assets[0].uri);
          }}>
            {fitnessPhotoUri ? <Image source={{ uri: fitnessPhotoUri }} style={styles.docPhotoPreview} /> : <View style={styles.docPhotoPlaceholder}><Ionicons name="document-text" size={24} color={theme.colors.textSecondary} /><Text style={styles.docPhotoText}>Fitness</Text></View>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Saving...' : 'Continue'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 80 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.primary, marginBottom: 12 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  row: { flexDirection: 'row', gap: 12 },
  halfInput: { flex: 1, marginBottom: 16 },
  docLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.primary, marginBottom: 8 },
  docPhotoRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  docPhotoBtn: { flex: 1 },
  docPhotoPlaceholder: { height: 80, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.primaryLight, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  docPhotoText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6 },
  docPhotoPreview: { width: '100%', height: 80, borderRadius: 10 },
  photoBtn: { marginBottom: 16 },
  photoPlaceholder: {
    height: 140,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: { fontSize: 16, color: theme.colors.primary, fontWeight: '600' },
  photoHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  photoPreview: { width: '100%', height: 140, borderRadius: 12 },
  button: {
    backgroundColor: theme.colors.orange,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
});
