/**
 * Emergency video call screen - WebRTC video call between rider and emergency contact.
 * Requires dev build (react-native-webrtc does not work in Expo Go).
 */
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import {
  setWebRTCOffer,
  setWebRTCAnswer,
  pushWebRTCIceCandidate,
  subscribeToWebRTCSignaling,
} from '../../services/emergencyService';
import { useTheme } from '../../context/ThemeContext';

let RTCView = null;
let RTCPeerConnection = null;
let mediaDevices = null;
let RTCSessionDescription = null;
let RTCIceCandidate = null;

try {
  const webrtc = require('react-native-webrtc');
  RTCView = webrtc.RTCView;
  RTCPeerConnection = webrtc.RTCPeerConnection;
  mediaDevices = webrtc.mediaDevices;
  RTCSessionDescription = webrtc.RTCSessionDescription;
  RTCIceCandidate = webrtc.RTCIceCandidate;
} catch (e) {
  console.warn('WebRTC not available:', e.message);
}

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export default function EmergencyVideoCallScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { callId, isCaller, fromUid, fromName, toUid, toName } = route.params || {};
  const { userProfile } = useAuth();
  const styles = createStyles(theme);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [status, setStatus] = useState(isCaller ? 'calling' : 'waiting');
  const [error, setError] = useState(null);
  const pcRef = useRef(null);
  const signalingUnsub = useRef(null);

  const myUid = userProfile?.id;
  const otherName = isCaller ? toName : fromName;

  useEffect(() => {
    if (!callId || !RTCPeerConnection || !mediaDevices) {
      setError('Video call requires a development build. Use phone call instead.');
      return;
    }

    let mounted = true;

    const setupPeerConnection = (stream) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      pc.ontrack = (e) => {
        if (mounted && e.streams?.[0]) setRemoteStream(e.streams[0]);
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) pushWebRTCIceCandidate(callId, myUid, e.candidate).catch(() => {});
      };
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      return pc;
    };

    const startCall = async () => {
      try {
        const stream = await mediaDevices.getUserMedia({ audio: true, video: true });
        if (!mounted) return;
        setLocalStream(stream);
        const pc = setupPeerConnection(stream);

        if (isCaller) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setWebRTCOffer(callId, offer);
          setStatus('waiting');
        }
      } catch (err) {
        if (mounted) setError(err?.message || 'Could not start video call');
      }
    };

    const handleOffer = async (offer) => {
      if (!isCaller && mounted && RTCSessionDescription) {
        try {
          const stream = await mediaDevices.getUserMedia({ audio: true, video: true });
          if (!mounted) return;
          setLocalStream(stream);
          const pc = setupPeerConnection(stream);
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await setWebRTCAnswer(callId, answer);
          setStatus('connected');
        } catch (err) {
          if (mounted) setError(err?.message);
        }
      }
    };

    if (isCaller) {
      startCall();
    }

    signalingUnsub.current = subscribeToWebRTCSignaling(
      callId,
      handleOffer,
      async (answer) => {
        if (isCaller && pcRef.current && mounted && RTCSessionDescription) {
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            setStatus('connected');
          } catch (err) {
            setError(err?.message);
          }
        }
      },
      async (iceData) => {
        if (iceData.from === myUid || !pcRef.current || !RTCIceCandidate) return;
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(iceData.candidate));
        } catch (err) {}
      }
    );

    return () => {
      mounted = false;
      signalingUnsub.current?.();
      pcRef.current?.close();
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [callId, isCaller, myUid]);

  const handleEnd = () => {
    pcRef.current?.close();
    localStream?.getTracks().forEach((t) => t.stop());
    navigation.goBack();
  };

  if (error || !RTCPeerConnection) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Video call</Text>
          <Text style={styles.error}>
            {error || 'WebRTC is not available in Expo Go. Build a development client (npx expo prebuild && npx expo run:ios/android) to use video calls.'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {remoteStream && RTCView && (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
        />
      )}
      {localStream && RTCView && (
        <View style={styles.localVideoWrap}>
          <RTCView
            streamURL={localStream.toURL()}
            style={styles.localVideo}
            objectFit="cover"
          />
        </View>
      )}
      <View style={styles.overlay}>
        <Text style={styles.statusText}>
          {status === 'calling' && `Calling ${otherName}...`}
          {status === 'waiting' && `Waiting for ${otherName}...`}
          {status === 'connected' && `Connected to ${otherName}`}
        </Text>
        <TouchableOpacity style={styles.endBtn} onPress={handleEnd}>
          <Text style={styles.endBtnText}>End call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  card: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.colors.surface,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: theme.colors.primary, marginBottom: 16, textAlign: 'center' },
  error: { fontSize: 16, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 16 },
  remoteVideo: { flex: 1, width: '100%' },
  localVideoWrap: { position: 'absolute', top: 60, right: 16, width: 120, height: 160, borderRadius: 12, overflow: 'hidden' },
  localVideo: { flex: 1, width: '100%', height: '100%' },
  overlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  statusText: { color: theme.colors.onPrimary, fontSize: 16, marginBottom: 20 },
  endBtn: { backgroundColor: theme.colors.error, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  endBtnText: { color: theme.colors.onPrimary, fontWeight: 'bold', fontSize: 18 },
});
