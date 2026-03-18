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
import { doc, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseReady } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import IdVerificationSection from '../../components/IdVerificationSection';

export default function RiderFormScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { setUserProfile, loginDemo } = useAuth();
  const styles = createStyles(theme);
  const { role, demo } = route.params || {};
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter your name');
      return;
    }
    if (!idType || !idNumber.trim()) {
      Alert.alert('Error', 'Select ID type and enter your ID number');
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
      const uid = auth?.currentUser?.uid;
      if (!uid) throw new Error('Not authenticated');
      await setDoc(
        doc(db, 'users', uid),
        {
          role: 'rider',
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          idType,
          idNumber: idNumber.trim(),
          idVerified: true,
          irieCoins: 150,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setUserProfile({ id: uid, role: 'rider', name: name.trim(), email: email.trim(), phone: phone.trim(), idType, idNumber: idNumber.trim(), irieCoins: 150 });
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
