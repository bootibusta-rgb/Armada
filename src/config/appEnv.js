/**
 * Build / runtime environment (set by EAS: EXPO_PUBLIC_APP_ENV)
 */
export const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV || 'development';
export const isProductionApp = APP_ENV === 'production';
