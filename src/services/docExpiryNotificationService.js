/**
 * Schedules local notifications when vehicle docs (fitness, registration) are expiring.
 * Notifications fire 7 days before expiry.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const DOC_EXPIRY_PREFIX = 'armada-doc-expiry-';
const DAYS_BEFORE = 7;

function isExpired(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d < new Date();
}

function getNotifyDate(expiryStr) {
  if (!expiryStr) return null;
  const d = new Date(expiryStr);
  if (isNaN(d.getTime()) || d < new Date()) return null;
  const notify = new Date(d);
  notify.setDate(notify.getDate() - DAYS_BEFORE);
  if (notify < new Date()) return null;
  return notify;
}

export async function scheduleDocExpiryNotifications(vehicles) {
  if (Platform.OS === 'web') return;
  try {
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    const toCancel = existing.filter((n) => n.identifier?.startsWith?.(DOC_EXPIRY_PREFIX));
    for (const n of toCancel) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }

    for (const v of vehicles || []) {
      if (v.registrationExpiry) {
        const date = getNotifyDate(v.registrationExpiry);
        if (date) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${DOC_EXPIRY_PREFIX}reg-${v.id}`,
            content: {
              title: 'Registration expiring soon',
              body: `${v.make} ${v.model}: registration expires in ${DAYS_BEFORE} days. Renew in Fleet.`,
            },
            trigger: {
              type: 'date',
              date,
            },
          });
        }
      }
      if (v.fitnessExpiry) {
        const date = getNotifyDate(v.fitnessExpiry);
        if (date) {
          await Notifications.scheduleNotificationAsync({
            identifier: `${DOC_EXPIRY_PREFIX}fit-${v.id}`,
            content: {
              title: 'Fitness certificate expiring soon',
              body: `${v.make} ${v.model}: fitness expires in ${DAYS_BEFORE} days. Renew in Fleet.`,
            },
            trigger: {
              type: 'date',
              date,
            },
          });
        }
      }
    }
  } catch (e) {
    console.warn('Doc expiry notification scheduling failed:', e.message);
  }
}

export function getExpiringDocsBanner(vehicles) {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const messages = [];
  for (const v of vehicles || []) {
    if (v.registrationExpiry) {
      const d = new Date(v.registrationExpiry);
      if (!isNaN(d.getTime()) && d > now) {
        if (d <= in7) messages.push(`Registration for ${v.make} ${v.model} expires in ${Math.ceil((d - now) / (24 * 60 * 60 * 1000))} days`);
        else if (d <= in30) messages.push(`Registration for ${v.make} ${v.model} expires ${v.registrationExpiry}`);
      }
    }
    if (v.fitnessExpiry) {
      const d = new Date(v.fitnessExpiry);
      if (!isNaN(d.getTime()) && d > now) {
        if (d <= in7) messages.push(`Fitness for ${v.make} ${v.model} expires in ${Math.ceil((d - now) / (24 * 60 * 60 * 1000))} days`);
        else if (d <= in30) messages.push(`Fitness for ${v.make} ${v.model} expires ${v.fitnessExpiry}`);
      }
    }
  }
  return messages;
}
