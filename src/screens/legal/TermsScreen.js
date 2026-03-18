import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function TermsScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Terms of Service</Text>
      <Text style={styles.updated}>Last updated: March 2025</Text>

      <Text style={styles.heading}>1. Acceptance</Text>
      <Text style={styles.para}>
        By using Armada, you agree to these Terms of Service. If you do not agree, do not use the app.
      </Text>

      <Text style={styles.heading}>2. Service Description</Text>
      <Text style={styles.para}>
        Armada is a ride-share platform connecting riders with drivers in Jamaica. Riders bid a price; 
        drivers accept. Payment may be cash or card. We facilitate the connection but are not a 
        transportation provider. Drivers are independent; riders contract directly with drivers.
      </Text>

      <Text style={styles.heading}>3. Eligibility</Text>
      <Text style={styles.para}>
        You must be 18+ to use Armada. You must provide accurate information and valid ID verification. 
        Drivers must hold a valid driver's license and maintain appropriate insurance.
      </Text>

      <Text style={styles.heading}>4. User Conduct</Text>
      <Text style={styles.para}>
        You agree to behave lawfully and respectfully. No harassment, fraud, or unsafe behaviour. 
        We may suspend or terminate accounts that violate these terms.
      </Text>

      <Text style={styles.heading}>5. Fees and Payments</Text>
      <Text style={styles.para}>
        Fare amounts are agreed between rider and driver. Armada may charge a service fee. 
        Armada Coins and promotions are subject to our policies. Refunds are handled per our 
        refund policy.
      </Text>

      <Text style={styles.heading}>6. Limitation of Liability</Text>
      <Text style={styles.para}>
        Armada is a platform only. We are not liable for driver conduct, accidents, or disputes 
        between users. We are not liable for indirect, incidental, or consequential damages.
      </Text>

      <Text style={styles.heading}>7. Contact</Text>
      <Text style={styles.para}>
        For terms questions: support@armada.app
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
