/**
 * Vendor premium via PayPal Orders (amount + plan from server on create).
 */
import { updateUserProfile } from './authService';
import { payWithPayPalOrders } from './appPayPalOrderService';

/**
 * @returns {Promise<{ success: boolean, cancelled?: boolean, vendorSubscription?: object, error?: string, code?: string }>}
 */
export async function payVendorSubscriptionWithPayPal(planId) {
  const r = await payWithPayPalOrders({
    createFunctionName: 'createVendorSubscriptionOrder',
    captureFunctionName: 'captureVendorSubscriptionOrder',
    returnPath: 'vendor-paypal-return',
    cancelPath: 'vendor-paypal-cancel',
    createExtra: { planId },
  });
  if (r.success && r.raw) {
    return { success: true, vendorSubscription: r.raw.vendorSubscription };
  }
  return {
    success: false,
    cancelled: r.cancelled,
    error: r.error,
    code: r.code,
  };
}

/** Dev-only: extend vendor subscription without PayPal. */
export async function payVendorSubscriptionFallback(uid, plan) {
  if (!uid) throw new Error('Not signed in');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (plan?.duration || 7));
  const newSub = {
    planId: plan.id,
    planLabel: plan.label,
    price: plan.price,
    expiresAt: expiresAt.toISOString(),
    status: 'active',
    paymentMethod: 'dev_fallback',
  };
  await updateUserProfile(uid, { vendorSubscription: newSub });
  return newSub;
}
