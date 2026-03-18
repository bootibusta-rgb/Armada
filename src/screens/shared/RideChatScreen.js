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
import { sendChatMessage, subscribeToChat } from '../../services/chatService';
import { useTheme } from '../../context/ThemeContext';

export default function RideChatScreen({ route, navigation }) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { rideId, otherName } = route.params || {};
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!rideId) return;
    const unsub = subscribeToChat(rideId, (msg) => {
      setMessages((prev) => [...prev, msg]);
    });
    return unsub;
  }, [rideId]);

  const send = () => {
    const text = input.trim();
    if (!text || !rideId) return;
    sendChatMessage(rideId, {
      text,
      senderId: userProfile?.id,
      senderName: userProfile?.name || 'User',
    });
    setInput('');
  };

  const isOwn = (msg) => msg.senderId === userProfile?.id;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat with {otherName || 'Ride partner'}</Text>
      </View>
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
          placeholder="Type a message..."
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

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: 16, backgroundColor: theme.colors.primary },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: theme.colors.onPrimary },
  list: { padding: 16, paddingBottom: 8 },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  bubbleOwn: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary,
  },
  bubbleOther: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  senderName: { fontSize: 12, color: theme.colors.primary, marginBottom: 4 },
  msgText: { fontSize: 16, color: theme.colors.text },
  msgTextOwn: { color: theme.colors.onPrimary },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
