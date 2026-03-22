import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { patchCarRentalRequest } from '../services/carRentalService';

export default function RentalCounterOfferModal({ visible, request, onClose }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const co = request?.counterOffer;
  const show = !!(visible && co && co.status === 'pending');
  if (!co) return null;

  const onYes = async () => {
    if (!co) return;
    if (!request?.id) return;
    try {
      await patchCarRentalRequest(request.id, {
        counterOffer: {
          vehicleLabel: co.vehicleLabel,
          dailyRate: co.dailyRate,
          photoUrls: co.photoUrls || [],
          plate: co.plate || '',
          ownerMessage: co.ownerMessage || '',
          status: 'accepted',
          createdAt: co.createdAt || new Date().toISOString(),
          respondedAt: new Date().toISOString(),
        },
        vehicleDisplayName: co.vehicleLabel,
        dailyRate: co.dailyRate,
        licensePlate: co.plate || request.licensePlate,
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not confirm');
      return;
    }
    onClose?.();
  };

  const onNo = async () => {
    if (!co || !request?.id) return;
    try {
      await patchCarRentalRequest(request.id, {
        counterOffer: {
          vehicleLabel: co.vehicleLabel,
          dailyRate: co.dailyRate,
          photoUrls: co.photoUrls || [],
          plate: co.plate || '',
          ownerMessage: co.ownerMessage || '',
          status: 'declined',
          createdAt: co.createdAt || new Date().toISOString(),
          respondedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update');
      return;
    }
    onClose?.();
  };

  return (
    <Modal visible={show} animationType="fade" transparent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Other option from owner</Text>
          <Text style={styles.body}>
            Owner says the first car may be out—check this instead?
          </Text>
          {co.photoUrls?.[0] ? (
            <Image source={{ uri: co.photoUrls[0] }} style={styles.img} />
          ) : (
            <View style={[styles.img, styles.imgPh]}>
              <Text style={styles.emoji}>🚙</Text>
            </View>
          )}
          <Text style={styles.carName}>{co.vehicleLabel}</Text>
          <Text style={styles.rate}>J${co.dailyRate}/day</Text>
          {co.ownerMessage ? <Text style={styles.msg}>{co.ownerMessage}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity style={styles.noBtn} onPress={onNo}>
              <Text style={styles.noTxt}>No thanks</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.yesBtn} onPress={onYes}>
              <Text style={styles.yesTxt}>Yes, I’ll take it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 20,
    },
    card: {
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      padding: 18,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
    },
    title: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
    body: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12 },
    img: { width: '100%', height: 120, borderRadius: 12, marginBottom: 10 },
    imgPh: { backgroundColor: theme.colors.primary + '12', justifyContent: 'center', alignItems: 'center' },
    emoji: { fontSize: 40 },
    carName: { fontSize: 17, fontWeight: '800', color: theme.colors.primary },
    rate: { fontSize: 15, color: theme.colors.success, fontWeight: '700', marginTop: 4 },
    msg: { fontSize: 13, color: theme.colors.text, marginTop: 10, fontStyle: 'italic' },
    row: { flexDirection: 'row', gap: 10, marginTop: 16 },
    noBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.colors.primaryLight,
      alignItems: 'center',
    },
    noTxt: { fontWeight: '700', color: theme.colors.textSecondary },
    yesBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.colors.success, alignItems: 'center' },
    yesTxt: { fontWeight: '800', color: '#fff' },
  });
