import React, { useState } from 'react';
import {
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
import { updateUserProfile, getUserProfile } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IdVerificationSection from '../../components/IdVerificationSection';
import { uploadUserIdDocument, uploadUserSelfieWithId } from '../../services/identityVerificationService';

export default function RiderFormScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { user, setUserProfile, loginDemo } = useAuth();
  const styles = createStyles(theme);
  const { role, demo } = route.params || {};
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idPhotoUri, setIdPhotoUri] = useState(null);
  const [selfieWithIdPhotoUri, setSelfieWithIdPhotoUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const requireIdUpload = !demo && isFirebaseReady;

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter your name');
      return;
    }
    if (!idType || !idNumber.trim()) {
      Alert.alert('Error', 'Select ID type and enter your ID number');
      return;
    }
    if (requireIdUpload && !idPhotoUri) {
      Alert.alert('Error', 'Upload a clear photo of your selected ID (passport, license, or national ID)');
      return;
    }
    if (requireIdUpload && !selfieWithIdPhotoUri) {
      Alert.alert('Error', 'Take a selfie holding your ID next to your face');
      return;
    }
    setLoading(true);
    try {
      if (demo || !isFirebaseReady) {
        loginDemo({
          id: 'demo-rider',
          role: 'rider',
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          idType,
          idNumber: idNumber.trim(),
          irieCoins: 150,
        });
        return;
      }
      const uid = user?.uid;
      if (!uid) throw new Error('Not authenticated');
      const existing = await getUserProfile(uid);
      const roles = [...(existing?.roles || (existing?.role ? [existing.role] : []))];
      if (!roles.includes('rider')) roles.push('rider');
      const idDocumentUrl = await uploadUserIdDocument(uid, idType, idPhotoUri);
      const idSelfieWithIdUrl = await uploadUserSelfieWithId(uid, selfieWithIdPhotoUri);
      await updateUserProfile(uid, {
        role: 'rider',
        roles,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl,
        idSelfieWithIdUrl,
        idDocumentUploadedAt: new Date().toISOString(),
        idVerified: true,
        irieCoins: existing?.irieCoins ?? 150,
      });
      setUserProfile({
        id: uid,
        ...existing,
        role: 'rider',
        roles,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl,
        idSelfieWithIdUrl,
        irieCoins: existing?.irieCoins ?? 150,
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
        <Text style={styles.title}>Rider Profile</Text>
        <Text style={styles.subtitle}>Tell us how you'd like to be called</Text>
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
          idPhotoUri={idPhotoUri}
          setIdPhotoUri={setIdPhotoUri}
          selfieWithIdPhotoUri={selfieWithIdPhotoUri}
          setSelfieWithIdPhotoUri={setSelfieWithIdPhotoUri}
          requireIdPhoto={true}
        />
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
  button: {
    backgroundColor: theme.colors.green,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
});
