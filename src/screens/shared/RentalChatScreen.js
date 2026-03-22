import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { sendRentalChatMessage, subscribeToRentalChat, ensureRentalChatParticipants } from '../../services/chatService';
import { useTheme } from '../../context/ThemeContext';

export default function RentalChatScreen({ route, navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { requestId, otherName, isDemo, riderId: paramRiderId, ownerId: paramOwnerId } = route.params || {};
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!requestId || isDemo) return;
    const riderId = paramRiderId || (userProfile?.role === 'rider' ? userProfile?.id : null);
    const ownerId = paramOwnerId || (userProfile?.role === 'carRental' ? userProfile?.id : null);
    if (riderId && ownerId) {
      ensureRentalChatParticipants(requestId, riderId, ownerId).catch(() => {});
    }
  }, [requestId, isDemo, paramRiderId, paramOwnerId, userProfile?.id, userProfile?.role]);

  useEffect(() => {
    if (!requestId || isDemo) return;
    const unsub = subscribeToRentalChat(requestId, (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    return unsub;
  }, [requestId, isDemo]);

  const send = () => {
    const text = input.trim();
    if (!text || !requestId) return;
    if (isDemo) {
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          text,
          senderId: userProfile?.id,
          senderName: userProfile?.name || 'You',
          timestamp: Date.now(),
        },
      ]);
      setInput('');
      return;
    }
    sendRentalChatMessage(requestId, {
      text,
      senderId: userProfile?.id,
      senderName: userProfile?.name || 'User',
    });
    setInput('');
  };

  const isOwn = (msg) => msg.senderId === userProfile?.id;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backTouch}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{otherName || 'Car Rental'}</Text>
      </View>
      {isDemo ? (
        <Text style={styles.demoBanner}>Demo — messages are not saved</Text>
      ) : null}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubble, isOwn(item) ? styles.bubbleOwn : styles.bubbleOther]}>
            {!isOwn(item) && <Text style={styles.senderName}>{item.senderName}</Text>}
            <Text style={[styles.msgText, isOwn(item) && styles.msgTextOwn]}>{item.text}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message about this rental..."
          value={input}
          onChangeText={setInput}
          placeholderTextColor={theme.colors.textSecondary}
          multiline
          maxLength={500}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={!input.trim()}>
          <Ionicons name="send" size={24} color={theme.colors.onPrimary} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: theme.colors.primary,
    },
    backTouch: { padding: 8, marginRight: 8 },
    backText: { color: theme.colors.onPrimary, fontSize: 20, fontWeight: 'bold' },
    headerTitle: { flex: 1, color: theme.colors.onPrimary, fontSize: 18, fontWeight: 'bold' },
    demoBanner: {
      textAlign: 'center',
      padding: 8,
      backgroundColor: theme.colors.accent + '30',
      color: theme.colors.textSecondary,
      fontSize: 12,
    },
    list: { padding: 16, paddingBottom: 8 },
    bubble: { maxWidth: '85%', padding: 12, borderRadius: 14, marginBottom: 10 },
    bubbleOwn: { alignSelf: 'flex-end', backgroundColor: theme.colors.primary },
    bubbleOther: { alignSelf: 'flex-start', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.primaryLight },
    senderName: { fontSize: 11, color: theme.colors.textSecondary, marginBottom: 4 },
    msgText: { fontSize: 15, color: theme.colors.text },
    msgTextOwn: { color: theme.colors.onPrimary },
    inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderTopColor: theme.colors.primaryLight },
    input: {
      flex: 1,
      maxHeight: 100,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginRight: 8,
      fontSize: 16,
    },
    sendBtn: {
      backgroundColor: theme.colors.primary,
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
