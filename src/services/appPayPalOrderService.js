/**
 * Shared PayPal Orders flow: callable create → in-app browser → callable capture.
 * Product-specific callables set amount on the server; client only passes return URLs + product args.
 */
import * as WebBrowser from 'expo-web-browser';
import { httpsCallable } from 'firebase/functions';
import { functions, isFirebaseReady } from '../config/firebase';
import { createPayPalAppReturnUrl, parsePayPalReturnOrderId } from '../utils/paypalAppLinks';

export { parsePayPalReturnOrderId };

/**
 * @param {object} opts
 * @param {string} opts.createFunctionName - HTTPS callable name
 * @param {string} opts.captureFunctionName
 * @param {string} [opts.returnPath] - Linking.createURL path segment
 * @param {string} [opts.cancelPath]
 * @param {Record<string, unknown>} [opts.createExtra] - e.g. { planId } (merged after returnUrl/cancelUrl)
 * @returns {Promise<{ success: boolean, cancelled?: boolean, raw?: object, error?: string, code?: string }>}
 */
export async function payWithPayPalOrders({
  createFunctionName,
  captureFunctionName,
  returnPath = 'app-paypal-return',
  cancelPath = 'app-paypal-cancel',
  createExtra = {},
}) {
  if (!isFirebaseReady || !functions) {
    return { success: false, error: 'Firebase not configured' };
  }

  const returnUrl = createPayPalAppReturnUrl(returnPath);
  const cancelUrl = createPayPalAppReturnUrl(cancelPath);

  let createRes;
  try {
    const createFn = httpsCallable(functions, createFunctionName);
    const { data } = await createFn({ returnUrl, cancelUrl, ...createExtra });
    createRes = data;
  } catch (e) {
    return { success: false, error: e.message || String(e), code: e.code };
  }

  const { orderId, approvalUrl } = createRes || {};
  if (!approvalUrl) {
    return { success: false, error: createRes?.message || 'No PayPal approval URL' };
  }

  const result = await WebBrowser.openAuthSessionAsync(approvalUrl, returnUrl);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { success: false, cancelled: true };
  }

  if (result.type !== 'success' || !result.url) {
    return { success: false, error: 'Payment window closed' };
  }

  const capturedOrderId = parsePayPalReturnOrderId(result.url) || orderId;
  if (!capturedOrderId) {
    return { success: false, error: 'Could not read payment result' };
  }

  try {
    const captureFn = httpsCallable(functions, captureFunctionName);
    const { data: capData } = await captureFn({ orderId: capturedOrderId });
    if (capData?.success) {
      return { success: true, raw: capData };
    }
    return { success: false, error: capData?.message || 'Capture failed' };
  } catch (e) {
    return { success: false, error: e.message || 'Capture failed', code: e.code };
  }
}
