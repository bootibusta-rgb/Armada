import { Linking, Alert } from 'react-native';

/** Normalize to digits suitable for Jamaica (+1 876 …) */
export function digitsForJam(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('1876') && d.length === 11) return d;
  if (d.startsWith('876') && d.length === 10) return `1${d}`;
  if (d.startsWith('1') && d.length === 11) return d;
  if (d.length === 10) return `1${d}`;
  return d;
}

export function openDial(phone) {
  const d = digitsForJam(phone);
  if (!d) {
    Alert.alert('No number', 'Rider did not provide a phone number.');
    return;
  }
  Linking.openURL(`tel:+${d}`);
}

export function openSms(phone, body) {
  const d = digitsForJam(phone);
  if (!d) {
    Alert.alert('No number', 'Rider did not provide a phone number.');
    return;
  }
  const url = `sms:+${d}?body=${encodeURIComponent(body || '')}`;
  Linking.openURL(url).catch(() => Alert.alert('SMS', 'Could not open SMS app.'));
}

export function openWhatsApp(phone, text) {
  const d = digitsForJam(phone);
  if (!d) {
    Alert.alert('No number', 'Rider did not provide a phone number.');
    return;
  }
  const wa = d.startsWith('1') ? d : `1${d}`;
  const url = `https://wa.me/${wa}?text=${encodeURIComponent(text || '')}`;
  Linking.openURL(url).catch(() => Alert.alert('WhatsApp', 'Could not open WhatsApp.'));
}

export function pickTextRider(phone) {
  const prefill = 'Yes, come now';
  Alert.alert('Text rider', 'Choose app', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'SMS', onPress: () => openSms(phone, prefill) },
    { text: 'WhatsApp', onPress: () => openWhatsApp(phone, prefill) },
  ]);
}
