# PayPal Setup for Armada

## 1. Create PayPal Developer Account

1. Go to [developer.paypal.com](https://developer.paypal.com)
2. Sign in or create an account
3. Go to **Dashboard** → **My Apps & Credentials**

## 2. Create App & Get Client ID (Live)

Production Armada uses **PayPal Live** (real payments).

1. Under **REST API apps**, click **Create App**
2. Name it (e.g. "Armada")
3. Select **Live** and copy the **Live Client ID**
4. For native Pay Now, create a **Live** payment link in the PayPal dashboard

## 3. Add to .env

```env
EXPO_PUBLIC_PAYPAL_CLIENT_ID=your_live_client_id
EXPO_PUBLIC_PAYPAL_PAYMENT_LINK=https://www.paypal.com/ncp/payment/...
```

Match **Firebase Functions** to the same Live app:

`firebase functions:config:set paypal.client_id="..." paypal.client_secret="..."` then `firebase deploy --only functions`.

Restart the dev server after changing `.env`.

## 4. Currency (JMD)

PayPal may not support JMD in all regions. If you get currency errors:

- Use **USD** instead: change `currency="USD"` in `PayPalButton.web.js`
- Or convert JMD to USD before creating the order

## 5. Guest Checkout

Guest checkout (debit/credit without PayPal account) is enabled by default in the PayPal button. Ensure your PayPal Business account has it enabled in the dashboard.

## 6. Web Only

`react-paypal-js` requires a browser. PayPal works when you run:

```bash
npm run web
```

On iOS/Android (Expo Go), the PayPal option shows "PayPal available on web". Users can complete payment by opening the app in a browser.

## 7. Production: Backend Capture (Recommended)

For production, create orders and capture on your server:

1. Backend creates order via PayPal Orders API v2
2. Frontend approves with order ID
3. Backend captures payment
4. Withdraw to Jamaican bank via PayPal Payouts API

This keeps your API credentials secure and allows server-side validation.
