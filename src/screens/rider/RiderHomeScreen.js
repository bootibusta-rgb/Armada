import React, { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { createRideRequest } from '../../services/rideService';
import VoiceBiddingButton from '../../components/VoiceBiddingButton';
import { haversineKm } from '../../utils/haversine';
import { REDEEM_DISCOUNT } from '../../services/iriCoinsService';
import { validatePromo, getPromoDiscount } from '../../services/promoService';
import { subscribeToVendors } from '../../services/vendorService';
import { getRouteHistory, addRoute } from '../../services/routeHistoryService';
import OfflineBanner from '../../components/OfflineBanner';

const FALLBACK_VENDORS = [
  {
    id: 'jerkman',
    name: 'Jerkman',
    lat: 18.007,
    lng: -76.782,
    menu: [
      { id: 'j1', name: 'Jerk Chicken', price: 450 },
      { id: 'j2', name: 'Festival', price: 100 },
      { id: 'j3', name: 'Rice & Peas', price: 200 },
    ],
    items: ['Jerk Chicken', 'Festival', 'Rice & Peas'],
    pinColor: 'orange',
  },
  {
    id: 'patty-palace',
    name: 'Patty Palace',
    lat: 18.012,
    lng: -76.79,
    menu: [
      { id: 'p1', name: 'Beef Patty', price: 250 },
      { id: 'p2', name: 'Chicken Patty', price: 220 },
    ],
    items: ['Beef Patty', 'Chicken Patty'],
    pinColor: 'purple',
  },
  {
    id: 'kfc-kingston',
    name: 'KFC Kingston',
    lat: 18.005,
    lng: -76.795,
    menu: [
      { id: 'k1', name: 'Zinger Burger', price: 650 },
      { id: 'k2', name: 'Fries', price: 180 },
    ],
    items: ['Zinger Burger', 'Fries'],
    pinColor: 'red',
  },
];

const PICKUP_COORDS = { lat: 18.0179, lng: -76.8099 };
const DROPOFF_COORDS = { lat: 18.4712, lng: -77.9188 };
const BASE_FEE = 100;
const PER_KM_FEE = 50.5;
const STOP_FEE = 50;      // J$ per stop
const STOP_MINUTES = 5;   // minutes added per stop

export default function RiderHomeScreen({ navigation, route }) {
  const { theme } = useTheme();
  const { userProfile } = useAuth();
  const rebook = route.params || {};
  const [pickup, setPickup] = useState(rebook.rebookPickup || 'Kingston, Jamaica');
  const [stops, setStops] = useState([]);
  const [draftStop, setDraftStop] = useState(null);
  const [dropoff, setDropoff] = useState(rebook.rebookDropoff || 'Montego Bay, Jamaica');
  const [bidPrice, setBidPrice] = useState('1500');
  const [loading, setLoading] = useState(false);
  const [splitCount, setSplitCount] = useState(1);
  const [foodStopModalVisible, setFoodStopModalVisible] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [foodStop, setFoodStop] = useState(null);
  const [useRedeem, setUseRedeem] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [vendors, setVendors] = useState(FALLBACK_VENDORS);
  const [routeHistory, setRouteHistory] = useState([]);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!(s?.isConnected ?? true)));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (userProfile?.id) getRouteHistory(userProfile.id).then(setRouteHistory);
  }, [userProfile?.id]);

  useEffect(() => {
    if (rebook.rebookPickup) setPickup(rebook.rebookPickup);
    if (rebook.rebookDropoff) setDropoff(rebook.rebookDropoff);
  }, [rebook.rebookPickup, rebook.rebookDropoff]);

  useEffect(() => {
    const unsub = subscribeToVendors((v) => {
      setVendors(v.length > 0 ? v : FALLBACK_VENDORS);
    });
    return unsub;
  }, []);

  const coins = userProfile?.irieCoins ?? 150;
  const canRedeem = coins >= 100;

  const region = {
    latitude: 18.0179,
    longitude: -76.8099,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  };

  const directRouteKm = haversineKm(
    PICKUP_COORDS.lat,
    PICKUP_COORDS.lng,
    DROPOFF_COORDS.lat,
    DROPOFF_COORDS.lng
  );

  const calculateDetourFee = (vendor) => {
    const pickupToVendor = haversineKm(PICKUP_COORDS.lat, PICKUP_COORDS.lng, vendor.lat, vendor.lng);
    const vendorToDropoff = haversineKm(vendor.lat, vendor.lng, DROPOFF_COORDS.lat, DROPOFF_COORDS.lng);
    const detourRouteKm = pickupToVendor + vendorToDropoff;
    const extraKm = Math.abs(directRouteKm - detourRouteKm);
    return Math.round(BASE_FEE + extraKm * PER_KM_FEE);
  };

  const toggleItem = (menuItem) => {
    setSelectedItems((prev) => {
      const exists = prev.some((i) => i.id === menuItem.id);
      if (exists) return prev.filter((i) => i.id !== menuItem.id);
      return [...prev, menuItem];
    });
  };

  const isItemSelected = (menuItem) => selectedItems.some((i) => i.id === menuItem.id);

  const handleSelectVendor = (vendor) => {
    setSelectedVendor(vendor);
    setSelectedItems([]);
  };

  const handleConfirmFoodStop = () => {
    if (!selectedVendor || selectedItems.length === 0) {
      Alert.alert('Error', 'Select a vendor and at least one item');
      return;
    }
    const detourFee = calculateDetourFee(selectedVendor);
    const itemsTotal = selectedItems.reduce((sum, i) => sum + (i.price || 0), 0);
    setFoodStop({
      vendorId: selectedVendor.id,
      vendorName: selectedVendor.name,
      items: selectedItems.map((i) => i.name),
      itemsWithPrices: selectedItems,
      itemsTotal,
      extraFee: detourFee,
    });
    setFoodStopModalVisible(false);
    setSelectedVendor(null);
    setSelectedItems([]);
  };

  const handleRemoveFoodStop = () => {
    setFoodStop(null);
  };

  const getTotalFare = () => {
    const base = parseInt(bidPrice, 10) || 0;
    const validStops = stops.filter((s) => s?.trim()).length;
    const stopsFee = validStops * STOP_FEE;
    const foodItemsTotal = foodStop?.itemsTotal || 0;
    const foodDetourFee = foodStop?.extraFee || 0;
    const withFood = base + foodItemsTotal + foodDetourFee + stopsFee;
    const afterRedeem = withFood - (useRedeem ? REDEEM_DISCOUNT : 0);
    const promoDiscount = getPromoDiscount(promoCode, afterRedeem);
    return Math.max(0, afterRedeem - promoDiscount);
  };

  const getStopsExtraMinutes = () => stops.filter((s) => s?.trim()).length * STOP_MINUTES;

  const addStop = () => {
    setDraftStop('');
  };

  const confirmStop = () => {
    if (draftStop === null) return;
    const trimmed = draftStop?.trim();
    if (trimmed) {
      setStops((prev) => [...prev, trimmed]);
    }
    setDraftStop(null);
  };

  const cancelDraftStop = () => {
    setDraftStop(null);
  };

  const updateStop = (index, value) => {
    setStops((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const removeStop = (index) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRequestRide = async () => {
    const price = parseInt(bidPrice, 10);
    if (!price || price < 100) {
      Alert.alert('Error', 'Enter a valid bid (min J$100)');
      return;
    }
    setLoading(true);
    try {
      const validStops = stops.filter((s) => s?.trim());
      const stopsFee = validStops.length * STOP_FEE;
      const stopsMinutes = validStops.length * STOP_MINUTES;
      const rideData = {
        riderId: userProfile?.id,
        riderName: userProfile?.name || 'Rider',
        pickup,
        dropoff,
        bidPrice: getTotalFare(),
        splitCount: splitCount > 1 ? splitCount : 1,
        status: 'bidding',
      };
      if (validStops.length > 0) {
        rideData.stops = validStops;
        rideData.stopsFee = stopsFee;
        rideData.stopsMinutes = stopsMinutes;
      }
      if (foodStop) {
        rideData.foodStop = foodStop;
      }
      if (useRedeem) {
        rideData.useRedeem = true;
      }
      const rideId = await createRideRequest(rideData);
      if (userProfile?.id) addRoute(userProfile.id, pickup, dropoff).then(setRouteHistory);
      navigation.navigate('Bidding', {
        rideId,
        bidPrice: getTotalFare(),
        foodStop,
        useRedeem,
        pickup,
        dropoff,
        demo: false,
      });
    } catch (e) {
      Alert.alert('Cannot request ride', e.message || 'Firebase not configured. Please configure Firebase to request rides.');
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(theme);
  return (
    <View style={styles.container}>
      <MapView style={styles.map} region={region} initialRegion={region}>
        <Marker coordinate={{ latitude: 18.0179, longitude: -76.8099 }} title="Pickup" pinColor="green" />
        <Marker coordinate={{ latitude: 18.4712, longitude: -77.9188 }} title="Dropoff" pinColor="red" />
        {vendors.map((v) => (
          <Marker
            key={v.id}
            coordinate={{ latitude: v.lat, longitude: v.lng }}
            title={v.name}
            pinColor={v.pinColor || 'orange'}
          />
        ))}
      </MapView>
      <View style={styles.overlay}>
        <OfflineBanner visible={isOffline} showCached={isOffline && routeHistory.length > 0} />
        <Text style={styles.coins}>🇯🇲 Armada Coins: {userProfile?.irieCoins ?? 150}</Text>
        <ScrollView
          style={styles.cardScroll}
          contentContainerStyle={styles.cardScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.card}>
          {routeHistory.length > 0 && (
            <View style={styles.recentRoutes}>
              <Text style={styles.recentLabel}>Recent routes</Text>
              {routeHistory.slice(0, 3).map((r, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.recentChip}
                  onPress={() => { setPickup(r.pickup); setDropoff(r.dropoff); }}
                >
                  <Text style={styles.recentChipText} numberOfLines={1}>{r.pickup} → {r.dropoff}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TextInput
            style={styles.input}
            placeholder="Pickup location"
            value={pickup}
            onChangeText={setPickup}
            placeholderTextColor={theme.colors.textSecondary}
          />
          {stops.map((stop, i) => (
            <View key={`stop-${i}`} style={styles.stopRow}>
              <TextInput
                style={[styles.input, styles.stopInput]}
                placeholder={`Stop ${i + 1}`}
                value={stop}
                onChangeText={(v) => updateStop(i, v)}
                placeholderTextColor={theme.colors.textSecondary}
              />
              <TouchableOpacity style={styles.removeStopBtn} onPress={() => removeStop(i)}>
                <Text style={styles.removeStopText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {draftStop !== null ? (
            <View style={styles.stopRow}>
              <TextInput
                style={[styles.input, styles.stopInput]}
                placeholder={`Stop ${stops.length + 1}`}
                value={draftStop}
                onChangeText={setDraftStop}
                placeholderTextColor={theme.colors.textSecondary}
                autoFocus
              />
              <TouchableOpacity style={styles.confirmStopBtn} onPress={confirmStop}>
                <Text style={styles.confirmStopText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.removeStopBtn} onPress={cancelDraftStop}>
                <Text style={styles.removeStopText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.addStopBtn} onPress={addStop} activeOpacity={0.7}>
              <Text style={styles.addStopText}>+ Add stop</Text>
            </TouchableOpacity>
          )}
          {stops.filter((s) => s?.trim()).length > 0 && (
            <View style={styles.stopsFeeRow}>
              <Text style={styles.extraFeeText}>
                Extra: J${stops.filter((s) => s?.trim()).length * STOP_FEE} for {stops.filter((s) => s?.trim()).length} stop(s)
              </Text>
              <Text style={styles.stopsTimeText}>+{getStopsExtraMinutes()} min</Text>
            </View>
          )}
          <TextInput
            style={styles.input}
            placeholder="Dropoff location"
            value={dropoff}
            onChangeText={setDropoff}
            placeholderTextColor={theme.colors.textSecondary}
          />
          <View style={styles.bidRow}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={styles.label}>Bid your price (J$)</Text>
              <VoiceBiddingButton onResult={(val) => setBidPrice(val || '')} />
            </View>
            <TextInput
              style={styles.bidInput}
              value={bidPrice}
              onChangeText={setBidPrice}
              keyboardType="number-pad"
              placeholder="1500"
            />
          </View>
          <TouchableOpacity
            style={[styles.foodStopBtn, foodStop && styles.foodStopBtnActive]}
            onPress={() => setFoodStopModalVisible(true)}
          >
            <Text style={styles.foodStopBtnText}>
              {foodStop
                ? `✓ ${foodStop.vendorName} (J$${foodStop.itemsTotal || 0} + J$${foodStop.extraFee || 0} detour)`
                : '+ Add Food Stop'}
            </Text>
          </TouchableOpacity>
          {foodStop && (
            <>
              <Text style={styles.extraFeeText}>
                Food: J${foodStop.itemsTotal || 0} items + J${foodStop.extraFee || 0} detour
              </Text>
              <TouchableOpacity style={styles.removeFoodStop} onPress={handleRemoveFoodStop}>
                <Text style={styles.removeFoodStopText}>Remove food stop</Text>
              </TouchableOpacity>
            </>
          )}
          {canRedeem && (
            <TouchableOpacity
              style={[styles.redeemToggle, useRedeem && styles.redeemToggleActive]}
              onPress={() => setUseRedeem(!useRedeem)}
            >
              <Text style={styles.redeemToggleText}>
                {useRedeem ? '✓ ' : ''}Use 100 coins for J$50 off
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.promoRow}>
            <TextInput
              style={styles.promoInput}
              placeholder="Promo code"
              value={promoCode}
              onChangeText={(v) => { setPromoCode(v.toUpperCase()); setPromoError(''); }}
              placeholderTextColor={theme.colors.textSecondary}
              autoCapitalize="characters"
            />
            <TouchableOpacity
              style={styles.promoBtn}
              onPress={() => {
                const r = validatePromo(promoCode, parseInt(bidPrice, 10) || 0);
                if (r.valid) setPromoError(`J$${r.discount} off applied`);
                else setPromoError(r.error || 'Invalid');
              }}
            >
              <Text style={styles.promoBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
          {promoError && <Text style={[styles.promoMsg, promoError.includes('off') && styles.promoSuccess]}>{promoError}</Text>}
          <Text style={styles.totalFare}>Total: J${getTotalFare()}</Text>
          <View style={styles.splitSection}>
            <Text style={styles.label}>Split fare (1–5 passengers)</Text>
            <Text style={styles.splitDesc}>Divide total among passengers</Text>
            <View style={styles.splitRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.splitBtn, splitCount === n && styles.splitBtnActive]}
                  onPress={() => setSplitCount(n)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.splitText, splitCount === n && styles.splitTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {splitCount > 1 && (
              <Text style={styles.perPersonText}>
                J${Math.ceil(getTotalFare() / splitCount)} per person
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRequestRide}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? 'Requesting...' : 'Request Ride'}</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </View>

      <Modal visible={foodStopModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Food Stop</Text>
            <FlatList
              data={vendors}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.vendorCard, selectedVendor?.id === item.id && styles.vendorCardActive]}
                  onPress={() => handleSelectVendor(item)}
                >
                  <Text style={styles.vendorName}>{item.name}</Text>
                  <Text style={styles.vendorItems}>
                    {(item.menu || item.items || []).map((m) => (typeof m === 'string' ? m : m.name)).join(', ') || 'No menu'}
                  </Text>
                  {selectedVendor?.id === item.id && (
                    <Text style={styles.detourFee}>+ J${calculateDetourFee(item)} detour</Text>
                  )}
                </TouchableOpacity>
              )}
            />
            {selectedVendor && (
              <View style={styles.itemsSection}>
                <Text style={styles.itemsLabel}>Select items (with prices):</Text>
                <FlatList
                  data={selectedVendor.menu || selectedVendor.items?.map((n) => ({ id: n, name: n, price: 0 })) || []}
                  keyExtractor={(i) => i.id || i.name}
                  renderItem={({ item }) => {
                    const menuItem = typeof item === 'string' ? { id: item, name: item, price: 0 } : item;
                    const selected = isItemSelected(menuItem);
                    return (
                      <TouchableOpacity
                        style={[styles.itemRow, selected && styles.itemRowActive]}
                        onPress={() => toggleItem(menuItem)}
                      >
                        <Text style={styles.itemText}>{menuItem.name}</Text>
                        <View style={styles.itemPriceRow}>
                          <Text style={styles.itemPrice}>J${menuItem.price ?? 0}</Text>
                          <Text style={styles.itemCheck}>{selected ? '✓' : ''}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
                {selectedItems.length > 0 && (
                  <Text style={styles.itemsSubtotal}>
                    Subtotal: J${selectedItems.reduce((s, i) => s + (i.price || 0), 0)}
                  </Text>
                )}
              </View>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setFoodStopModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirmFoodStop}>
                <Text style={styles.modalConfirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1, width: '100%' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  cardScroll: { maxHeight: 420 },
  cardScrollContent: { paddingBottom: 8 },
  coins: {
    color: theme.colors.secondary,
    fontWeight: 'bold',
    marginBottom: 8,
    fontSize: 14,
  },
  recentRoutes: { marginBottom: 12 },
  recentLabel: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6 },
  recentChip: {
    backgroundColor: theme.colors.surface,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  recentChipText: { fontSize: 13, color: theme.colors.primary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    fontSize: 16,
  },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  stopInput: { flex: 1, marginBottom: 0 },
  removeStopBtn: { padding: 8, backgroundColor: theme.colors.error + '30', borderRadius: 8 },
  removeStopText: { color: theme.colors.error, fontWeight: 'bold', fontSize: 14 },
  confirmStopBtn: { padding: 8, backgroundColor: theme.colors.success + '30', borderRadius: 8 },
  confirmStopText: { color: theme.colors.success, fontWeight: 'bold', fontSize: 14 },
  addStopBtn: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addStopText: { color: theme.colors.primary, fontWeight: '600', fontSize: 14 },
  bidRow: { marginBottom: 12 },
  label: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  bidInput: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    fontWeight: 'bold',
  },
  foodStopBtn: {
    backgroundColor: theme.colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.orange,
  },
  foodStopBtnActive: {
    backgroundColor: theme.colors.orange + '20',
    borderColor: theme.colors.orange,
  },
  foodStopBtnText: {
    color: theme.colors.orange,
    fontWeight: '600',
    textAlign: 'center',
  },
  extraFeeText: {
    fontSize: 14,
    color: theme.colors.accent,
    marginBottom: 4,
    fontWeight: '600',
  },
  stopsFeeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stopsTimeText: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '600' },
  removeFoodStop: { marginBottom: 8 },
  removeFoodStopText: { fontSize: 12, color: theme.colors.error },
  redeemToggle: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.secondary,
    backgroundColor: theme.colors.background,
  },
  redeemToggleActive: {
    borderColor: theme.colors.green,
    backgroundColor: theme.colors.green + '20',
  },
  redeemToggleText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  promoRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  promoInput: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 8, padding: 12, fontSize: 14, borderWidth: 2, borderColor: theme.colors.primaryLight },
  promoBtn: { paddingHorizontal: 16, justifyContent: 'center', backgroundColor: theme.colors.primary, borderRadius: 8 },
  promoBtnText: { color: theme.colors.white, fontWeight: 'bold', fontSize: 14 },
  promoMsg: { fontSize: 12, color: theme.colors.error, marginBottom: 4 },
  promoSuccess: { color: theme.colors.success },
  totalFare: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 12,
  },
  splitSection: { marginBottom: 16 },
  splitRow: { flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 8 },
  splitDesc: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  perPersonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.accent,
    marginTop: 4,
  },
  splitBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitBtnActive: { backgroundColor: theme.colors.primary, borderWidth: 2, borderColor: theme.colors.secondary },
  splitText: { color: theme.colors.primary, fontWeight: 'bold' },
  splitTextActive: { color: theme.colors.white },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.white, fontSize: 18, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 16 },
  vendorCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  vendorCardActive: { borderColor: theme.colors.orange, backgroundColor: theme.colors.orange + '15' },
  vendorName: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary },
  vendorItems: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  detourFee: { fontSize: 12, color: theme.colors.accent, marginTop: 4 },
  itemsSection: { marginTop: 16, marginBottom: 16 },
  itemsLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: theme.colors.background,
  },
  itemRowActive: { backgroundColor: theme.colors.orange + '20', borderWidth: 1, borderColor: theme.colors.orange },
  itemText: { fontSize: 14, flex: 1 },
  itemPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemPrice: { fontSize: 14, fontWeight: '600', color: theme.colors.accent },
  itemCheck: { color: theme.colors.success, fontWeight: 'bold' },
  itemsSubtotal: { fontSize: 14, fontWeight: '600', color: theme.colors.primary, marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
  },
  modalCancelText: { color: theme.colors.textSecondary },
  modalConfirm: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
  },
  modalConfirmText: { color: theme.colors.white, fontWeight: 'bold' },
});
