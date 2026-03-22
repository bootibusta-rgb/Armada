/**
 * Armada Firebase Cloud Functions
 * - verifyPayPalCapture: Server-side verification of PayPal capture before marking ride complete
 * - onBidCreate: Push notification to rider when driver bids
 * - onRideAccepted: Push notification to rider when ride is accepted
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const Expo = require('expo-server-sdk');

admin.initializeApp();

const expo = new Expo.Expo();

/**
 * Verify PayPal capture server-side and mark ride complete.
 * Call from client after PayPal SDK reports success.
 * Requires LIVE paypal.client_id and paypal.client_secret (functions config).
 * Uses https://api-m.paypal.com (production). Sandbox credentials will not verify live captures.
 */
exports.verifyPayPalCapture = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const { rideId, captureId, amount, currency } = data;
  if (!rideId || !captureId || !amount) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing rideId, captureId, or amount');
  }
  const clientId = functions.config().paypal?.client_id;
  const clientSecret = functions.config().paypal?.client_secret;
  const allowUnverified =
    functions.config().paypal?.allow_unverified === 'true' ||
    functions.config().paypal?.allow_unverified === true;
  if (!clientId || !clientSecret) {
    if (!allowUnverified) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'PayPal is not configured. Set paypal.client_id and paypal.client_secret, or for emulator-only testing set paypal.allow_unverified=true'
      );
    }
    console.warn('PayPal config missing - unverified completion (allow_unverified)');
    await admin.firestore().collection('rides').doc(rideId).update({
      status: 'completed',
      paymentMethod: 'card',
      paidAmount: amount,
      paypalTransactionId: captureId,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, verified: false };
  }
  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const authRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: 'grant_type=client_credentials',
    });
    const authJson = await authRes.json();
    const token = authJson.access_token;
    if (!token) throw new Error('PayPal auth failed');
    const verifyRes = await fetch(`https://api-m.paypal.com/v2/payments/captures/${captureId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const capture = await verifyRes.json();
    const status = capture.status;
    const captureAmount = capture.amount?.value;
    if (status !== 'COMPLETED') {
      throw new functions.https.HttpsError('failed-precondition', `Capture not completed: ${status}`);
    }
    if (Math.abs(parseFloat(captureAmount) - parseFloat(amount)) > 0.01) {
      throw new functions.https.HttpsError('invalid-argument', 'Amount mismatch');
    }
    await admin.firestore().collection('rides').doc(rideId).update({
      status: 'completed',
      paymentMethod: 'card',
      paidAmount: amount,
      paypalTransactionId: captureId,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, verified: true };
  } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error('PayPal verification error:', e);
    throw new functions.https.HttpsError('internal', e.message || 'Verification failed');
  }
});

/**
 * For React Native Firebase (phone auth): sync auth to Firebase JS SDK.
 * Client passes idToken from RNFB user; we return a custom token for signInWithCustomToken.
 */
exports.getCustomToken = functions.https.onCall(async (data) => {
  const { idToken } = data;
  if (!idToken || typeof idToken !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing idToken');
  }
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const customToken = await admin.auth().createCustomToken(decoded.uid);
    return { customToken };
  } catch (e) {
    console.warn('getCustomToken error:', e.message);
    throw new functions.https.HttpsError('unauthenticated', 'Invalid token');
  }
});

// --- Car rental listing fee (PayPal Orders API, dynamic amount) ---
const LISTING_FEE_PER_VEHICLE_JMD = 1500;
const LISTING_WEEK_DAYS = 7;

function paypalApiBase() {
  const sandbox =
    functions.config().paypal?.sandbox === 'true' || functions.config().paypal?.sandbox === true;
  return sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

async function paypalAccessToken() {
  const clientId = functions.config().paypal?.client_id;
  const clientSecret = functions.config().paypal?.client_secret;
  if (!clientId || !clientSecret) return null;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const authRes = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: 'grant_type=client_credentials',
  });
  const j = await authRes.json();
  return j.access_token || null;
}

function countRentalVehicles(userData) {
  const alts = Array.isArray(userData.rentalAlternateVehicles) ? userData.rentalAlternateVehicles : [];
  return 1 + alts.length;
}

function nextListingSubscription(existing, vehicleCount, extras = {}) {
  const n = Math.max(1, Math.min(50, parseInt(String(vehicleCount), 10) || 1));
  const now = new Date();
  const prevEx = existing?.expiresAt ? new Date(existing.expiresAt) : null;
  const startFrom = prevEx && prevEx > now ? prevEx : now;
  const next = new Date(startFrom);
  next.setDate(next.getDate() + LISTING_WEEK_DAYS);
  const amount = n * LISTING_FEE_PER_VEHICLE_JMD;
  return {
    expiresAt: next.toISOString(),
    weeklyRatePerVehicleJmd: LISTING_FEE_PER_VEHICLE_JMD,
    vehicleCountBilled: n,
    amountPaidJmd: amount,
    periodDays: LISTING_WEEK_DAYS,
    status: 'active',
    updatedAt: now.toISOString(),
    paymentMethod: 'paypal',
    ...extras,
  };
}

function validateListingPayPalRedirectUrl(url) {
  if (!url || typeof url !== 'string' || url.length > 1024) return false;
  return (
    url.startsWith('armada://') ||
    url.startsWith('exp://') ||
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('armada.app')
  );
}

/** PayPal returns 422 / UNPROCESSABLE_ENTITY when capture is replayed after success. */
function isPayPalOrderAlreadyCapturedResponse(capRes, capJson) {
  if (capRes.status === 422) return true;
  const name = String(capJson?.name || '').toUpperCase();
  if (name === 'UNPROCESSABLE_ENTITY') {
    const details = Array.isArray(capJson?.details) ? capJson.details : [];
    for (const d of details) {
      const issue = String(d.issue || '').toUpperCase();
      if (
        issue === 'ORDER_ALREADY_CAPTURED' ||
        issue === 'ALREADY_CAPTURED' ||
        issue.includes('ORDER_ALREADY_CAPTURED')
      ) {
        return true;
      }
    }
  }
  const blob = JSON.stringify(capJson || {}).toUpperCase();
  return blob.includes('ORDER_ALREADY_CAPTURED') || blob.includes('ALREADY_CAPTURED');
}

async function paypalGetCheckoutOrder(orderId, token) {
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (!res.ok) {
    const err = new Error(j?.message || j?.details?.[0]?.description || 'Get order failed');
    err.paypalJson = j;
    throw err;
  }
  return j;
}

function getFirstCompletedCaptureFromOrder(orderJson) {
  const pu = orderJson?.purchase_units?.[0];
  const captures = pu?.payments?.captures || [];
  const completed = captures.filter((c) => c && c.status === 'COMPLETED');
  if (completed.length === 0) return null;
  return completed[completed.length - 1];
}

/**
 * Validate capture against pending session; idempotent user update via transaction.
 * @param {string} orderCollection Firestore collection for pending orders
 * @param {{ alreadyCaptured: (userData: object) => object, apply: (userData, pending, capture, orderId) => { userUpdates: object, response: object } }} handlers
 */
async function syncPayPalOrderToUser(orderCollection, orderId, uid, pending, capture, handlers) {
  const capVal = parseFloat(capture.amount.value);
  const capCur = capture.amount.currency_code;
  if (capCur !== pending.expectedCurrency) {
    throw new functions.https.HttpsError('failed-precondition', 'Currency mismatch');
  }
  if (capVal + 0.02 < pending.expectedAmount) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Paid amount too low (expected at least ${pending.expectedAmount} ${pending.expectedCurrency})`
    );
  }

  const orderRef = admin.firestore().collection(orderCollection).doc(orderId);
  const userRef = admin.firestore().collection('users').doc(uid);

  return admin.firestore().runTransaction(async (tx) => {
    const pendingSnap = await tx.get(orderRef);
    const p = pendingSnap.data();
    if (!p || p.uid !== uid) {
      throw new functions.https.HttpsError('permission-denied', 'Invalid payment session');
    }
    if (p.status === 'captured') {
      const userSnap = await tx.get(userRef);
      return { success: true, alreadyCaptured: true, ...handlers.alreadyCaptured(userSnap.data() || {}) };
    }
    const userSnap = await tx.get(userRef);
    const { userUpdates, response } = handlers.apply(userSnap.data() || {}, p, capture, orderId);
    tx.update(userRef, {
      ...userUpdates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(orderRef, {
      status: 'captured',
      captureId: capture.id,
      capturedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, alreadyCaptured: false, ...response };
  });
}

const LISTING_ORDER_COLLECTION = 'car_rental_listing_paypal_orders';

function syncListingSubscriptionFromPayPalCapture(orderId, uid, pending, capture) {
  return syncPayPalOrderToUser(LISTING_ORDER_COLLECTION, orderId, uid, pending, capture, {
    alreadyCaptured: (userData) => ({ subscription: userData.rentalListingSubscription }),
    apply: (userData, p, cap, oid) => {
      const existingSub = userData.rentalListingSubscription;
      const newSub = nextListingSubscription(existingSub, p.vehicleCount, {
        paypalOrderId: oid,
        paypalCaptureId: cap.id,
      });
      return {
        userUpdates: { rentalListingSubscription: newSub },
        response: { subscription: newSub },
      };
    },
  });
}

/** Server-side vendor plan prices (must match app config/vendorPricing.js). */
const VENDOR_PLAN_BY_ID = {
  '1week': { durationDays: 7, priceJmd: 1000, label: '1 Week' },
  '2weeks': { durationDays: 14, priceJmd: 1800, label: '2 Weeks' },
  '1month': { durationDays: 30, priceJmd: 3500, label: '1 Month' },
  '3months': { durationDays: 90, priceJmd: 9000, label: '3 Months' },
  '1year': { durationDays: 365, priceJmd: 30000, label: '1 Year' },
};

const VENDOR_ORDER_COLLECTION = 'vendor_subscription_paypal_orders';

function nextVendorSubscription(existingSub, pending, capture, orderId) {
  const now = new Date();
  const prevEx = existingSub?.expiresAt ? new Date(existingSub.expiresAt) : null;
  const startFrom = prevEx && prevEx > now ? prevEx : now;
  const next = new Date(startFrom);
  next.setDate(next.getDate() + pending.durationDays);
  return {
    planId: pending.planId,
    planLabel: pending.planLabel,
    price: pending.expectedAmount,
    expiresAt: next.toISOString(),
    status: 'active',
    updatedAt: now.toISOString(),
    paymentMethod: 'paypal',
    paypalOrderId: orderId,
    paypalCaptureId: capture.id,
  };
}

function syncVendorSubscriptionFromPayPalCapture(orderId, uid, pending, capture) {
  return syncPayPalOrderToUser(VENDOR_ORDER_COLLECTION, orderId, uid, pending, capture, {
    alreadyCaptured: (userData) => ({ vendorSubscription: userData.vendorSubscription }),
    apply: (userData, p, cap, oid) => {
      const newSub = nextVendorSubscription(userData.vendorSubscription, p, cap, oid);
      return {
        userUpdates: { vendorSubscription: newSub },
        response: { vendorSubscription: newSub },
      };
    },
  });
}

/**
 * POST capture; on ALREADY_CAPTURED / 422, GET order and return completed capture.
 */
async function paypalExecuteCaptureWithRecovery(orderId, token) {
  const capRes = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const capJson = await capRes.json();

  if (capRes.ok && capJson.status === 'COMPLETED') {
    const capture = getFirstCompletedCaptureFromOrder(capJson);
    if (!capture) {
      throw new functions.https.HttpsError('failed-precondition', 'No completed capture');
    }
    return capture;
  }

  if (isPayPalOrderAlreadyCapturedResponse(capRes, capJson)) {
    let refreshed;
    try {
      refreshed = await paypalGetCheckoutOrder(orderId, token);
    } catch (e) {
      console.error('PayPal GET order after already-captured capture', e);
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Payment may have succeeded but status could not be confirmed. Try again in a moment.'
      );
    }
    if (refreshed.status !== 'COMPLETED') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Order not complete: ${refreshed.status || 'unknown'}`
      );
    }
    const capture = getFirstCompletedCaptureFromOrder(refreshed);
    if (!capture) {
      throw new functions.https.HttpsError('failed-precondition', 'No completed capture on order');
    }
    return capture;
  }

  console.error('PayPal capture error', capJson);
  const detail = capJson?.details?.[0]?.description || capJson.message || 'Capture failed';
  throw new functions.https.HttpsError('failed-precondition', detail);
}

/**
 * Create PayPal order for 1 week × vehicle count × LISTING_FEE_PER_VEHICLE_JMD.
 * Client opens approvalUrl; return/cancel URLs must come from Linking.createURL (validated).
 */
exports.createCarRentalListingOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const uid = context.auth.uid;
  const returnUrl = data?.returnUrl;
  const cancelUrl = data?.cancelUrl;
  if (!validateListingPayPalRedirectUrl(returnUrl) || !validateListingPayPalRedirectUrl(cancelUrl)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid return or cancel URL (use app deep link from Linking.createURL)'
    );
  }

  const userSnap = await admin.firestore().collection('users').doc(uid).get();
  const user = userSnap.data();
  if (!user || user.role !== 'carRental') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Save your Car Rental profile first (role carRental)'
    );
  }

  const vehicleCount = countRentalVehicles(user);
  const amountJmd = vehicleCount * LISTING_FEE_PER_VEHICLE_JMD;
  const currency = (functions.config().paypal?.listing_currency || 'JMD').toUpperCase();

  const token = await paypalAccessToken();
  if (!token) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'PayPal is not configured (set paypal.client_id and paypal.client_secret)'
    );
  }

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'car_rental_listing_week',
        description: `Armada car rental listing — ${vehicleCount} vehicle(s), 1 week`,
        custom_id: `${uid}_${vehicleCount}_${Date.now()}`,
        amount: {
          currency_code: currency,
          value: amountJmd.toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: 'Armada',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(orderPayload),
  });
  const order = await res.json();
  if (!res.ok) {
    console.error('PayPal create order error', order);
    const detail = order?.details?.[0]?.description || order.message || 'PayPal order failed';
    throw new functions.https.HttpsError('failed-precondition', detail);
  }

  const orderId = order.id;
  const approvalUrl = order.links?.find((l) => l.rel === 'approve')?.href;
  if (!orderId || !approvalUrl) {
    throw new functions.https.HttpsError('internal', 'PayPal did not return an approval link');
  }

  await admin
    .firestore()
    .collection(LISTING_ORDER_COLLECTION)
    .doc(orderId)
    .set({
      uid,
      expectedAmount: amountJmd,
      expectedCurrency: currency,
      vehicleCount,
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return {
    orderId,
    approvalUrl,
    amountJmd,
    vehicleCount,
    currency,
  };
});

/**
 * Capture after buyer approves. Verifies amount/currency before extending rentalListingSubscription.
 */
exports.captureCarRentalListingOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const uid = context.auth.uid;
  const orderId = data?.orderId;
  if (!orderId || typeof orderId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing orderId');
  }

  const orderRef = admin.firestore().collection(LISTING_ORDER_COLLECTION).doc(orderId);
  const pendingSnap = await orderRef.get();
  if (!pendingSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Unknown or expired payment session');
  }
  const pending = pendingSnap.data();
  if (pending.uid !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your payment');
  }
  if (pending.status === 'captured') {
    const userSnap = await admin.firestore().collection('users').doc(uid).get();
    return { success: true, alreadyCaptured: true, subscription: userSnap.data()?.rentalListingSubscription };
  }

  const token = await paypalAccessToken();
  if (!token) {
    throw new functions.https.HttpsError('failed-precondition', 'PayPal not configured');
  }

  const capture = await paypalExecuteCaptureWithRecovery(orderId, token);
  return syncListingSubscriptionFromPayPalCapture(orderId, uid, pending, capture);
});

/**
 * Vendor premium: create PayPal order for selected plan (amount from server catalog).
 */
exports.createVendorSubscriptionOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const uid = context.auth.uid;
  const returnUrl = data?.returnUrl;
  const cancelUrl = data?.cancelUrl;
  const planId = typeof data?.planId === 'string' ? data.planId : '';
  if (!validateListingPayPalRedirectUrl(returnUrl) || !validateListingPayPalRedirectUrl(cancelUrl)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid return or cancel URL (use app deep link from Linking.createURL)'
    );
  }
  const plan = VENDOR_PLAN_BY_ID[planId];
  if (!plan) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid plan');
  }

  const userSnap = await admin.firestore().collection('users').doc(uid).get();
  const user = userSnap.data();
  if (!user || user.role !== 'vendor') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Save your Vendor profile first (role vendor)'
    );
  }

  const amountJmd = plan.priceJmd;
  const currency = (functions.config().paypal?.listing_currency || 'JMD').toUpperCase();

  const token = await paypalAccessToken();
  if (!token) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'PayPal is not configured (set paypal.client_id and paypal.client_secret)'
    );
  }

  const orderPayload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'vendor_premium',
        description: `Armada vendor premium — ${plan.label}`,
        custom_id: `${uid}_${planId}_${Date.now()}`,
        amount: {
          currency_code: currency,
          value: amountJmd.toFixed(2),
        },
      },
    ],
    application_context: {
      brand_name: 'Armada',
      landing_page: 'NO_PREFERENCE',
      user_action: 'PAY_NOW',
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(orderPayload),
  });
  const order = await res.json();
  if (!res.ok) {
    console.error('PayPal create vendor order error', order);
    const detail = order?.details?.[0]?.description || order.message || 'PayPal order failed';
    throw new functions.https.HttpsError('failed-precondition', detail);
  }

  const newOrderId = order.id;
  const approvalUrl = order.links?.find((l) => l.rel === 'approve')?.href;
  if (!newOrderId || !approvalUrl) {
    throw new functions.https.HttpsError('internal', 'PayPal did not return an approval link');
  }

  await admin
    .firestore()
    .collection(VENDOR_ORDER_COLLECTION)
    .doc(newOrderId)
    .set({
      uid,
      expectedAmount: amountJmd,
      expectedCurrency: currency,
      planId,
      planLabel: plan.label,
      durationDays: plan.durationDays,
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  return {
    orderId: newOrderId,
    approvalUrl,
    amountJmd,
    planId,
    currency,
  };
});

exports.captureVendorSubscriptionOrder = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const uid = context.auth.uid;
  const orderId = data?.orderId;
  if (!orderId || typeof orderId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'Missing orderId');
  }

  const orderRef = admin.firestore().collection(VENDOR_ORDER_COLLECTION).doc(orderId);
  const pendingSnap = await orderRef.get();
  if (!pendingSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Unknown or expired payment session');
  }
  const pending = pendingSnap.data();
  if (pending.uid !== uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your payment');
  }
  if (pending.status === 'captured') {
    const userSnap = await admin.firestore().collection('users').doc(uid).get();
    return { success: true, alreadyCaptured: true, vendorSubscription: userSnap.data()?.vendorSubscription };
  }

  const token = await paypalAccessToken();
  if (!token) {
    throw new functions.https.HttpsError('failed-precondition', 'PayPal not configured');
  }

  const capture = await paypalExecuteCaptureWithRecovery(orderId, token);
  return syncVendorSubscriptionFromPayPalCapture(orderId, uid, pending, capture);
});

/** Send Expo push notification */
async function sendExpoPush(token, title, body, data = {}) {
  if (!Expo.Expo.isExpoPushToken(token)) return;
  const messages = [{ to: token, sound: 'default', title, body, data }];
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    await expo.sendPushNotificationsAsync(chunk);
  }
}

/** On new bid: notify rider */
exports.onBidCreate = functions.firestore
  .document('rides/{rideId}/bids/{bidId}')
  .onCreate(async (snap, ctx) => {
    const bid = snap.data();
    if (bid.riderCounter) return;
    const rideId = ctx.params.rideId;
    const rideSnap = await admin.firestore().collection('rides').doc(rideId).get();
    const ride = rideSnap.data();
    const riderId = ride?.riderId;
    if (!riderId) return;
    const userSnap = await admin.firestore().collection('users').doc(riderId).get();
    const token = userSnap.data()?.pushToken;
    if (!token) return;
    const driverName = bid.driverName || 'A driver';
    const price = bid.price ?? bid.counterPrice ?? '—';
    await sendExpoPush(
      token,
      'New driver bid',
      `${driverName} bid J$${price} on your ride`,
      { rideId, type: 'bid' }
    );
  });

/** On ride accepted: notify rider */
exports.onRideUpdate = functions.firestore
  .document('rides/{rideId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data();
    const after = change.after.data();
    const rideId = ctx.params.rideId;

    if (before.status !== 'accepted' && after.status === 'accepted') {
      const riderId = after.riderId;
      if (!riderId) return;
      const userSnap = await admin.firestore().collection('users').doc(riderId).get();
      const token = userSnap.data()?.pushToken;
      if (!token) return;
      const driverName = after.driverName || 'Your driver';
      await sendExpoPush(
        token,
        'Ride accepted',
        `${driverName} is on the way!`,
        { rideId, type: 'accepted' }
      );
      return;
    }

    if (after.status === 'cancelled') {
      const riderId = after.riderId;
      if (!riderId) return;
      const userSnap = await admin.firestore().collection('users').doc(riderId).get();
      const token = userSnap.data()?.pushToken;
      if (!token) return;
      await sendExpoPush(
        token,
        'Ride cancelled',
        'Refund issued',
        { rideId, ride_id: rideId, type: 'cancelled' }
      );
    }
  });

/**
 * Driver calls this when approaching pickup. Use real ETA (e.g. 2 min), not generic "10 min".
 * Called from DriverActiveRideScreen when ETA to pickup is <= 5 min.
 */
exports.notifyDriverApproaching = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }
  const { rideId, etaMinutes } = data;
  if (!rideId || etaMinutes == null) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing rideId or etaMinutes');
  }
  const rideSnap = await admin.firestore().collection('rides').doc(rideId).get();
  const ride = rideSnap.data();
  if (!ride || ride.driverId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your ride');
  }
  if (ride.status !== 'accepted') return { ok: true };
  const riderId = ride.riderId;
  if (!riderId) return { ok: true };
  const userSnap = await admin.firestore().collection('users').doc(riderId).get();
  const token = userSnap.data()?.pushToken;
  if (!token) return { ok: true };
  const mins = Math.max(1, Math.round(etaMinutes));
  await sendExpoPush(
    token,
    'Driver arriving',
    `Your driver is ${mins} min away`,
    { rideId, type: 'approaching', etaMinutes: mins }
  );
  return { ok: true };
});

/** New car rental request → notify owner */
exports.onCarRentalRequestCreate = functions.firestore
  .document('car_rental_requests/{requestId}')
  .onCreate(async (snap) => {
    const r = snap.data();
    const ownerId = r.ownerId;
    if (!ownerId) return;
    const userSnap = await admin.firestore().collection('users').doc(ownerId).get();
    const token = userSnap.data()?.pushToken;
    if (!token) return;
    const vehicle = r.vehicleDisplayName || r.licensePlate || 'your vehicle';
    await sendExpoPush(
      token,
      'Rider interested',
      `Rider interested in your ${vehicle}`,
      { type: 'car_rental_request', requestId: snap.id }
    );
  });

/** Counter-offer or unavailable → notify rider */
exports.onCarRentalRequestUpdate = functions.firestore
  .document('car_rental_requests/{requestId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data();
    const after = change.after.data();
    const requestId = ctx.params.requestId;
    const riderId = after.riderId;
    if (!riderId) return;

    const bo = before.counterOffer;
    const ao = after.counterOffer;
    if (ao && ao.status === 'pending' && (!bo || bo.createdAt !== ao.createdAt)) {
      const userSnap = await admin.firestore().collection('users').doc(riderId).get();
      const token = userSnap.data()?.pushToken;
      if (!token) return;
      const orig = after.vehicleDisplayName || 'that car';
      await sendExpoPush(
        token,
        'Other car option',
        `Owner says ${orig} may be out—how about ${ao.vehicleLabel}?`,
        { type: 'car_rental_counter', requestId }
      );
      return;
    }

    if (after.status === 'unavailable' && before.status !== 'unavailable') {
      const userSnap = await admin.firestore().collection('users').doc(riderId).get();
      const token = userSnap.data()?.pushToken;
      if (!token) return;
      await sendExpoPush(
        token,
        'Car rental',
        after.riderVisibleMessage || 'Sorry, car taken—try another',
        { type: 'car_rental_unavailable', requestId }
      );
    }
  });

/** When a rider orders food from a vendor, notify the vendor */
exports.onFoodOrderCreate = functions.firestore
  .document('food_orders/{orderId}')
  .onCreate(async (snap, ctx) => {
    const order = snap.data();
    const vendorId = order?.vendorId;
    if (!vendorId) return;
    const userSnap = await admin.firestore().collection('users').doc(vendorId).get();
    const token = userSnap.data()?.pushToken;
    if (!token) return;
    const items = order?.items?.length || 0;
    const total = order?.itemsTotal || 0;
    await sendExpoPush(
      token,
      'New food order',
      `${items} item(s) • J$${total} – tap to view`,
      { orderId: snap.id, rideId: order?.rideId, type: 'food_order' }
    );
  });
