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
 * Requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in functions config.
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
  if (!clientId || !clientSecret) {
    // No PayPal config: trust client, mark complete (dev fallback)
    console.warn('PayPal config missing - marking ride complete without verification');
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
