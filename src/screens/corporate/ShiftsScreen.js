import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createShift, subscribeToShifts, updateShift, deleteShift } from '../../services/corporateService';
import { useAuth } from '../../context/AuthContext';
import { isFirebaseReady } from '../../config/firebase';
import { useTheme } from '../../context/ThemeContext';

export default function ShiftsScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [timeStart, setTimeStart] = useState('23:00');
  const [timeEnd, setTimeEnd] = useState('02:00');
  const [rideCount, setRideCount] = useState('5');
  const [farePerRide, setFarePerRide] = useState('800');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [editTimeStart, setEditTimeStart] = useState('');
  const [editTimeEnd, setEditTimeEnd] = useState('');
  const [editRideCount, setEditRideCount] = useState('');
  const [editFarePerRide, setEditFarePerRide] = useState('');

  useEffect(() => {
    if (!isFirebaseReady || !userProfile?.id) return;
    const unsub = subscribeToShifts(userProfile.id, (firebaseShifts) => {
      setShifts(firebaseShifts.map((s) => ({ id: s.id, ...s })));
    });
    return unsub;
  }, [userProfile?.id]);

  const handleCreateShift = async () => {
    const shift = {
      timeRange: `${timeStart} - ${timeEnd}`,
      rideCount: parseInt(rideCount, 10),
      farePerRide: parseInt(farePerRide, 10),
      companyName: userProfile?.name || 'Company',
    };
    try {
      await createShift(userProfile?.id, shift);
      Alert.alert('Shift created', `${shift.rideCount} rides @ J$${shift.farePerRide}/ride`);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not create shift');
    }
  };

  const openEdit = (s) => {
    const [start, end] = (s.timeRange || '').split(' - ');
    setEditingShift(s);
    setEditTimeStart(start || '23:00');
    setEditTimeEnd(end || '02:00');
    setEditRideCount(String(s.rideCount || ''));
    setEditFarePerRide(String(s.farePerRide || ''));
    setEditModalVisible(true);
  };

  const handleUpdateShift = async () => {
    if (!editingShift) return;
    try {
      await updateShift(editingShift.id, {
        timeRange: `${editTimeStart} - ${editTimeEnd}`,
        rideCount: parseInt(editRideCount, 10),
        farePerRide: parseInt(editFarePerRide, 10),
      });
      setEditModalVisible(false);
      Alert.alert('Updated', 'Shift updated');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update');
    }
  };

  const handleDeleteShift = (s) => {
    Alert.alert('Delete shift', `Delete ${s.timeRange}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteShift(s.id);
            Alert.alert('Deleted', 'Shift removed');
          } catch (e) {
            Alert.alert('Error', e.message || 'Could not delete');
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Create shift</Text>
      <View style={styles.form}>
        <Text style={styles.label}>Time range</Text>
        <View style={styles.row}>
          <TextInput style={styles.input} value={timeStart} onChangeText={setTimeStart} placeholder="23:00" />
          <Text style={styles.dash}>–</Text>
          <TextInput style={styles.input} value={timeEnd} onChangeText={setTimeEnd} placeholder="02:00" />
        </View>
        <Text style={styles.label}># of rides</Text>
        <TextInput style={styles.input} value={rideCount} onChangeText={setRideCount} keyboardType="number-pad" />
        <Text style={styles.label}>J$ per ride</Text>
        <TextInput style={styles.input} value={farePerRide} onChangeText={setFarePerRide} keyboardType="number-pad" />
        <TouchableOpacity style={styles.button} onPress={handleCreateShift}>
          <Text style={styles.buttonText}>Create shift</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.title}>Your shifts</Text>
      {shifts.map((s) => (
        <View key={s.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTime}>{s.timeRange}</Text>
            <View style={[styles.statusBadge, s.status === 'assigned' ? styles.statusAssigned : styles.statusOpen]}>
              <Text style={styles.statusText}>{s.status === 'assigned' ? 'Assigned' : 'Open'}</Text>
            </View>
          </View>
          <Text style={styles.cardDetail}>{s.rideCount} rides @ J${s.farePerRide}</Text>
          {s.status === 'assigned' && s.driverId && (
            <Text style={styles.driverName}>Driver assigned</Text>
          )}
          <View style={styles.cardActions}>
            {s.status === 'open' && (
              <>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(s)}>
                  <Ionicons name="pencil" size={20} color={theme.colors.primary} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteShift(s)}>
                  <Ionicons name="trash" size={20} color={theme.colors.error} />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      ))}

      <Modal visible={editModalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setEditModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Edit shift</Text>
            <Text style={styles.label}>Time range</Text>
            <View style={styles.row}>
              <TextInput style={styles.input} value={editTimeStart} onChangeText={setEditTimeStart} placeholder="23:00" />
              <Text style={styles.dash}>–</Text>
              <TextInput style={styles.input} value={editTimeEnd} onChangeText={setEditTimeEnd} placeholder="02:00" />
            </View>
            <Text style={styles.label}># of rides</Text>
            <TextInput style={styles.input} value={editRideCount} onChangeText={setEditRideCount} keyboardType="number-pad" />
            <Text style={styles.label}>J$ per ride</Text>
            <TextInput style={styles.input} value={editFarePerRide} onChangeText={setEditFarePerRide} keyboardType="number-pad" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateShift}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  title: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, padding: 24, paddingBottom: 12 },
  form: { paddingHorizontal: 24, marginBottom: 24 },
  label: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  dash: { fontSize: 18, color: theme.colors.textSecondary },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
  card: {
    marginHorizontal: 24,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTime: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusOpen: { backgroundColor: theme.colors.accent + '30' },
  statusAssigned: { backgroundColor: theme.colors.success + '30' },
  statusText: { fontSize: 12, fontWeight: '600', color: theme.colors.text },
  cardDetail: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  driverName: { fontSize: 12, color: theme.colors.success, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtnText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deleteBtnText: { fontSize: 14, color: theme.colors.error, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.white, padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center' },
  cancelText: { color: theme.colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center' },
  saveText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
});
