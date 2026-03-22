/**
 * Sentry crash reporting — only when EXPO_PUBLIC_SENTRY_DSN is set (no default DSN in repo).
 */
import * as Sentry from '@sentry/react-native';

export const isSentryEnabled = !!process.env.EXPO_PUBLIC_SENTRY_DSN;
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.2,
    environment: process.env.EXPO_PUBLIC_APP_ENV || 'production',
  });
}

export function captureException(error, context) {
  if (!dsn) return;
  Sentry.captureException(error, context);
}
