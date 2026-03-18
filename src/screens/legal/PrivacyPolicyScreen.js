import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function PrivacyPolicyScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.updated}>Last updated: March 2025</Text>

      <Text style={styles.heading}>1. Information We Collect</Text>
      <Text style={styles.para}>
        Armada collects information you provide when you register: phone number, name, email (optional), 
        ID verification details (type and number), vehicle and license information (for drivers), 
        and emergency contact details. We collect location data during rides for matching, tracking, 
        and safety (including emergency SOS).
      </Text>

      <Text style={styles.heading}>2. How We Use Your Information</Text>
      <Text style={styles.para}>
        We use your information to provide ride-share services, match riders with drivers, process 
        payments, verify identity, send ride updates, and enable emergency features. We may use 
        anonymized data for analytics and improving our services.
      </Text>

      <Text style={styles.heading}>3. Sharing Your Information</Text>
      <Text style={styles.para}>
        We share ride details (pickup, dropoff, driver/rider info) with the other party in a ride. 
        Emergency contacts receive your location only when you tap the Emergency button. We do not 
        sell your personal data to third parties.
      </Text>

      <Text style={styles.heading}>4. Data Security</Text>
      <Text style={styles.para}>
        We use Firebase and industry-standard security measures to protect your data. ID numbers 
        and sensitive details are stored securely. Please keep your account credentials private.
      </Text>

      <Text style={styles.heading}>5. Your Rights</Text>
      <Text style={styles.para}>
        You may request access to, correction of, or deletion of your personal data. Contact us at 
        privacy@armada.app. You may withdraw consent for non-essential processing.
      </Text>

      <Text style={styles.heading}>6. Contact</Text>
      <Text style={styles.para}>
        For privacy questions: privacy@armada.app
      </Text>
    </ScrollView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  updated: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 24 },
  heading: { fontSize: 16, fontWeight: 'bold', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  para: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22, marginBottom: 8 },
});
