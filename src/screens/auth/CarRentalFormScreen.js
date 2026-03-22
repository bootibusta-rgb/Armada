import React, { useState, useEffect } from 'react';
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
import { updateUserProfile } from '../../services/authService';
import { useTheme } from '../../context/ThemeContext';
import {
  payCarRentalListingWithPayPal,
  payCarRentalListingFallback,
} from '../../services/carRentalListingPayPalService';
import IdVerificationSection from '../../components/IdVerificationSection';
import { uploadUserIdDocument, uploadUserSelfieWithId } from '../../services/identityVerificationService';
import {
  RENTAL_LOCATION_PRESETS,
  getPresetById,
  uploadCarRentalPhoto,
  uploadCarRentalVehicleDoc,
  computeWeeklyListingTotalJmd,
  countRentalVehiclesForBilling,
} from '../../services/carRentalService';
import { CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD } from '../../config/carRentalPricing';

const MAX_PHOTOS = 5;

function DocSlot({ label, uri, onPick, onClear, theme, styles }) {
  return (
    <View style={styles.docSlot}>
      <Text style={styles.docLabel}>{label}</Text>
      <TouchableOpacity style={styles.docTouch} onPress={onPick}>
        {uri ? (
          <Image source={{ uri }} style={styles.docImg} />
        ) : (
          <View style={styles.docPh}>
            <Ionicons name="document-text-outline" size={22} color={theme.colors.textSecondary} />
            <Text style={styles.docPhText}>Tap</Text>
          </View>
        )}
      </TouchableOpacity>
      {uri ? (
        <TouchableOpacity onPress={onClear}>
          <Text style={styles.docClear}>Clear</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function CarRentalFormScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { user, setUserProfile, loginDemo, refreshUserProfile } = useAuth();
  const styles = createStyles(theme);
  const { demo } = route.params || {};

  const [name, setName] = useState('');
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idPhotoUri, setIdPhotoUri] = useState(null);
  const [selfieWithIdPhotoUri, setSelfieWithIdPhotoUri] = useState(null);
  const [rentalVehicleName, setRentalVehicleName] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [dailyRate, setDailyRate] = useState('');
  const [locationId, setLocationId] = useState(RENTAL_LOCATION_PRESETS[0].id);
  const [rentalAddress, setRentalAddress] = useState('');
  const [latText, setLatText] = useState(String(RENTAL_LOCATION_PRESETS[0].lat));
  const [lngText, setLngText] = useState(String(RENTAL_LOCATION_PRESETS[0].lng));
  const [photoUris, setPhotoUris] = useState([]);
  const [regUri, setRegUri] = useState(null);
  const [insUri, setInsUri] = useState(null);
  const [fitUri, setFitUri] = useState(null);
  const [altLabel, setAltLabel] = useState('');
  const [altPlate, setAltPlate] = useState('');
  const [altRate, setAltRate] = useState('');
  const [altPhotoUri, setAltPhotoUri] = useState(null);
  const [altRegUri, setAltRegUri] = useState(null);
  const [altInsUri, setAltInsUri] = useState(null);
  const [altFitUri, setAltFitUri] = useState(null);
  const [loading, setLoading] = useState(false);

  const requireIdUpload = !demo && isFirebaseReady;
  const hasAltVehicle = !!(altLabel.trim() && altRate.trim() && altPlate.trim());

  useEffect(() => {
    const p = getPresetById(locationId);
    setLatText(String(p.lat));
    setLngText(String(p.lng));
  }, [locationId]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission', 'Photo library access is needed');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.82,
    });
    if (!result.canceled && result.assets[0]?.uri) return result.assets[0].uri;
    return null;
  };

  const addPhoto = async () => {
    if (photoUris.length >= MAX_PHOTOS) {
      Alert.alert('Limit', `You can add up to ${MAX_PHOTOS} photos`);
      return;
    }
    const uri = await pickImage();
    if (uri) setPhotoUris((prev) => [...prev, uri]);
  };

  const removePhotoAt = (index) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  };

  const pickAltPhoto = async () => {
    const uri = await pickImage();
    if (uri) setAltPhotoUri(uri);
  };

  const validate = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter your name or business name');
      return false;
    }
    if (!demo && isFirebaseReady) {
      if (!idType || !idNumber.trim()) {
        Alert.alert('Error', 'Select ID type and enter your ID number for verification');
        return false;
      }
      if (requireIdUpload && !idPhotoUri) {
        Alert.alert('Error', 'Upload a clear photo of your government ID');
        return false;
      }
      if (requireIdUpload && !selfieWithIdPhotoUri) {
        Alert.alert('Error', 'Take a selfie holding your ID next to your face');
        return false;
      }
    }
    if (!rentalVehicleName.trim()) {
      Alert.alert('Error', 'Enter the vehicle model (e.g. Toyota Corolla)');
      return false;
    }
    if (!licensePlate.trim()) {
      Alert.alert('Error', 'Enter the vehicle license plate');
      return false;
    }
    const rateNum = parseFloat(dailyRate);
    if (!dailyRate.trim() || Number.isNaN(rateNum) || rateNum <= 0) {
      Alert.alert('Error', 'Enter a valid daily rate (J$)');
      return false;
    }
    if (!rentalAddress.trim()) {
      Alert.alert('Error', 'Enter your business / yard address');
      return false;
    }
    const latNum = parseFloat(latText);
    const lngNum = parseFloat(lngText);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      Alert.alert('Error', 'Enter valid map coordinates (lat / lng) or pick an area chip');
      return false;
    }
    if (!demo && isFirebaseReady && photoUris.length === 0) {
      Alert.alert('Error', 'Add at least one photo of the vehicle');
      return false;
    }
    if (!demo && isFirebaseReady) {
      if (!regUri || !insUri || !fitUri) {
        Alert.alert('Error', 'Upload registration, insurance, and fitness for your primary vehicle');
        return false;
      }
    }
    if (hasAltVehicle) {
      const ar = parseFloat(altRate);
      if (Number.isNaN(ar) || ar <= 0) {
        Alert.alert('Error', 'Enter a valid daily rate for the second vehicle');
        return false;
      }
      if (!demo && isFirebaseReady) {
        if (!altRegUri || !altInsUri || !altFitUri) {
          Alert.alert('Error', 'Upload registration, insurance, and fitness for the second vehicle');
          return false;
        }
      }
    }
    return true;
  };

  const runSubmit = async () => {
    const preset = getPresetById(locationId);
    const latNum = parseFloat(latText);
    const lngNum = parseFloat(lngText);
    const rateNum = parseFloat(dailyRate);
    setLoading(true);
    try {
      if (demo || !isFirebaseReady) {
        const rentalAlternateVehicles = [];
        if (hasAltVehicle) {
          const ar = parseFloat(altRate);
          rentalAlternateVehicles.push({
            label: altLabel.trim(),
            plate: altPlate.trim(),
            dailyRate: ar,
            photoUrls: [],
            docs: {},
          });
        }
        const vehicleCount = countRentalVehiclesForBilling({ rentalAlternateVehicles });
        const far = new Date();
        far.setFullYear(far.getFullYear() + 1);
        loginDemo({
          id: 'demo-car-rental',
          role: 'carRental',
          name: name.trim(),
          rentalVehicleName: rentalVehicleName.trim(),
          rentalLicensePlate: licensePlate.trim(),
          rentalDailyRate: rateNum,
          rentalLocation: preset.label,
          rentalAddress: rentalAddress.trim(),
          rentalLat: latNum,
          rentalLng: lngNum,
          rentalPhotoUrls: [],
          rentalPrimaryVehicleDocs: {},
          rentalAlternateVehicles,
          rentalAvailable: true,
          idVerified: true,
          idType: idType || 'drivers_license',
          idNumber: idNumber.trim() || 'DEMO',
          rentalListingSubscription: {
            expiresAt: far.toISOString(),
            weeklyRatePerVehicleJmd: CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD,
            vehicleCountBilled: vehicleCount,
            status: 'active',
          },
        });
        return;
      }

      const uid = user?.uid;
      if (!uid) throw new Error('Not authenticated');

      const idDocumentUrl = await uploadUserIdDocument(uid, idType, idPhotoUri);
      const idSelfieWithIdUrl = await uploadUserSelfieWithId(uid, selfieWithIdPhotoUri);

      const rentalPhotoUrls = [];
      for (const uri of photoUris) {
        rentalPhotoUrls.push(await uploadCarRentalPhoto(uid, uri));
      }

      const registrationUrl = await uploadCarRentalVehicleDoc(uid, 'primary', 'registration', regUri);
      const insuranceUrl = await uploadCarRentalVehicleDoc(uid, 'primary', 'insurance', insUri);
      const fitnessUrl = await uploadCarRentalVehicleDoc(uid, 'primary', 'fitness', fitUri);
      const rentalPrimaryVehicleDocs = { registrationUrl, insuranceUrl, fitnessUrl };

      let rentalAlternateVehicles = [];
      if (hasAltVehicle) {
        const ar = parseFloat(altRate);
        let altUrls = [];
        if (altPhotoUri) {
          altUrls = [await uploadCarRentalPhoto(uid, altPhotoUri)];
        }
        const altReg = await uploadCarRentalVehicleDoc(uid, 'alt0', 'registration', altRegUri);
        const altIns = await uploadCarRentalVehicleDoc(uid, 'alt0', 'insurance', altInsUri);
        const altFit = await uploadCarRentalVehicleDoc(uid, 'alt0', 'fitness', altFitUri);
        rentalAlternateVehicles = [
          {
            label: altLabel.trim(),
            plate: altPlate.trim(),
            dailyRate: ar,
            photoUrls: altUrls,
            docs: { registrationUrl: altReg, insuranceUrl: altIns, fitnessUrl: altFit },
          },
        ];
      }

      const vehicleCount = countRentalVehiclesForBilling({ rentalAlternateVehicles });

      /** Listing fee is applied only after PayPal capture (server). Omit subscription until paid. */
      await updateUserProfile(uid, {
        role: 'carRental',
        name: name.trim(),
        rentalVehicleName: rentalVehicleName.trim(),
        rentalLicensePlate: licensePlate.trim(),
        rentalDailyRate: rateNum,
        rentalLocation: preset.label,
        rentalAddress: rentalAddress.trim(),
        rentalLat: latNum,
        rentalLng: lngNum,
        rentalPhotoUrls,
        rentalPrimaryVehicleDocs,
        rentalAlternateVehicles,
        rentalAvailable: true,
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl,
        idSelfieWithIdUrl,
        idDocumentUploadedAt: new Date().toISOString(),
        idVerified: true,
        rentalListingSubscription: null,
      });

      const baseProfile = {
        id: uid,
        role: 'carRental',
        name: name.trim(),
        rentalVehicleName: rentalVehicleName.trim(),
        rentalLicensePlate: licensePlate.trim(),
        rentalDailyRate: rateNum,
        rentalLocation: preset.label,
        rentalAddress: rentalAddress.trim(),
        rentalLat: latNum,
        rentalLng: lngNum,
        rentalPhotoUrls,
        rentalPrimaryVehicleDocs,
        rentalAlternateVehicles,
        rentalAvailable: true,
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl,
        idSelfieWithIdUrl,
        idVerified: true,
        rentalListingSubscription: null,
      };
      setUserProfile(baseProfile);

      const weeklyTotal = computeWeeklyListingTotalJmd(vehicleCount);
      const r = await payCarRentalListingWithPayPal();
      if (r.success) {
        if (r.subscription) {
          setUserProfile((p) => (p ? { ...p, rentalListingSubscription: r.subscription } : p));
        }
        await refreshUserProfile?.();
        Alert.alert(
          'Welcome',
          `Listing paid for your first week (J$${weeklyTotal.toLocaleString()} for ${vehicleCount} vehicle(s)).`
        );
        return;
      }
      if (r.cancelled) {
        Alert.alert(
          'Payment cancelled',
          'Your car rental profile is saved. Open Rent a Car → Listing anytime to pay and go live.'
        );
        return;
      }
      const msg = r.error || 'Payment failed';
      const paypalMissing =
        r.code === 'functions/failed-precondition' &&
        (/paypal|PayPal|not configured|INVALID/i.test(msg) || /credential|secret/i.test(msg));
      if (paypalMissing) {
        Alert.alert(
          'PayPal not configured',
          'Extend listing without PayPal for local testing? (Not for production.)',
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes (dev)',
              onPress: async () => {
                try {
                  const nextSub = await payCarRentalListingFallback(uid, baseProfile);
                  setUserProfile((p) => (p ? { ...p, rentalListingSubscription: nextSub } : p));
                  await refreshUserProfile?.();
                  Alert.alert('OK', 'Listing extended (dev fallback).');
                } catch (err) {
                  Alert.alert('Error', err.message || 'Failed');
                }
              },
            },
          ]
        );
        return;
      }
      Alert.alert('Payment', msg);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const rentalAlternateVehiclesPreview = [];
    if (hasAltVehicle) {
      rentalAlternateVehiclesPreview.push({});
    }
    const vehicleCount = countRentalVehiclesForBilling({ rentalAlternateVehicles: rentalAlternateVehiclesPreview });
    const weeklyFee = computeWeeklyListingTotalJmd(vehicleCount);
    if (demo || !isFirebaseReady) {
      runSubmit();
      return;
    }
    Alert.alert(
      'Verify & pay listing',
      `Government ID verification + vehicle documents are required.\n\nYour profile will be saved first, then PayPal opens for exactly J$${weeklyFee.toLocaleString()} (${vehicleCount} vehicle(s) × J$${CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD.toLocaleString()}/week). Your listing goes live only after payment succeeds.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save & pay with PayPal',
          onPress: () => {
            runSubmit();
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Sign up as Car Rental</Text>
        <Text style={styles.subtitle}>
          Verified ID, full location, documents per vehicle, and J${CAR_RENTAL_LISTING_FEE_PER_VEHICLE_WEEK_JMD.toLocaleString()}/vehicle/week to list.
        </Text>

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

        <TextInput
          style={styles.input}
          placeholder="Your name or business name *"
          value={name}
          onChangeText={setName}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          placeholder="Vehicle (e.g. Toyota Corolla) *"
          value={rentalVehicleName}
          onChangeText={setRentalVehicleName}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          placeholder="License plate *"
          value={licensePlate}
          onChangeText={setLicensePlate}
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="Daily rate (J$) *"
          value={dailyRate}
          onChangeText={setDailyRate}
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="decimal-pad"
        />

        <Text style={styles.sectionLabel}>Area (map pin) *</Text>
        <View style={styles.chipWrap}>
          {RENTAL_LOCATION_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.chip, locationId === p.id && styles.chipActive]}
              onPress={() => setLocationId(p.id)}
            >
              <Text style={[styles.chipText, locationId === p.id && styles.chipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Your location / address *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 12 Main St, Kingston — where renters pick up"
          value={rentalAddress}
          onChangeText={setRentalAddress}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Latitude"
            value={latText}
            onChangeText={setLatText}
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.input, styles.half]}
            placeholder="Longitude"
            value={lngText}
            onChangeText={setLngText}
            placeholderTextColor={theme.colors.textSecondary}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.hint}>Tip: area chips fill coordinates; adjust if your yard is elsewhere.</Text>

        <Text style={styles.sectionLabel}>Vehicle photos * (up to {MAX_PHOTOS})</Text>
        <TouchableOpacity style={styles.addPhotoBtn} onPress={addPhoto}>
          <Ionicons name="camera-outline" size={22} color={theme.colors.primary} />
          <Text style={styles.addPhotoText}>Add photo</Text>
        </TouchableOpacity>
        <View style={styles.photoGrid}>
          {photoUris.map((uri, i) => (
            <View key={`${uri}-${i}`} style={styles.photoTile}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.removePhoto} onPress={() => removePhotoAt(i)}>
                <Text style={styles.removePhotoText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Primary vehicle documents *</Text>
        <Text style={styles.docHint}>Registration, insurance, fitness — required for each listed car.</Text>
        <View style={styles.docRow}>
          <DocSlot
            label="Reg."
            uri={regUri}
            onPick={async () => setRegUri(await pickImage())}
            onClear={() => setRegUri(null)}
            theme={theme}
            styles={styles}
          />
          <DocSlot
            label="Ins."
            uri={insUri}
            onPick={async () => setInsUri(await pickImage())}
            onClear={() => setInsUri(null)}
            theme={theme}
            styles={styles}
          />
          <DocSlot
            label="Fit."
            uri={fitUri}
            onPick={async () => setFitUri(await pickImage())}
            onClear={() => setFitUri(null)}
            theme={theme}
            styles={styles}
          />
        </View>

        <Text style={styles.sectionLabel}>Second vehicle (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Toyota Prado"
          value={altLabel}
          onChangeText={setAltLabel}
          placeholderTextColor={theme.colors.textSecondary}
        />
        <TextInput
          style={styles.input}
          placeholder="Plate * (if adding 2nd vehicle)"
          value={altPlate}
          onChangeText={setAltPlate}
          placeholderTextColor={theme.colors.textSecondary}
          autoCapitalize="characters"
        />
        <TextInput
          style={styles.input}
          placeholder="Daily rate (J$) for second vehicle"
          value={altRate}
          onChangeText={setAltRate}
          placeholderTextColor={theme.colors.textSecondary}
          keyboardType="decimal-pad"
        />
        <TouchableOpacity style={styles.addPhotoBtn} onPress={pickAltPhoto}>
          <Ionicons name="image-outline" size={22} color={theme.colors.primary} />
          <Text style={styles.addPhotoText}>{altPhotoUri ? 'Change vehicle photo' : 'Vehicle photo (optional)'}</Text>
        </TouchableOpacity>
        {altPhotoUri ? <Image source={{ uri: altPhotoUri }} style={styles.altPreview} /> : null}

        {hasAltVehicle ? (
          <>
            <Text style={styles.sectionLabel}>Second vehicle documents *</Text>
            <View style={styles.docRow}>
              <DocSlot
                label="Reg."
                uri={altRegUri}
                onPick={async () => setAltRegUri(await pickImage())}
                onClear={() => setAltRegUri(null)}
                theme={theme}
                styles={styles}
              />
              <DocSlot
                label="Ins."
                uri={altInsUri}
                onPick={async () => setAltInsUri(await pickImage())}
                onClear={() => setAltInsUri(null)}
                theme={theme}
                styles={styles}
              />
              <DocSlot
                label="Fit."
                uri={altFitUri}
                onPick={async () => setAltFitUri(await pickImage())}
                onClear={() => setAltFitUri(null)}
                theme={theme}
                styles={styles}
              />
            </View>
          </>
        ) : null}

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

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 24, paddingBottom: 80 },
    title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
    subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24, lineHeight: 20 },
    input: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: 16,
      fontSize: 16,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
    },
    row: { flexDirection: 'row', gap: 10 },
    half: { flex: 1 },
    hint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16, marginTop: -8 },
    sectionLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.primary, marginBottom: 10 },
    docHint: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10, marginTop: -4 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    chip: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
      backgroundColor: theme.colors.surface,
    },
    chipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '18' },
    chipText: { fontSize: 13, color: theme.colors.textSecondary },
    chipTextActive: { color: theme.colors.primary, fontWeight: '600' },
    addPhotoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
      marginBottom: 12,
    },
    addPhotoText: { fontSize: 15, color: theme.colors.primary, fontWeight: '600' },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
    photoTile: { width: 100, height: 100, borderRadius: 10, overflow: 'hidden' },
    photoThumb: { width: '100%', height: '100%' },
    removePhoto: {
      position: 'absolute',
      top: 4,
      right: 4,
      backgroundColor: 'rgba(0,0,0,0.55)',
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removePhotoText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    docRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 20 },
    docSlot: { flex: 1, alignItems: 'center' },
    docLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6 },
    docTouch: { width: '100%', aspectRatio: 1, maxWidth: 110 },
    docImg: { width: '100%', height: '100%', borderRadius: 10 },
    docPh: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
      borderStyle: 'dashed',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 88,
    },
    docPhText: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 4 },
    docClear: { fontSize: 11, color: theme.colors.error, marginTop: 4, fontWeight: '600' },
    altPreview: { width: 120, height: 90, borderRadius: 10, marginBottom: 16 },
    button: {
      backgroundColor: theme.colors.orange,
      padding: 16,
      borderRadius: theme.borderRadius.md,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  });
