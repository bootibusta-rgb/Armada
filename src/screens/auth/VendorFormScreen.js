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
} from 'react-native';
import { isFirebaseReady } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { updateUserProfile } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IdVerificationSection from '../../components/IdVerificationSection';
import { uploadUserIdDocument, uploadUserSelfieWithId } from '../../services/identityVerificationService';

export default function VendorFormScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { user, setUserProfile, loginDemo } = useAuth();
  const styles = createStyles(theme);
  const { demo } = route.params || {};
  const [vendorName, setVendorName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('18.007');
  const [lng, setLng] = useState('-76.782');
  const [menuItems, setMenuItems] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idPhotoUri, setIdPhotoUri] = useState(null);
  const [selfieWithIdPhotoUri, setSelfieWithIdPhotoUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const requireIdUpload = !demo && isFirebaseReady;

  const handleSubmit = async () => {
    if (!vendorName.trim()) {
      Alert.alert('Error', 'Enter vendor name');
      return;
    }
    if (!idType || !idNumber.trim()) {
      Alert.alert('Error', 'Select ID type and enter your ID number');
      return;
    }
    if (requireIdUpload && !idPhotoUri) {
      Alert.alert('Error', 'Upload a clear photo of your selected ID');
      return;
    }
    if (requireIdUpload && !selfieWithIdPhotoUri) {
      Alert.alert('Error', 'Take a selfie holding your ID next to your face');
      return;
    }
    const itemNames = menuItems
      .split(',')
      .map((i) => i.trim())
      .filter(Boolean);
    if (itemNames.length === 0) {
      Alert.alert('Error', 'Enter at least one menu item (comma-separated). You can add prices later in the Menu tab.');
      return;
    }
    const menu = itemNames.map((name, i) => ({ id: `init-${i}`, name, price: 0 }));
    setLoading(true);
    try {
      const latNum = parseFloat(lat) || 18.007;
      const lngNum = parseFloat(lng) || -76.782;
      const vendorId = vendorName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'vendor';
      if (demo || !isFirebaseReady) {
        loginDemo({
          id: 'demo-vendor',
          role: 'vendor',
          vendorId: 'jerkman',
          name: vendorName.trim(),
          address: address.trim() || undefined,
          lat: latNum,
          lng: lngNum,
          items: itemNames,
          menu,
          idType,
          idNumber: idNumber.trim(),
        });
        return;
      }
      const uid = user?.uid;
      if (!uid) throw new Error('Not authenticated');
      const idDocumentUrl = await uploadUserIdDocument(uid, idType, idPhotoUri);
      const idSelfieWithIdUrl = await uploadUserSelfieWithId(uid, selfieWithIdPhotoUri);
      await updateUserProfile(uid, {
        role: 'vendor',
        vendorId,
        name: vendorName.trim(),
        address: address.trim() || null,
        lat: latNum,
        lng: lngNum,
        items: itemNames,
        menu,
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl,
        idSelfieWithIdUrl,
        idDocumentUploadedAt: new Date().toISOString(),
        idVerified: true,
      });
      setUserProfile({
        id: uid,
        role: 'vendor',
        vendorId,
        name: vendorName.trim(),
        address: address.trim(),
        lat: latNum,
        lng: lngNum,
        items: itemNames,
        menu,
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl,
        idSelfieWithIdUrl,
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
        <Text style={styles.title}>Vendor Profile</Text>
        <Text style={styles.subtitle}>List your food spot for riders to pick up</Text>
        <IdVerificationSection
          idType={idType}
          setIdType={setIdType}
          idNumber={idNumber}
          setIdNumber={setIdNumber}
          idPhotoUri={idPhotoUri}
          setIdPhotoUri={setIdPhotoUri}
          selfieWithIdPhotoUri={selfieWithIdPhotoUri}
          setSelfieWithIdPhotoUri={setSelfieWithIdPhotoUri}
          requireIdPhoto={requireIdUpload}
        />
        <TextInput
          style={styles.input}
          placeholder="Vendor name *"
          value={vendorName}
          onChangeText={setVendorName}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          placeholder="Address (e.g. Kingston, Jamaica)"
          value={address}
          onChangeText={setAddress}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Latitude"
            value={lat}
            onChangeText={setLat}
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, styles.halfInput]}
            placeholder="Longitude"
            value={lng}
            onChangeText={setLng}
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="numeric"
          />
        </View>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Menu items (comma-separated) *"
          value={menuItems}
          onChangeText={setMenuItems}
          placeholderTextColor={theme.colors.textSecondary}
          multiline
          numberOfLines={3}
        />
        <Text style={styles.hint}>e.g. Jerk Chicken, Festival, Rice & Peas</Text>
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
  halfInput: { flex: 1 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 },
  button: {
    backgroundColor: theme.colors.accent,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
});
