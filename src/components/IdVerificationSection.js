import React, { useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

export const ID_TYPES = [
  { id: 'passport', label: 'Passport' },
  { id: 'drivers_license', label: "Driver's License" },
  { id: 'national_id', label: 'National ID / TRN' },
];

export function getIdTypeLabel(idType) {
  return ID_TYPES.find((t) => t.id === idType)?.label || 'ID';
}

export default function IdVerificationSection({
  idType,
  setIdType,
  idNumber,
  setIdNumber,
  idExpiry,
  setIdExpiry,
  showExpiry = false,
  idPhotoUri,
  setIdPhotoUri,
  /** Selfie with ID in hand (face + ID visible). Required when requireIdPhoto is true. */
  selfieWithIdPhotoUri,
  setSelfieWithIdPhotoUri,
  /** When true, user must upload a photo of the selected ID (skipped in demo flows). */
  requireIdPhoto = true,
  /** When true, user must also upload a selfie holding the ID. Default true when requireIdPhoto. */
  requireSelfieWithId = true,
  /** Drivers only verify with a driver's license (no passport / national ID). */
  driversLicenseOnly = false,
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const needSelfie = requireIdPhoto && requireSelfieWithId && setSelfieWithIdPhotoUri;

  useEffect(() => {
    if (driversLicenseOnly && setIdType && idType !== 'drivers_license') {
      setIdType('drivers_license');
    }
  }, [driversLicenseOnly, setIdType, idType]);

  const typeOptions = driversLicenseOnly
    ? ID_TYPES.filter((t) => t.id === 'drivers_license')
    : ID_TYPES;

  const handleSelectType = (t) => {
    setIdType(t);
    if (setIdPhotoUri) setIdPhotoUri(null);
    if (setSelfieWithIdPhotoUri) setSelfieWithIdPhotoUri(null);
  };

  const pickIdPhoto = async () => {
    if (!idType) {
      Alert.alert(
        'Select ID type',
        driversLicenseOnly
          ? "Upload a clear photo of your driver's license."
          : 'Choose passport, driver license, or national ID first.'
      );
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission', 'Photo library access is needed to upload your ID.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri && setIdPhotoUri) {
      setIdPhotoUri(result.assets[0].uri);
    }
  };

  const pickSelfieWithId = async () => {
    const { status: camStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (camStatus !== 'granted') {
      Alert.alert('Permission', 'Camera access is needed for your selfie with ID.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]?.uri && setSelfieWithIdPhotoUri) {
      setSelfieWithIdPhotoUri(result.assets[0].uri);
    }
  };

  const typeLabel = getIdTypeLabel(idType);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>ID Verification *</Text>
      <Text style={styles.sectionHint}>
        {driversLicenseOnly
          ? "Enter your driver's license number and upload a clear photo of your license."
          : 'Select your ID type, enter the number, and upload a clear photo of that ID'}
      </Text>
      {driversLicenseOnly ? (
        <Text style={[styles.sectionHint, { marginTop: 0, marginBottom: 12, fontWeight: '600', color: theme.colors.primary }]}>
          Driver&apos;s license only (no passport or national ID)
        </Text>
      ) : null}
      {!driversLicenseOnly ? (
        <View style={styles.typeRow}>
          {typeOptions.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.typeBtn, idType === t.id && styles.typeBtnActive]}
              onPress={() => handleSelectType(t.id)}
            >
              <Text style={[styles.typeBtnText, idType === t.id && styles.typeBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder={driversLicenseOnly ? "Driver's license number *" : 'ID / Passport / License number *'}
        value={idNumber}
        onChangeText={setIdNumber}
        placeholderTextColor={theme.colors.textSecondary}
        autoCapitalize="characters"
      />
      {showExpiry && (
        <TextInput
          style={styles.input}
          placeholder="License expiry (e.g. 2026-12)"
          value={idExpiry}
          onChangeText={setIdExpiry}
          placeholderTextColor={theme.colors.textSecondary}
        />
      )}
      {requireIdPhoto && setIdPhotoUri && (
        <>
          <Text style={styles.uploadLabel}>Photo of your {typeLabel} *</Text>
          <Text style={styles.uploadHint}>Must match the ID type selected above</Text>
          <TouchableOpacity style={styles.photoBtn} onPress={pickIdPhoto} activeOpacity={0.8}>
            {idPhotoUri ? (
              <Image source={{ uri: idPhotoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="id-card-outline" size={36} color={theme.colors.primary} />
                <Text style={styles.photoPlaceholderText}>Tap to upload {typeLabel}</Text>
                <Text style={styles.photoHint}>Clear, readable photo (JPG/PNG)</Text>
              </View>
            )}
          </TouchableOpacity>
          {idPhotoUri ? (
            <TouchableOpacity onPress={() => setIdPhotoUri(null)} style={styles.removePhoto}>
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
      {needSelfie && (
        <>
          <Text style={styles.uploadLabel}>Selfie with {typeLabel} in hand *</Text>
          <Text style={styles.uploadHint}>
            Take a photo holding your ID next to your face. Both your face and the ID must be clearly visible.
          </Text>
          <TouchableOpacity style={styles.photoBtn} onPress={pickSelfieWithId} activeOpacity={0.8}>
            {selfieWithIdPhotoUri ? (
              <Image source={{ uri: selfieWithIdPhotoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera-outline" size={36} color={theme.colors.primary} />
                <Text style={styles.photoPlaceholderText}>Tap to take selfie</Text>
                <Text style={styles.photoHint}>Hold your ID and your face in the frame</Text>
              </View>
            )}
          </TouchableOpacity>
          {selfieWithIdPhotoUri ? (
            <TouchableOpacity onPress={() => setSelfieWithIdPhotoUri(null)} style={styles.removePhoto}>
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 12 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  typeBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '20' },
  typeBtnText: { fontSize: 13, color: theme.colors.textSecondary },
  typeBtnTextActive: { color: theme.colors.primary, fontWeight: '600' },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  uploadLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginTop: 8, marginBottom: 4 },
  uploadHint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10 },
  photoBtn: { marginBottom: 8 },
  photoPlaceholder: {
    minHeight: 140,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  photoPlaceholderText: { fontSize: 15, color: theme.colors.primary, fontWeight: '600', marginTop: 8 },
  photoHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  photoPreview: { width: '100%', height: 160, borderRadius: 12 },
  removePhoto: { alignSelf: 'flex-start', marginBottom: 8 },
  removePhotoText: { fontSize: 13, color: theme.colors.error || '#DC2626', fontWeight: '600' },
});
