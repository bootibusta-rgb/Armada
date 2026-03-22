import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { isFirebaseReady } from '../../config/firebase';
import {
  subscribeToCarRentals,
  filterCarRentalsNear,
  createCarRentalRequest,
} from '../../services/carRentalService';
import { ensureRentalChatParticipants } from '../../services/chatService';

const DEMO_RENTALS = [
  {
    id: 'demo-cr-1',
    uid: 'demo-cr-1',
    name: 'Island Wheels',
    vehicleDisplayName: 'Toyota Corolla',
    licensePlate: 'ABC 1234',
    dailyRate: 4500,
    rentalLocation: 'Kingston',
    lat: 18.0179,
    lng: -76.8099,
    photoUrls: [],
    rentalAvailable: true,
  },
  {
    id: 'demo-cr-2',
    uid: 'demo-cr-2',
    name: 'Spanish Town Auto',
    vehicleDisplayName: 'Honda Fit',
    licensePlate: 'ST 9001',
    dailyRate: 3800,
    rentalLocation: 'Spanish Town',
    lat: 17.9911,
    lng: -76.9574,
    photoUrls: [],
    rentalAvailable: true,
  },
];

export default function RentACarScreen({ navigation, route }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const pickupHint = route.params?.pickupText || '';

  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeVisible, setComposeVisible] = useState(false);
  const [selectedListing, setSelectedListing] = useState(null);
  const [pickupSpot, setPickupSpot] = useState(pickupHint || '');
  const [timeChoice, setTimeChoice] = useState('now');
  const [riderPhone, setRiderPhone] = useState(userProfile?.phone || '');
  const [riderMessage, setRiderMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pickupHint) setPickupSpot(pickupHint);
  }, [pickupHint]);

  useEffect(() => {
    setRiderPhone(userProfile?.phone || '');
  }, [userProfile?.phone]);

  useEffect(() => {
    if (!isFirebaseReady) {
      setList(DEMO_RENTALS);
      setLoading(false);
      return;
    }
    const unsub = subscribeToCarRentals((rows) => {
      setList(rows);
      setLoading(false);
    });
    return unsub;
  }, []);

  const nearby = useMemo(
    () =>
      filterCarRentalsNear(list, {
        pickupText: pickupHint,
        refLat: 18.0179,
        refLng: -76.8099,
        maxKm: 40,
      }),
    [list, pickupHint]
  );

  const timeLabel = () => {
    if (timeChoice === 'now') return 'Now';
    if (timeChoice === '20') return 'In 20 mins';
    return 'Now';
  };

  const openCompose = (item) => {
    const riderId = userProfile?.id;
    if (!riderId) {
      Alert.alert('Sign in', 'You need to be signed in to request a rental.');
      return;
    }
    if (userProfile?.role !== 'rider') {
      Alert.alert('Riders only', 'Switch to the Rider role to request a car rental.');
      return;
    }
    setSelectedListing(item);
    setPickupSpot(pickupHint || pickupSpot || '');
    setComposeVisible(true);
  };

  const submitRequest = async () => {
    if (!selectedListing) return;
    if (!pickupSpot.trim()) {
      Alert.alert('Pickup', 'Enter where you want to pick up the car.');
      return;
    }
    const riderId = userProfile?.id;
    try {
      setSubmitting(true);
      if (!isFirebaseReady) {
        setComposeVisible(false);
        navigation.navigate('RentalChat', {
          requestId: `demo-${Date.now()}`,
          otherName: selectedListing.name,
          riderId,
          ownerId: selectedListing.uid,
          isDemo: true,
        });
        return;
      }
      const requestId = await createCarRentalRequest({
        riderId,
        ownerId: selectedListing.uid,
        ownerName: selectedListing.name,
        licensePlate: selectedListing.licensePlate,
        vehicleDisplayName: selectedListing.vehicleDisplayName || selectedListing.name,
        dailyRate: selectedListing.dailyRate,
        rentalLocation: selectedListing.rentalLocation,
        riderName: userProfile?.name || 'Rider',
        riderPhone: riderPhone.trim(),
        riderPickupSpot: pickupSpot.trim(),
        riderTimeLabel: timeLabel(),
        riderMessage: riderMessage.trim(),
        riderPhotoUrl: userProfile?.profilePhotoUrl || userProfile?.photoURL || null,
      });
      await ensureRentalChatParticipants(requestId, riderId, selectedListing.uid);
      setComposeVisible(false);
      navigation.navigate('RentalChat', {
        requestId,
        otherName: selectedListing.name,
        riderId,
        ownerId: selectedListing.uid,
        isDemo: false,
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not create request');
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {item.photoUrls?.[0] ? (
        <Image source={{ uri: item.photoUrls[0] }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
          <Text style={styles.placeholderEmoji}>🚙</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.vehicleLine}>{item.vehicleDisplayName || 'Vehicle'}</Text>
        <Text style={styles.cardMeta}>Plate: {item.licensePlate}</Text>
        <Text style={styles.cardMeta}>{item.rentalLocation}</Text>
        {item.rentalAddress ? (
          <Text style={styles.cardAddr} numberOfLines={2}>
            {item.rentalAddress}
          </Text>
        ) : null}
        <Text style={styles.cardRate}>J${item.dailyRate} / day</Text>
        <TouchableOpacity style={styles.requestBtn} onPress={() => openCompose(item)}>
          <Text style={styles.requestBtnText}>Request</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Rent a Car</Text>
        <Text style={styles.subtitle}>Nearby Car Rental listings</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={nearby.length ? nearby : list}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No Car Rentals listed yet. Check back soon.</Text>
          }
          renderItem={renderItem}
        />
      )}

      <Modal visible={composeVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Request rental</Text>
              <Text style={styles.modalSub}>
                {selectedListing?.vehicleDisplayName || 'Vehicle'} • {selectedListing?.licensePlate}
              </Text>
              <Text style={styles.fieldLabel}>Pickup spot</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="e.g. New Kingston – near Emancipation Park"
                value={pickupSpot}
                onChangeText={setPickupSpot}
                placeholderTextColor={theme.colors.textSecondary}
              />
              <Text style={styles.fieldLabel}>Time</Text>
              <View style={styles.chipRow}>
                {[
                  { id: 'now', label: 'Now' },
                  { id: '20', label: 'In 20 mins' },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.timeChip, timeChoice === c.id && styles.timeChipOn]}
                    onPress={() => setTimeChoice(c.id)}
                  >
                    <Text style={[styles.timeChipTxt, timeChoice === c.id && styles.timeChipTxtOn]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.fieldLabel}>Your phone (tap-to-call for owner)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="876-555-1234"
                value={riderPhone}
                onChangeText={setRiderPhone}
                placeholderTextColor={theme.colors.textSecondary}
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldLabel}>Message</Text>
              <TextInput
                style={[styles.modalInput, styles.modalMsg]}
                placeholder="Hey, can I grab the car at 4pm? Heading to Ocho Rios after."
                value={riderMessage}
                onChangeText={setRiderMessage}
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                maxLength={400}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setComposeVisible(false)}>
                  <Text style={styles.modalCancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSend, submitting && { opacity: 0.6 }]}
                  onPress={submitRequest}
                  disabled={submitting}
                >
                  <Text style={styles.modalSendTxt}>{submitting ? 'Sending…' : 'Send request'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { padding: 16, paddingTop: 8 },
    backBtn: { marginBottom: 8 },
    backText: { fontSize: 16, color: theme.colors.primary, fontWeight: '600' },
    title: { fontSize: 22, fontWeight: 'bold', color: theme.colors.primary },
    subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
    list: { padding: 16, paddingBottom: 40 },
    card: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      marginBottom: 14,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
    },
    cardImage: { width: 110, height: 130 },
    cardImagePlaceholder: { backgroundColor: theme.colors.primary + '15', justifyContent: 'center', alignItems: 'center' },
    placeholderEmoji: { fontSize: 36 },
    cardBody: { flex: 1, padding: 12, justifyContent: 'center' },
    cardTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.primary },
    vehicleLine: { fontSize: 14, fontWeight: '700', color: theme.colors.success, marginTop: 2 },
    cardMeta: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
    cardAddr: { fontSize: 12, color: theme.colors.text, marginTop: 4, fontWeight: '500' },
    cardRate: { fontSize: 15, fontWeight: '700', color: theme.colors.success, marginTop: 6 },
    requestBtn: {
      marginTop: 10,
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.orange,
      paddingVertical: 8,
      paddingHorizontal: 18,
      borderRadius: 10,
    },
    requestBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold' },
    empty: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 32, fontSize: 15 },
    modalRoot: { flex: 1 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 18,
      maxHeight: '88%',
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary },
    modalSub: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 8 },
    modalInput: {
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      color: theme.colors.text,
      backgroundColor: theme.colors.surface,
    },
    modalMsg: { minHeight: 72, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', gap: 10 },
    timeChip: {
      paddingVertical: 10,
      paddingHorizontal: 18,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
    },
    timeChipOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '18' },
    timeChipTxt: { fontWeight: '600', color: theme.colors.textSecondary },
    timeChipTxtOn: { color: theme.colors.primary },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
    modalCancel: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10, borderWidth: 2, borderColor: theme.colors.primaryLight },
    modalCancelTxt: { fontWeight: '700', color: theme.colors.textSecondary },
    modalSend: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: theme.colors.orange },
    modalSendTxt: { fontWeight: '800', color: theme.colors.onPrimary },
  });
