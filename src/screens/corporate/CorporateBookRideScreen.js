import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  FlatList,
  Modal,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { createRideRequest } from '../../services/rideService';
import { getEmployees } from '../../services/corporateService';
import { isFirebaseReady } from '../../config/firebase';
import { useTheme } from '../../context/ThemeContext';
import { withSectionGuide } from '../../components/withSectionGuide';

function CorporateBookRideScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [bidPrice, setBidPrice] = useState('800');
  const [loading, setLoading] = useState(false);
  const [employeeModalVisible, setEmployeeModalVisible] = useState(false);

  useEffect(() => {
    if (userProfile?.id) {
      getEmployees(userProfile.id).then(setEmployees);
    }
  }, [userProfile?.id]);

  const handleBook = async () => {
    const price = parseInt(bidPrice, 10);
    if (!price || price < 100) {
      Alert.alert('Error', 'Enter a valid fare (min J$100)');
      return;
    }
    if (!pickup.trim() || !dropoff.trim()) {
      Alert.alert('Error', 'Enter pickup and dropoff locations');
      return;
    }
    const employeeName = selectedEmployee?.name || 'Employee';
    setLoading(true);
    try {
      const rideData = {
        riderId: userProfile?.id,
        riderName: `${employeeName} (${userProfile?.name || 'Company'})`,
        pickup: pickup.trim(),
        dropoff: dropoff.trim(),
        bidPrice: price,
        status: 'bidding',
        companyId: userProfile?.id,
        companyName: userProfile?.name || 'Company',
        employeeId: selectedEmployee?.id,
        employeeName,
        department: selectedEmployee?.department || '',
        isCorporateBooking: true,
      };
      const rideId = await createRideRequest(rideData);
      Alert.alert('Ride booked', `Ride requested for ${employeeName}. Drivers will bid.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not book ride');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Book ride for employee</Text>
      <Text style={styles.subtitle}>Request a ride on behalf of a staff member</Text>

      <Text style={styles.label}>Employee</Text>
      <TouchableOpacity
        style={styles.pickerWrap}
        onPress={() => (employees.length > 0 ? setEmployeeModalVisible(true) : Alert.alert('No employees', 'Add employees in the Employees tab first.'))}
      >
        <Text style={styles.pickerText}>{selectedEmployee ? selectedEmployee.name : 'Select employee'}</Text>
      </TouchableOpacity>

      <Modal visible={employeeModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setEmployeeModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Select employee</Text>
            <FlatList
              data={employees}
              keyExtractor={(e) => e.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.employeeRow}
                  onPress={() => {
                    setSelectedEmployee(item);
                    setEmployeeModalVisible(false);
                  }}
                >
                  <Text style={styles.employeeName}>{item.name}</Text>
                  {item.department ? <Text style={styles.employeeDept}>{item.department}</Text> : null}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCancel} onPress={() => setEmployeeModalVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Text style={styles.label}>Pickup</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 123 Main St, Kingston"
        value={pickup}
        onChangeText={setPickup}
        placeholderTextColor={theme.colors.textSecondary}
      />

      <Text style={styles.label}>Dropoff</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Office, Montego Bay"
        value={dropoff}
        onChangeText={setDropoff}
        placeholderTextColor={theme.colors.textSecondary}
      />

      <Text style={styles.label}>Fare (J$)</Text>
      <TextInput
        style={styles.input}
        value={bidPrice}
        onChangeText={setBidPrice}
        keyboardType="number-pad"
        placeholder="800"
        placeholderTextColor={theme.colors.textSecondary}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleBook}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Booking...' : 'Book ride'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default withSectionGuide(CorporateBookRideScreen, 'corporate_book');

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24 },
  label: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  pickerWrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  pickerText: { fontSize: 16, color: theme.colors.text },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.white, padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 16 },
  employeeRow: { padding: 16, borderBottomWidth: 1, borderColor: theme.colors.primaryLight },
  employeeName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  employeeDept: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  modalCancel: { marginTop: 16, padding: 14, alignItems: 'center' },
  modalCancelText: { color: theme.colors.textSecondary, fontSize: 16 },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
});
