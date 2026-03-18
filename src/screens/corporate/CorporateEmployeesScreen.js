import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getEmployees, saveEmployees } from '../../services/corporateService';
import { useTheme } from '../../context/ThemeContext';

export default function CorporateEmployeesScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');

  const loadEmployees = async () => {
    if (userProfile?.id) {
      const list = await getEmployees(userProfile.id);
      setEmployees(list.length ? list : []);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [userProfile?.id]);

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setEmail('');
    setDepartment('');
    setModalVisible(true);
  };

  const openEdit = (emp) => {
    setEditingId(emp.id);
    setName(emp.name || '');
    setPhone(emp.phone || '');
    setEmail(emp.email || '');
    setDepartment(emp.department || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Enter employee name');
      return;
    }
    setLoading(true);
    try {
      let updated = [...employees];
      if (editingId) {
        updated = updated.map((e) =>
          e.id === editingId ? { ...e, name: name.trim(), phone: phone.trim(), email: email.trim(), department: department.trim() } : e
        );
      } else {
        updated.push({ id: `emp-${Date.now()}`, name: name.trim(), phone: phone.trim(), email: email.trim(), department: department.trim() });
      }
      await saveEmployees(userProfile.id, updated);
      setEmployees(updated);
      setModalVisible(false);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = (emp) => {
    Alert.alert('Remove employee', `Remove ${emp.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const updated = employees.filter((e) => e.id !== emp.id);
            await saveEmployees(userProfile.id, updated);
            setEmployees(updated);
          } catch (e) {
            Alert.alert('Error', e.message || 'Failed to remove');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Employees</Text>
      <Text style={styles.subtitle}>Staff who can use corporate rides</Text>

      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Ionicons name="add-circle" size={24} color={theme.colors.primary} />
        <Text style={styles.addBtnText}>Add employee</Text>
      </TouchableOpacity>

      {employees.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No employees yet</Text>
          <Text style={styles.emptySub}>Add employees to book rides for them</Text>
        </View>
      ) : (
        employees.map((emp) => (
          <View key={emp.id} style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.empName}>{emp.name}</Text>
              {emp.department ? <Text style={styles.empDept}>{emp.department}</Text> : null}
              {emp.phone ? <Text style={styles.empDetail}>{emp.phone}</Text> : null}
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openEdit(emp)}>
                <Ionicons name="pencil" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRemove(emp)}>
                <Ionicons name="trash" size={22} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>{editingId ? 'Edit employee' : 'Add employee'}</Text>
            <TextInput style={styles.input} placeholder="Name *" value={name} onChangeText={setName} placeholderTextColor={theme.colors.textSecondary} />
            <TextInput style={styles.input} placeholder="Phone" value={phone} onChangeText={setPhone} placeholderTextColor={theme.colors.textSecondary} keyboardType="phone-pad" />
            <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} placeholderTextColor={theme.colors.textSecondary} keyboardType="email-address" />
            <TextInput style={styles.input} placeholder="Department" value={department} onChangeText={setDepartment} placeholderTextColor={theme.colors.textSecondary} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, loading && styles.saveBtnDisabled]} onPress={handleSave} disabled={loading}>
                <Text style={styles.saveText}>{loading ? 'Saving...' : 'Save'}</Text>
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
  content: { padding: 24, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  addBtnText: { fontSize: 16, fontWeight: '600', color: theme.colors.primary },
  empty: { padding: 32, alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: theme.colors.textSecondary },
  emptySub: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  cardBody: { flex: 1 },
  empName: { fontSize: 16, fontWeight: 'bold', color: theme.colors.primary },
  empDept: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  empDetail: { fontSize: 14, color: theme.colors.text, marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.white, padding: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 20 },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: theme.colors.surface, alignItems: 'center' },
  cancelText: { color: theme.colors.textSecondary, fontWeight: '600' },
  saveBtn: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: theme.colors.primary, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
});
