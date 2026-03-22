import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { isFirebaseReady } from '../../config/firebase';
import {
  subscribeCarRentalRequest,
  patchCarRentalRequest,
  fetchUserProfileDoc,
  buildOwnerRentalFleet,
} from '../../services/carRentalService';
import { sendRentalChatMessage, ensureRentalChatParticipants } from '../../services/chatService';
import { updateUserProfile } from '../../services/authService';
import { openDial, pickTextRider } from '../../utils/rentalComm';

function tomorrowEndISO() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(23, 59, 59, 999);
  return t.toISOString();
}

export default function CarRentalRequestOwnerScreen({ route, navigation }) {
  const { requestId: initialRequestId } = route.params || {};
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { userProfile, user, refreshUserProfile } = useAuth();
  const [req, setReq] = useState(null);
  const [ownerFleetProfile, setOwnerFleetProfile] = useState(null);
  const [suggestVisible, setSuggestVisible] = useState(false);

  useEffect(() => {
    if (!initialRequestId || !isFirebaseReady) return undefined;
    const unsub = subscribeCarRentalRequest(initialRequestId, setReq);
    return unsub;
  }, [initialRequestId]);

  useEffect(() => {
    const oid = req?.ownerId || userProfile?.id;
    if (!oid || !isFirebaseReady) return;
    fetchUserProfileDoc(oid).then(setOwnerFleetProfile);
  }, [req?.ownerId, userProfile?.id]);

  const fleet = useMemo(() => buildOwnerRentalFleet(ownerFleetProfile || userProfile), [ownerFleetProfile, userProfile]);

  const alternateOptions = useMemo(() => {
    if (!req) return [];
    const plate = (req.licensePlate || '').toUpperCase().replace(/\s/g, '');
    return fleet.filter((v) => (v.plate || '').toUpperCase().replace(/\s/g, '') !== plate);
  }, [fleet, req]);

  const shortName = (name) => {
    const p = String(name || 'Rider').trim().split(/\s+/);
    if (p.length >= 2) return `${p[0]} ${p[1].charAt(0).toUpperCase()}.`;
    return p[0] || 'Rider';
  };

  const onUnavailable = () => {
    Alert.alert('Mark unavailable?', 'Rider will see that the car is taken.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        style: 'destructive',
        onPress: async () => {
          try {
            await patchCarRentalRequest(initialRequestId, {
              status: 'unavailable',
              riderVisibleMessage: 'Sorry, car taken—try another',
            });
            navigation.goBack();
          } catch (e) {
            Alert.alert('Error', e.message || 'Failed');
          }
        },
      },
    ]);
  };

  const onAccept = () => {
    Alert.alert('Accept & confirm?', 'Vehicle will show as booked until tomorrow.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          try {
            const bookedUntil = tomorrowEndISO();
            await patchCarRentalRequest(initialRequestId, {
              status: 'accepted',
              bookedUntil,
            });
            if (user?.uid && isFirebaseReady) {
              await updateUserProfile(user.uid, { rentalBookedUntil: bookedUntil });
              await refreshUserProfile?.();
            }
            navigation.goBack();
          } catch (e) {
            Alert.alert('Error', e.message || 'Failed');
          }
        },
      },
    ]);
  };

  const sendAlternative = async (vehicle) => {
    const orig = req?.vehicleDisplayName || 'That car';
    const msg = `${orig} is out—how about ${vehicle.label} instead?`;
    try {
      await patchCarRentalRequest(initialRequestId, {
        counterOffer: {
          vehicleLabel: vehicle.label,
          plate: vehicle.plate || '',
          dailyRate: vehicle.dailyRate,
          photoUrls: vehicle.photoUrls || [],
          ownerMessage: msg,
          status: 'pending',
          createdAt: new Date().toISOString(),
        },
      });
      if (isFirebaseReady && req?.riderId && userProfile?.id) {
        try {
          await sendRentalChatMessage(initialRequestId, {
            text: `${msg} — J$${vehicle.dailyRate}/day${vehicle.plate ? ` • ${vehicle.plate}` : ''}`,
            senderId: userProfile.id,
            senderName: userProfile.name || 'Car Rental',
          });
        } catch (e) {
          /* chat optional */
        }
      }
      setSuggestVisible(false);
      Alert.alert('Sent', 'The rider was notified about this option.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to send');
    }
  };

  if (!initialRequestId) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.err}>Missing request.</Text>
      </SafeAreaView>
    );
  }

  if (!isFirebaseReady) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.err}>Connect Firebase to view requests.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backOut}>
          <Text style={styles.backOutText}>Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!req) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  const canAct = req.status === 'pending';
  const vname = req.vehicleDisplayName || 'your vehicle';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.avatarWrap}>
          {req.riderPhotoUrl ? (
            <Image source={{ uri: req.riderPhotoUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPh]}>
              <Text style={styles.avatarLetter}>{(req.riderName || 'R').charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.riderTitle} numberOfLines={1}>
            {shortName(req.riderName)}
          </Text>
          <Text style={styles.subHint} numberOfLines={1}>
            Interested in {vname}
          </Text>
        </View>
      </View>

      <View style={styles.details}>
        <Text style={styles.dtLabel}>Pickup</Text>
        <Text style={styles.dtVal} numberOfLines={2}>
          {req.riderPickupSpot || '—'}
        </Text>
        <Text style={styles.dtLabel}>Time</Text>
        <Text style={styles.dtVal}>{req.riderTimeLabel || '—'}</Text>
        <Text style={styles.dtLabel}>Phone</Text>
        <TouchableOpacity onPress={() => openDial(req.riderPhone)} disabled={!req.riderPhone}>
          <Text style={[styles.dtVal, styles.phoneLink]} numberOfLines={1}>
            {req.riderPhone || 'Not provided'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.msgLabel}>Message</Text>
      <View style={styles.msgBox}>
        <Text style={styles.msgText} numberOfLines={4}>
          {req.riderMessage || '—'}
        </Text>
      </View>

      {req.counterOffer?.status === 'pending' ? (
        <Text style={styles.banner}>Waiting for rider on alternate offer…</Text>
      ) : null}
      {req.status === 'unavailable' ? (
        <Text style={styles.banner}>Marked unavailable</Text>
      ) : null}
      {req.status === 'accepted' ? (
        <Text style={styles.banner}>Accepted • Booked until {req.bookedUntil ? new Date(req.bookedUntil).toLocaleDateString() : '—'}</Text>
      ) : null}

      <TouchableOpacity
        style={styles.chatLink}
        onPress={async () => {
          if (isFirebaseReady) {
            await ensureRentalChatParticipants(initialRequestId, req.riderId, req.ownerId).catch(() => {});
          }
          navigation.navigate('RentalChat', {
            requestId: initialRequestId,
            otherName: req.riderName || 'Rider',
            riderId: req.riderId,
            ownerId: req.ownerId,
            isDemo: !isFirebaseReady,
          });
        }}
      >
        <Text style={styles.chatLinkText}>Chat with rider</Text>
      </TouchableOpacity>

      <View style={styles.btnGrid}>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btnHalf} onPress={() => openDial(req.riderPhone)}>
            <Text style={styles.btnTxt}>Call rider</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnHalf} onPress={() => pickTextRider(req.riderPhone)}>
            <Text style={styles.btnTxt}>Text rider</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={styles.btnHalf}
            onPress={() => setSuggestVisible(true)}
            disabled={!canAct || alternateOptions.length === 0}
          >
            <Text style={[styles.btnTxt, alternateOptions.length === 0 && styles.btnDisabled]}>Suggest another</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnHalf, styles.btnWarn]} onPress={onUnavailable} disabled={!canAct}>
            <Text style={styles.btnTxt}>Unavailable</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.btnFull} onPress={onAccept} disabled={!canAct}>
          <Text style={styles.btnTxtLight}>Accept & confirm</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={suggestVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pick another car</Text>
            <FlatList
              data={alternateOptions}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 220 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.altRow} onPress={() => sendAlternative(item)}>
                  {item.photoUrls?.[0] ? (
                    <Image source={{ uri: item.photoUrls[0] }} style={styles.altImg} />
                  ) : (
                    <View style={[styles.altImg, styles.altImgPh]}>
                      <Text style={styles.altPh}>🚙</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.altName}>{item.label}</Text>
                    <Text style={styles.altMeta}>
                      J${item.dailyRate}/day{item.plate ? ` • ${item.plate}` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyAlt}>Add extra vehicles in Settings or signup.</Text>}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setSuggestVisible(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: 12 },
    center: { justifyContent: 'center', alignItems: 'center' },
    err: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 24 },
    backOut: { marginTop: 16, alignSelf: 'center' },
    backOutText: { color: theme.colors.primary, fontWeight: '600' },
    topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    backBtn: { padding: 8, marginRight: 4 },
    backBtnText: { fontSize: 22, color: theme.colors.primary, fontWeight: 'bold' },
    avatarWrap: { marginRight: 10 },
    avatar: { width: 52, height: 52, borderRadius: 26 },
    avatarPh: {
      backgroundColor: theme.colors.primary + '30',
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarLetter: { fontSize: 22, fontWeight: 'bold', color: theme.colors.primary },
    nameBlock: { flex: 1 },
    riderTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.primary },
    subHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
    details: {
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.primaryLight,
      marginBottom: 8,
    },
    dtLabel: { fontSize: 10, color: theme.colors.textSecondary, textTransform: 'uppercase', marginTop: 6 },
    dtVal: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
    phoneLink: { color: theme.colors.primary, textDecorationLine: 'underline' },
    msgLabel: { fontSize: 10, color: theme.colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
    msgBox: {
      minHeight: 72,
      maxHeight: 72,
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.primaryLight,
      marginBottom: 8,
    },
    msgText: { fontSize: 13, color: theme.colors.text, lineHeight: 18 },
    banner: { fontSize: 12, color: theme.colors.accent, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
    chatLink: { alignSelf: 'center', marginBottom: 8 },
    chatLinkText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary, textDecorationLine: 'underline' },
    btnGrid: { flex: 1, justifyContent: 'flex-end', paddingBottom: 4 },
    btnRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
    btnHalf: {
      flex: 1,
      backgroundColor: theme.colors.primary,
      paddingVertical: 12,
      borderRadius: 10,
    },
    btnWarn: { backgroundColor: theme.colors.error || '#DC2626' },
    btnFull: {
      width: '98%',
      alignSelf: 'center',
      backgroundColor: theme.colors.success,
      paddingVertical: 14,
      borderRadius: 10,
      marginTop: 4,
    },
    btnTxt: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 13, textAlign: 'center' },
    btnTxtLight: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'center' },
    btnDisabled: { opacity: 0.5 },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 16,
      maxHeight: '55%',
    },
    modalTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 12 },
    altRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.primaryLight },
    altImg: { width: 56, height: 56, borderRadius: 8, marginRight: 12 },
    altImgPh: { backgroundColor: theme.colors.primary + '15', justifyContent: 'center', alignItems: 'center' },
    altPh: { fontSize: 24 },
    altName: { fontSize: 15, fontWeight: 'bold', color: theme.colors.primary },
    altMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
    emptyAlt: { color: theme.colors.textSecondary, padding: 16, textAlign: 'center' },
    modalClose: { marginTop: 12, padding: 14, alignItems: 'center' },
    modalCloseText: { color: theme.colors.primary, fontWeight: '600' },
  });
