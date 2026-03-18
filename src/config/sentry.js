/**
 * Sentry crash reporting.
 * Override DSN via EXPO_PUBLIC_SENTRY_DSN in .env for different environments.
 */
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://22c7ab059e34d7a0a63a63f85d1eaaa8@o4511061737865216.ingest.us.sentry.io/4511061744091137',
  sendDefaultPii: true,
  tracesSampleRate: 0.2,
  environment: process.env.EXPO_PUBLIC_APP_ENV || 'production',
});
