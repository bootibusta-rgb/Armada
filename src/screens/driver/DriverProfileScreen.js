import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ScrollView,
  Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../context/AuthContext';
import {
  getDriverSubscription,
  isFirstDayFree,
  isSubscriptionActive,
  hasCompletedFirstPayment,
  getReferralCode,
  payDriverSubscription,
  DRIVER_DAILY_FEE,
  REFERRAL_FIRST_DAY_FEE,
} from '../../services/driverSubscriptionService';
import { getComplianceScore } from '../../services/complianceService';
import { useTheme } from '../../context/ThemeContext';
import { withSectionGuide } from '../../components/withSectionGuide';

const SUBSCRIPTION_INFO = `Armada Driver Subscription:
• J$1,000 per 24 hours
• First day FREE
• Share your QR with other drivers: they get 50% off (J$500) on their first payment`;

function DriverProfileScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile, refreshUserProfile } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (userProfile?.id) {
      getDriverSubscription(userProfile.id).then(setSubscription);
      getComplianceScore(userProfile.id, userProfile).then(setCompliance);
    }
  }, [userProfile?.id, userProfile]);

  const firstDayFree = isFirstDayFree(userProfile);
  const isActive = isSubscriptionActive(subscription, userProfile);
  const firstPaymentDone = hasCompletedFirstPayment(userProfile) || !!subscription?.firstPaymentAt;
  const referralCode = getReferralCode(userProfile?.id);

  const isFirstPayment = !subscription?.firstPaymentAt;
  const payAmount = (isFirstPayment && subscription?.referredBy) ? REFERRAL_FIRST_DAY_FEE : DRIVER_DAILY_FEE;

  const handlePay = async () => {
    const amount = payAmount;
    Alert.alert(
      'Pay subscription',
      `Pay J$${amount} for 24 hours of service? In production this would open payment (PayPal/bank).`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay (demo)',
          onPress: async () => {
            setPaying(true);
            try {
              await payDriverSubscription(userProfile.id, amount, subscription?.referredBy);
              setSubscription(await getDriverSubscription(userProfile.id));
              refreshUserProfile?.();
              Alert.alert('Success', 'Subscription active for 24 hours. Your referral QR code is now available below!');
            } catch (e) {
              Alert.alert('Error', e.message || 'Payment failed');
            } finally {
              setPaying(false);
            }
          },
        },
      ]
    );
  };

  const handleShareQR = async () => {
    try {
      await Share.share({
        message: `Join Armada as a driver! Use my referral for 50% off your first day (J$500 instead of J$1,000). Sign up: armada://driver?ref=${userProfile?.id}`,
        title: 'Armada Driver Referral',
      });
    } catch (e) {}
  };

  const complianceColor = compliance
    ? compliance.score >= 80
      ? theme.colors.success
      : compliance.score >= 60
        ? theme.colors.orange
        : theme.colors.error
    : theme.colors.textSecondary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {compliance && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Compliance Score</Text>
          <View style={styles.complianceRow}>
            <View style={[styles.complianceCircle, { borderColor: complianceColor }]}>
              <Text style={[styles.complianceScore, { color: complianceColor }]}>{compliance.score}</Text>
            </View>
            <View style={styles.complianceDetails}>
              <Text style={styles.complianceLabel}>Documents • Rating • Training</Text>
              {compliance.issues?.length > 0 && (
                <Text style={styles.complianceIssues}>{compliance.issues.join(' • ')}</Text>
              )}
            </View>
          </View>
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Subscription</Text>
        <Text style={styles.infoText}>
          J${DRIVER_DAILY_FEE} per 24 hours • First day FREE
        </Text>
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => setShowInfoModal(true)}
        >
          <Text style={styles.infoBtnText}>View details</Text>
        </TouchableOpacity>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status:</Text>
          <Text style={[styles.statusValue, isActive ? styles.statusActive : styles.statusInactive]}>
            {firstDayFree ? 'First day free' : isActive ? 'Active' : 'Expired – pay to continue'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.payBtn, paying && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={paying}
        >
          <Text style={styles.payBtnText}>
            {paying ? 'Processing...' : `Pay J$${payAmount} for 24 hours`}
          </Text>
        </TouchableOpacity>
      </View>

      {firstPaymentDone && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Referral QR Code</Text>
          <Text style={styles.referralDesc}>
            Share with other drivers – they get J${REFERRAL_FIRST_DAY_FEE} (50% off) on first payment
          </Text>
          <View style={styles.qrWrap}>
            <QRCode
              value={referralCode}
              size={180}
              backgroundColor={theme.colors.white}
              color={theme.colors.primary}
            />
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareQR}>
            <Text style={styles.shareBtnText}>Share referral link</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showInfoModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowInfoModal(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Driver Subscription</Text>
            <Text style={styles.modalText}>{SUBSCRIPTION_INFO}</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowInfoModal(false)}
            >
              <Text style={styles.modalCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

export default withSectionGuide(DriverProfileScreen, 'driver_profile');

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  complianceRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  complianceCircle: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, justifyContent: 'center', alignItems: 'center' },
  complianceScore: { fontSize: 24, fontWeight: 'bold' },
  complianceDetails: { flex: 1 },
  complianceLabel: { fontSize: 13, color: theme.colors.textSecondary },
  complianceIssues: { fontSize: 12, color: theme.colors.error, marginTop: 4 },
  infoText: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  infoBtn: { alignSelf: 'flex-start', marginBottom: 12 },
  infoBtnText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusLabel: { fontSize: 14, color: theme.colors.textSecondary },
  statusValue: { fontSize: 14, fontWeight: 'bold' },
  statusActive: { color: theme.colors.success },
  statusInactive: { color: theme.colors.error },
  payBtn: {
    marginTop: 16,
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  referralDesc: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 16 },
  qrWrap: {
    alignSelf: 'center',
    padding: 16,
    backgroundColor: theme.colors.white,
    borderRadius: 12,
    marginBottom: 16,
  },
  shareBtn: {
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: theme.colors.white,
    padding: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 16 },
  modalText: { fontSize: 16, color: theme.colors.text, lineHeight: 24, marginBottom: 24 },
  modalClose: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
});
