import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const TRAINING_MODULES = [
  {
    id: 'safety',
    title: 'Safety First',
    icon: 'shield-checkmark',
    color: '#22C55E',
    content: `• Always wear your seatbelt and ensure passengers do too
• Check mirrors and blind spots before changing lanes
• Maintain a safe following distance (3+ seconds in good weather)
• Never use your phone while driving – pull over if you need to respond
• In Jamaica: drive on the LEFT side of the road
• Be extra cautious at night and in rain – reduce speed
• If you feel tired, take a break – fatigue kills`,
  },
  {
    id: 'customer',
    title: 'Customer Service',
    icon: 'happy',
    color: '#0EA5E9',
    content: `• Greet riders by name when they enter
• Confirm pickup and dropoff before starting
• Ask about temperature and music preferences
• Keep the vehicle clean and odor-free
• Be polite even when riders are difficult
• Respect rider privacy – no personal questions
• A 5-star rating comes from small touches`,
  },
  {
    id: 'local',
    title: 'Jamaica Road Rules',
    icon: 'navigate',
    color: '#F59E0B',
    content: `• Speed limits: 50 km/h in towns, 80 km/h on highways
• Always carry your driver's licence and vehicle documents
• Fitness and registration must be current – no exceptions
• Horn use: brief taps only when necessary
• Parking: follow signs – tow-away zones are strictly enforced
• Roundabouts: give way to traffic already in the roundabout
• Police checks: stay calm, show documents when asked`,
  },
  {
    id: 'emergency',
    title: 'Emergency Procedures',
    icon: 'alert-circle',
    color: '#EF4444',
    content: `• If a rider needs help: use the in-app Emergency button
• Know your location – share with 119 or emergency contact
• First aid: basic bandages in glove box recommended
• Accident: stop, ensure safety, call police, exchange details
• Never leave the scene of an accident
• Document everything: photos, witness info, licence plates`,
  },
];

const COMPLETED_KEY = 'armada_driver_training_completed';

export default function DriverTrainingScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { userProfile } = useAuth();
  const [completed, setCompleted] = useState(new Set());
  const [selectedModule, setSelectedModule] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(COMPLETED_KEY).then((stored) => {
      if (stored) {
        try {
          setCompleted(new Set(JSON.parse(stored)));
        } catch (_) {}
      }
    });
  }, []);

  const markComplete = (id) => {
    const next = new Set(completed);
    next.add(id);
    setCompleted(next);
    AsyncStorage.setItem(COMPLETED_KEY, JSON.stringify([...next]));
    setSelectedModule(null);
  };

  const progress = (completed.size / TRAINING_MODULES.length) * 100;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Driver Training</Text>
      <Text style={styles.subtitle}>Complete modules to stay sharp on the road</Text>

      <View style={styles.progressCard}>
        <View style={styles.progressRow}>
          <Ionicons name="trophy" size={28} color={theme.colors.primary} />
          <View style={styles.progressText}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressValue}>{completed.size} of {TRAINING_MODULES.length} completed</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>

      {TRAINING_MODULES.map((m) => (
        <TouchableOpacity
          key={m.id}
          style={[styles.moduleCard, { borderLeftColor: m.color }]}
          onPress={() => setSelectedModule(m)}
          activeOpacity={0.8}
        >
          <View style={styles.moduleHeader}>
            <View style={[styles.moduleIconWrap, { backgroundColor: m.color + '25' }]}>
              <Ionicons name={m.icon} size={28} color={m.color} />
            </View>
            <View style={styles.moduleInfo}>
              <Text style={styles.moduleTitle}>{m.title}</Text>
              <Text style={styles.moduleStatus}>
                {completed.has(m.id) ? (
                  <Text style={styles.completedText}>✓ Completed</Text>
                ) : (
                  'Tap to read'
                )}
              </Text>
            </View>
            {completed.has(m.id) ? (
              <Ionicons name="checkmark-circle" size={28} color={theme.colors.success} />
            ) : (
              <Ionicons name="chevron-forward" size={24} color={theme.colors.textSecondary} />
            )}
          </View>
        </TouchableOpacity>
      ))}

      <Modal visible={!!selectedModule} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            {selectedModule && (
              <>
                <View style={[styles.modalHeader, { backgroundColor: selectedModule.color + '20' }]}>
                  <Ionicons name={selectedModule.icon} size={40} color={selectedModule.color} />
                  <Text style={styles.modalTitle}>{selectedModule.title}</Text>
                </View>
                <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                  <Text style={styles.modalText}>{selectedModule.content}</Text>
                </ScrollView>
                <TouchableOpacity
                  style={[styles.completeBtn, { backgroundColor: selectedModule.color }]}
                  onPress={() => markComplete(selectedModule.id)}
                >
                  <Text style={styles.completeBtnText}>Mark as complete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedModule(null)}>
                  <Text style={styles.closeBtnText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24 },
  progressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: theme.colors.primaryLight,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressText: { flex: 1 },
  progressLabel: { fontSize: 14, color: theme.colors.textSecondary },
  progressValue: { fontSize: 18, fontWeight: 'bold', color: theme.colors.primary },
  progressBar: { height: 8, backgroundColor: theme.colors.background, borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: theme.colors.success, borderRadius: 4 },
  moduleCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  moduleHeader: { flexDirection: 'row', alignItems: 'center' },
  moduleIconWrap: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  moduleInfo: { flex: 1 },
  moduleTitle: { fontSize: 17, fontWeight: 'bold', color: theme.colors.text },
  moduleStatus: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  completedText: { color: theme.colors.success, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: theme.colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { padding: 24, alignItems: 'center', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: theme.colors.text, marginTop: 12 },
  modalBody: { padding: 24, maxHeight: 300 },
  modalText: { fontSize: 16, lineHeight: 26, color: theme.colors.text },
  completeBtn: { marginHorizontal: 24, marginTop: 8, padding: 16, borderRadius: 12, alignItems: 'center' },
  completeBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  closeBtn: { padding: 16, alignItems: 'center' },
  closeBtnText: { color: theme.colors.textSecondary, fontSize: 16 },
});
