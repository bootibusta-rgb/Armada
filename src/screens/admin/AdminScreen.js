import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  getAdminStats,
  adminUpdateUser,
  adminUpdateRide,
  adminUpdateFoodOrder,
  adminUpdateEmergency,
  adminUpdateShift,
  adminDeleteShift,
  adminUpdateVehicle,
} from '../../services/adminService';

const ADMIN_BUTTONS = [
  { key: 'users', label: 'Users', icon: 'people', color: '#6366F1', sub: 'Manage roles & profiles' },
  { key: 'rides', label: 'Rides', icon: 'car', color: '#0EA5E9', sub: 'Status & fare edits' },
  { key: 'vehicles', label: 'Vehicles', icon: 'car-sport', color: '#8B5CF6', sub: 'Fitness & registration' },
  { key: 'orders', label: 'Orders', icon: 'restaurant', color: '#F59E0B', sub: 'Food order status' },
  { key: 'emergencies', label: 'Emergencies', icon: 'alert-circle', color: '#EF4444', sub: 'Emergency call logs' },
  { key: 'corporate', label: 'Corporate', icon: 'business', color: '#10B981', sub: 'Shifts & companies' },
];

const RIDE_STATUSES = ['bidding', 'accepted', 'completed', 'cancelled'];
const ORDER_STATUSES = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];
const EMERGENCY_STATUSES = ['ringing', 'answered', 'declined', 'video-call-requested', 'ended'];
const USER_ROLES = ['rider', 'driver', 'vendor', 'corporate', 'admin'];

