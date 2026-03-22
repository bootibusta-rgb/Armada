/**
 * PayPal Orders API for car rental listing fee (dynamic: vehicleCount × weekly rate).
 * Server creates order + verifies capture; subscription only updates after full payment.
 */
import { updateUserProfile } from './authService';
import { payWithPayPalOrders } from './appPayPalOrderService';
import {
  buildRenewedRentalListingSubscription,
  countRentalVehiclesForBilling,
} from './carRentalService';

/**
 * Opens PayPal approval and captures on return. Subscription is written only by Cloud Function after verify.
 * @returns {{ success: boolean, cancelled?: boolean, subscription?: object, error?: string, code?: string }}
 */
export async function payCarRentalListingWithPayPal() {
  const r = await payWithPayPalOrders({
    createFunctionName: 'createCarRentalListingOrder',
    captureFunctionName: 'captureCarRentalListingOrder',
    returnPath: 'listing-paypal-return',
    cancelPath: 'listing-paypal-cancel',
  });
  if (r.success && r.raw) {
    return { success: true, subscription: r.raw.subscription };
  }
  return {
    success: false,
    cancelled: r.cancelled,
    error: r.error,
    code: r.code,
  };
}

/**
 * If PayPal Cloud Functions are not configured, extend listing locally (dev / fallback only).
 */
export async function payCarRentalListingFallback(uid, userProfile) {
  if (!uid) throw new Error('Not signed in');
  const n = countRentalVehiclesForBilling(userProfile);
  const nextSub = buildRenewedRentalListingSubscription(userProfile?.rentalListingSubscription, n);
  await updateUserProfile(uid, { rentalListingSubscription: nextSub });
  return nextSub;
}
