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
import { updateUserProfile } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import IdVerificationSection from '../../components/IdVerificationSection';
import { uploadUserIdDocument, uploadUserSelfieWithId } from '../../services/identityVerificationService';

export default function CorporateFormScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { user, setUserProfile, loginDemo } = useAuth();
  const styles = createStyles(theme);
  const { demo } = route.params || {};
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idPhotoUri, setIdPhotoUri] = useState(null);
  const [selfieWithIdPhotoUri, setSelfieWithIdPhotoUri] = useState(null);
  const [loading, setLoading] = useState(false);
  const requireIdUpload = !demo && isFirebaseReady;

  const handleSubmit = async () => {
    if (!companyName.trim()) {
      Alert.alert('Error', 'Enter company name');
      return;
    }
    if (!contactPerson.trim()) {
      Alert.alert('Error', 'Enter contact person');
      return;
    }
    if (!idType || !idNumber.trim()) {
      Alert.alert('Error', 'Select ID type and enter contact person ID number');
      return;
    }
    if (requireIdUpload && !idPhotoUri) {
      Alert.alert('Error', 'Upload a clear photo of the contact person’s selected ID');
      return;
    }
    if (requireIdUpload && !selfieWithIdPhotoUri) {
      Alert.alert('Error', 'Take a selfie of the contact person holding their ID next to their face');
      return;
    }
    setLoading(true);
    try {
      if (demo || !isFirebaseReady) {
        loginDemo({
          id: 'demo-corporate',
          role: 'corporate',
          name: companyName.trim(),
          contactPerson: contactPerson.trim(),
          email: email.trim() || undefined,
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
        role: 'corporate',
        name: companyName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim() || null,
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl,
        idSelfieWithIdUrl,
        idDocumentUploadedAt: new Date().toISOString(),
        idVerified: true,
      });
      setUserProfile({
        id: uid,
        role: 'corporate',
        name: companyName.trim(),
        contactPerson: contactPerson.trim(),
        email: email.trim(),
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
        <Text style={styles.title}>Corporate Profile</Text>
        <Text style={styles.subtitle}>Register your company for staff rides</Text>
        <TextInput
          style={styles.input}
          placeholder="Company name *"
          value={companyName}
          onChangeText={setCompanyName}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          placeholder="Contact person *"
          value={contactPerson}
          onChangeText={setContactPerson}
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="words"
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
          requireIdPhoto={requireIdUpload}
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
    backgroundColor: theme.colors.purple,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
});