export default function AdminScreen({ navigation }) {
  const { theme } = useTheme();
  const { userProfile } = useAuth();
  const styles = createStyles(theme);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [editModal, setEditModal] = useState({ visible: false, type: null, item: null });
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  const isAdmin = userProfile?.admin === true || userProfile?.role === 'admin';

  const loadData = useCallback(async () => {
    try {
      const data = await getAdminStats();
      setStats(data);
    } catch (e) {
      console.warn('Admin load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }
    loadData();
  }, [isAdmin, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const openEdit = (type, item) => {
    setEditModal({ visible: true, type, item });
    if (type === 'user') {
      setEditForm({ name: item.name || '', role: item.role || 'rider', email: item.email || '', phone: item.phone || '' });
    } else if (type === 'ride') {
      setEditForm({ status: item.status || 'bidding', finalFare: String(item.finalFare || item.bidPrice || '') });
    } else if (type === 'order') {
      setEditForm({ status: item.status || 'pending' });
    } else if (type === 'emergency') {
      setEditForm({ status: item.status || 'ringing' });
    } else if (type === 'shift') {
      setEditForm({
        timeRange: item.timeRange || '',
        rideCount: String(item.rideCount || ''),
        farePerRide: String(item.farePerRide || ''),
        status: item.status || 'open',
      });
    } else if (type === 'vehicle') {
      setEditForm({
        registrationNumber: item.registrationNumber || '',
        registrationExpiry: item.registrationExpiry || '',
        fitnessExpiry: item.fitnessExpiry || '',
      });
    }
  };

  const closeEdit = () => {
    setEditModal({ visible: false, type: null, item: null });
    setEditForm({});
    setSaving(false);
  };

  const handleSave = async () => {
    const { type, item } = editModal;
    if (!item?.id) return;
    setSaving(true);
    try {
      if (type === 'user') {
        await adminUpdateUser(item.id, {
          name: editForm.name?.trim() || undefined,
          role: editForm.role,
          email: editForm.email?.trim() || undefined,
          phone: editForm.phone?.trim() || undefined,
        });
        Alert.alert('Saved', 'User updated');
      } else if (type === 'ride') {
        const updates = { status: editForm.status };
        if (editForm.finalFare && !isNaN(parseInt(editForm.finalFare, 10))) {
          updates.finalFare = parseInt(editForm.finalFare, 10);
        }
        await adminUpdateRide(item.id, updates);
        Alert.alert('Saved', 'Ride updated');
      } else if (type === 'order') {
        await adminUpdateFoodOrder(item.id, editForm.status);
        Alert.alert('Saved', 'Order status updated');
      } else if (type === 'emergency') {
        await adminUpdateEmergency(item.id, editForm.status);
        Alert.alert('Saved', 'Emergency status updated');
      } else if (type === 'shift') {
        await adminUpdateShift(item.id, {
          timeRange: editForm.timeRange,
          rideCount: parseInt(editForm.rideCount, 10),
          farePerRide: parseInt(editForm.farePerRide, 10),
          status: editForm.status,
        });
        Alert.alert('Saved', 'Shift updated');
      } else if (type === 'vehicle') {
        await adminUpdateVehicle(item.driverId, item.id, {
          registrationNumber: editForm.registrationNumber?.trim() || null,
          registrationExpiry: editForm.registrationExpiry?.trim() || null,
          fitnessExpiry: editForm.fitnessExpiry?.trim() || null,
        });
        Alert.alert('Saved', 'Vehicle updated');
      }
      closeEdit();
      loadData();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = (shift) => {
    Alert.alert('Delete shift', `Remove shift ${shift.timeRange}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminDeleteShift(shift.id);
            Alert.alert('Deleted', 'Shift removed');
            loadData();
          } catch (e) {
            Alert.alert('Error', e.message || 'Could not delete');
          }
        },
      },
    ]);
  };

  if (accessDenied) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed" size={64} color={theme.colors.error} />
        <Text style={styles.deniedTitle}>Access Denied</Text>
        <Text style={styles.deniedText}>Admin access required.</Text>
        <TouchableOpacity style={[styles.actionBtnLarge, { backgroundColor: '#6366F1' }]} onPress={() => navigation.goBack()}>
          <Text style={styles.actionBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const data = stats || {};
  const counts = data.counts || {};
  const recentUsers = data.recentUsers || [];
  const recentRides = data.recentRides || [];
  const recentOrders = data.recentOrders || [];
  const recentEmergencies = data.recentEmergencies || [];
  const recentShifts = data.recentShifts || [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <Text style={styles.title}>Admin Dashboard</Text>
      <Text style={styles.subtitle}>Monitor and manage the entire platform</Text>

      {/* Stats overview */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderLeftColor: '#6366F1' }]}>
          <Ionicons name="people" size={24} color="#6366F1" />
          <Text style={styles.statValue}>{counts.users || 0}</Text>
          <Text style={styles.statLabel}>Users</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#0EA5E9' }]}>
          <Ionicons name="car" size={24} color="#0EA5E9" />
          <Text style={styles.statValue}>{counts.rides || 0}</Text>
          <Text style={styles.statLabel}>Rides</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#F59E0B' }]}>
          <Ionicons name="restaurant" size={24} color="#F59E0B" />
          <Text style={styles.statValue}>{counts.orders || 0}</Text>
          <Text style={styles.statLabel}>Orders</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#EF4444' }]}>
          <Ionicons name="alert-circle" size={24} color="#EF4444" />
          <Text style={styles.statValue}>{counts.emergencies || 0}</Text>
          <Text style={styles.statLabel}>Emergencies</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#10B981' }]}>
          <Ionicons name="business" size={24} color="#10B981" />
          <Text style={styles.statValue}>{counts.shifts || 0}</Text>
          <Text style={styles.statLabel}>Shifts</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: '#8B5CF6' }]}>
          <Ionicons name="car-sport" size={24} color="#8B5CF6" />
          <Text style={styles.statValue}>{counts.vehicles || 0}</Text>
          <Text style={styles.statLabel}>Vehicles</Text>
        </View>
        {(counts.vehiclesExpiring || 0) > 0 && (
          <View style={[styles.statCard, { borderLeftColor: '#EF4444' }]}>
            <Ionicons name="warning" size={24} color="#EF4444" />
            <Text style={[styles.statValue, { color: '#EF4444' }]}>{counts.vehiclesExpiring}</Text>
            <Text style={styles.statLabel}>Expiring docs</Text>
          </View>
        )}
      </View>

      {/* Quick action buttons */}
      <Text style={styles.sectionTitle}>Sections</Text>
      <View style={styles.buttonsGrid}>
        {ADMIN_BUTTONS.map((btn) => (
          <TouchableOpacity
            key={btn.key}
            style={[styles.sectionBtn, { backgroundColor: btn.color }]}
            onPress={() => setActiveSection(activeSection === btn.key ? null : btn.key)}
            activeOpacity={0.9}
          >
            <Ionicons name={btn.icon} size={22} color="#FFFFFF" />
            <Text style={styles.sectionBtnText}>{btn.label}</Text>
            <Text style={styles.sectionBtnSub}>{btn.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Users */}
      {(activeSection === 'users' || !activeSection) && (
        <SectionCard title="Users" color="#6366F1" emptyMessage="No users yet">
          {recentUsers.map((u) => (
            <TouchableOpacity key={u.id} style={styles.row} onPress={() => openEdit('user', u)}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{u.name || u.email || u.id?.slice(0, 12)}</Text>
                <Text style={styles.rowSub}>{u.email || u.phone || '—'}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: getRoleColor(u.role) }]}>
                <Text style={styles.badgeText}>{u.role || '—'}</Text>
              </View>
              <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}

      {/* Rides */}
      {(activeSection === 'rides' || !activeSection) && (
        <SectionCard title="Rides" color="#0EA5E9" emptyMessage="No rides yet">
          {recentRides.slice(0, 12).map((r) => (
            <TouchableOpacity key={r.id} style={styles.row} onPress={() => openEdit('ride', r)}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{r.pickup || '?'} → {r.dropoff || '?'}</Text>
                <Text style={styles.rowSub}>J${r.finalFare || r.bidPrice || '—'}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: getStatusColor(r.status) }]}>
                <Text style={styles.badgeText}>{r.status || '—'}</Text>
              </View>
              <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}

      {/* Vehicles (fitness & registration) */}
      {(activeSection === 'vehicles' || !activeSection) && (
        <SectionCard title="Vehicles (fitness & registration)" color="#8B5CF6" emptyMessage="No vehicles with expiring docs">
          {(data.vehiclesExpiringOrExpired || []).map((v) => (
            <TouchableOpacity key={`${v.driverId}-${v.id}`} style={styles.row} onPress={() => openEdit('vehicle', v)}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{v.make} {v.model} • {v.licensePlate}</Text>
                <Text style={styles.rowSub}>{v.driverName} • Reg: {v.registrationNumber || '—'} • Reg expiry: {v.registrationExpiry || '—'} • Fitness: {v.fitnessExpiry || '—'}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: (v.registrationExpired || v.fitnessExpired) ? '#EF4444' : '#F59E0B' }]}>
                <Text style={styles.badgeText}>{(v.registrationExpired || v.fitnessExpired) ? 'Expired' : 'Soon'}</Text>
              </View>
              <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}

      {/* Orders */}
      {(activeSection === 'orders' || !activeSection) && (
        <SectionCard title="Food Orders" color="#F59E0B" emptyMessage="No food orders yet">
          {recentOrders.map((o) => (
            <TouchableOpacity key={o.id} style={styles.row} onPress={() => openEdit('order', o)}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>Order {o.id?.slice(0, 8)}...</Text>
                <Text style={styles.rowSub}>Ride: {o.rideId?.slice(0, 8)}...</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: getStatusColor(o.status) }]}>
                <Text style={styles.badgeText}>{o.status || '—'}</Text>
              </View>
              <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}

      {/* Emergencies */}
      {(activeSection === 'emergencies' || !activeSection) && (
        <SectionCard title="Emergency Calls" color="#EF4444" emptyMessage="No emergency calls yet">
          {recentEmergencies.map((e) => (
            <TouchableOpacity key={e.id} style={styles.row} onPress={() => openEdit('emergency', e)}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{e.fromName || 'Rider'} → {e.toUid?.slice(0, 8)}...</Text>
                <Text style={styles.rowSub}>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: getStatusColor(e.status) }]}>
                <Text style={styles.badgeText}>{e.status || '—'}</Text>
              </View>
              <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </SectionCard>
      )}

      {/* Corporate Shifts */}
      {(activeSection === 'corporate' || !activeSection) && (
        <SectionCard title="Corporate Shifts" color="#10B981" emptyMessage="No corporate shifts yet">
          {recentShifts.map((s) => (
            <View key={s.id} style={styles.row}>
              <TouchableOpacity style={styles.rowLeft} onPress={() => openEdit('shift', s)}>
                <Text style={styles.rowTitle}>{s.timeRange || '—'} • {s.companyName || 'Company'}</Text>
                <Text style={styles.rowSub}>{s.rideCount || 0} rides @ J${s.farePerRide || 0} • {s.status}</Text>
              </TouchableOpacity>
              <View style={[styles.badge, { backgroundColor: getStatusColor(s.status) }]}>
                <Text style={styles.badgeText}>{s.status}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDeleteShift(s)} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openEdit('shift', s)}>
                <Ionicons name="create-outline" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </SectionCard>
      )}

      <TouchableOpacity style={[styles.actionBtnLarge, { backgroundColor: '#6366F1' }]} onPress={() => navigation.goBack()}>
        <Text style={styles.actionBtnText}>Back</Text>
      </TouchableOpacity>

      {/* Edit Modal */}
      <Modal visible={editModal.visible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Edit {editModal.type === 'user' ? 'User' : editModal.type === 'ride' ? 'Ride' : editModal.type === 'order' ? 'Order' : editModal.type === 'emergency' ? 'Emergency' : editModal.type === 'vehicle' ? 'Vehicle' : 'Shift'}
            </Text>

            {editModal.type === 'user' && (
              <>
                <Field label="Name" value={editForm.name} onChange={(v) => setEditForm((f) => ({ ...f, name: v }))} />
                <Field label="Email" value={editForm.email} onChange={(v) => setEditForm((f) => ({ ...f, email: v }))} />
                <Field label="Phone" value={editForm.phone} onChange={(v) => setEditForm((f) => ({ ...f, phone: v }))} />
                <Field label="Role" value={editForm.role} onChange={(v) => setEditForm((f) => ({ ...f, role: v }))} pickerOptions={USER_ROLES} />
              </>
            )}
            {editModal.type === 'ride' && (
              <>
                <Field label="Status" value={editForm.status} onChange={(v) => setEditForm((f) => ({ ...f, status: v }))} pickerOptions={RIDE_STATUSES} />
                <Field label="Final fare (J$)" value={editForm.finalFare} onChange={(v) => setEditForm((f) => ({ ...f, finalFare: v }))} keyboardType="number-pad" />
              </>
            )}
            {editModal.type === 'order' && (
              <Field label="Status" value={editForm.status} onChange={(v) => setEditForm((f) => ({ ...f, status: v }))} pickerOptions={ORDER_STATUSES} />
            )}
            {editModal.type === 'emergency' && (
              <Field label="Status" value={editForm.status} onChange={(v) => setEditForm((f) => ({ ...f, status: v }))} pickerOptions={EMERGENCY_STATUSES} />
            )}
            {editModal.type === 'shift' && (
              <>
                <Field label="Time range" value={editForm.timeRange} onChange={(v) => setEditForm((f) => ({ ...f, timeRange: v }))} />
                <Field label="Ride count" value={editForm.rideCount} onChange={(v) => setEditForm((f) => ({ ...f, rideCount: v }))} keyboardType="number-pad" />
                <Field label="Fare per ride" value={editForm.farePerRide} onChange={(v) => setEditForm((f) => ({ ...f, farePerRide: v }))} keyboardType="number-pad" />
                <Field label="Status" value={editForm.status} onChange={(v) => setEditForm((f) => ({ ...f, status: v }))} pickerOptions={['open', 'assigned', 'cancelled']} />
              </>
            )}
            {editModal.type === 'vehicle' && (
              <>
                <Field label="Registration number" value={editForm.registrationNumber} onChange={(v) => setEditForm((f) => ({ ...f, registrationNumber: v }))} />
                <Field label="Registration expiry (YYYY-MM-DD)" value={editForm.registrationExpiry} onChange={(v) => setEditForm((f) => ({ ...f, registrationExpiry: v }))} />
                <Field label="Fitness expiry (YYYY-MM-DD)" value={editForm.fitnessExpiry} onChange={(v) => setEditForm((f) => ({ ...f, fitnessExpiry: v }))} />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={closeEdit}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: '#10B981' }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.actionBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function SectionCard({ title, color, children, emptyMessage }) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <View style={[styles.sectionCard, { borderLeftColor: color }]}>
      <Text style={[styles.sectionCardTitle, { color }]}>{title}</Text>
      {hasChildren ? children : <Text style={styles.emptyMsg}>{emptyMessage || 'No items yet'}</Text>}
    </View>
  );
}

function Field({ label, value, onChange, keyboardType, pickerOptions }) {
  if (pickerOptions) {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.pickerRow}>
          {pickerOptions.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[styles.pickerOpt, value === opt && styles.pickerOptActive]}
              onPress={() => onChange(opt)}
            >
              <Text style={[styles.pickerOptText, value === opt && styles.pickerOptTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholderTextColor={theme.colors.textSecondary}
      />
    </View>
  );
}

function getRoleColor(role) {
  const m = { rider: '#0EA5E9', driver: '#F59E0B', vendor: '#10B981', corporate: '#6366F1', admin: '#EF4444' };
  return m[role] || '#6B7280';
}

function getStatusColor(status) {
  const m = {
    bidding: '#F59E0B', accepted: '#0EA5E9', completed: '#10B981', cancelled: '#6B7280',
    pending: '#F59E0B', preparing: '#0EA5E9', ready: '#6366F1', delivered: '#10B981',
    ringing: '#EF4444', answered: '#10B981', declined: '#6B7280', 'video-call-requested': '#6366F1', ended: '#10B981',
    open: '#F59E0B', assigned: '#10B981',
  };
  return m[status] || '#6B7280';
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20 },
  deniedTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.error, marginTop: 16 },
  deniedText: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    width: '30%',
    minWidth: 90,
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginTop: 6 },
  statLabel: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 12 },
  buttonsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  sectionBtn: {
    width: '47%',
    minWidth: 140,
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  sectionBtnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  sectionCardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  rowLeft: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  rowSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8 },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  deleteBtn: { marginRight: 8 },
  actionBtnLarge: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: theme.colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: theme.colors.text, marginBottom: 20 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  pickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickerOpt: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickerOptActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  pickerOptText: { fontSize: 14, color: theme.colors.text },
  pickerOptTextActive: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 10 },
  modalCancelText: { color: theme.colors.textSecondary, fontWeight: '600' },
  modalSave: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10 },
  emptyMsg: { fontSize: 14, color: theme.colors.textSecondary, fontStyle: 'italic' },
});
