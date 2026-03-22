# PayPal SDK Setup for Armada

This guide covers setting up PayPal for the payment screen (web). The flow uses the PayPal JavaScript SDK with fixed amounts and supports guest checkout (debit/credit card without a PayPal account).

## Requirements

- Rider and driver agree on exact fare (e.g., 1000 JMD) before payment
- Amount must match exactly—no partial payments
- Fixed amount in PayPal checkout (user cannot edit)
- Guest checkout (card without PayPal account)

## Setup Steps

### 1. Create a PayPal Developer Account

1. Go to [developer.paypal.com](https://developer.paypal.com)
2. Log in with your PayPal account (or create one)
3. Go to **Dashboard** → **My Apps & Credentials**

### 2. Create an App and Get Client ID (Live)

Armada is configured for **PayPal Live** (real payments). Use credentials from the **Live** environment only.

1. Under **REST API apps**, click **Create App**
2. Name it (e.g., "Armada Ride Share")
3. Toggle **Live** (not Sandbox) and copy the **Live Client ID** into `.env` as `EXPO_PUBLIC_PAYPAL_CLIENT_ID`
4. For **Pay Now** links on native, use a button/link created under your **Live** business account

### 3. Configure .env

```env
EXPO_PUBLIC_PAYPAL_CLIENT_ID=your_live_client_id
EXPO_PUBLIC_PAYPAL_PAYMENT_LINK=https://www.paypal.com/ncp/payment/...   # Live Pay Now link
```

**Cloud Functions (required for server verification):** use the **same Live app**’s secret:

```bash
firebase functions:config:set paypal.client_id="YOUR_LIVE_CLIENT_ID" paypal.client_secret="YOUR_LIVE_SECRET"
firebase deploy --only functions
```

`verifyPayPalCapture` calls **live** PayPal APIs (`api-m.paypal.com`). Sandbox secrets will fail verification.

Optional **Sandbox** (local testing only): use Sandbox Client ID in a separate dev `.env` and Sandbox Function config — never mix Sandbox client with Live secret or vice versa.

### 4. Enable Guest Checkout (Optional)

Guest checkout (Pay with Debit or Credit Card) is enabled by default for most PayPal business accounts. If you don't see it:

1. Log in to [paypal.com](https://paypal.com) → **Settings** → **Payments**
2. Ensure **Website Payments** is enabled
3. Contact PayPal if guest checkout is not available in your region

### 5. JMD Currency

Jamaican Dollar (JMD) is supported. Ensure your PayPal account can receive JMD, or PayPal will convert at their rate.

## Flow Summary

1. **Agreement**: Rider and driver agree on fare (e.g., 1000 JMD) in the app
2. **Payment screen**: Shows "Fare: 1000 JMD"
3. **Amount confirmation**: Rider enters the amount in a text field
4. **Validation**: "Pay with PayPal" is disabled until the amount exactly matches
5. **Checkout**: PayPal SDK opens with fixed amount (no editable field)
6. **Success**: Payment captured, confirmation shown, ride complete
7. **Withdrawal**: Withdraw to Jamaican bank from PayPal dashboard later

## Testing

1. Use **Sandbox** Client ID for testing
2. Create test accounts: [Sandbox Accounts](https://developer.paypal.com/dashboard/accounts)
3. Use test card numbers: [Card Testing](https://developer.paypal.com/tools/sandbox/card-testing/)
4. Run web: `npm run web`

## Native (iOS/Android)

The PayPal SDK is web-only in this setup. On native, the app uses a Pay Now link (`EXPO_PUBLIC_PAYPAL_PAYMENT_LINK`) that opens in the browser. For full SDK on native, you would need a different approach (e.g., WebView or PayPal native SDK).

## Error Handling

- **PayPal not configured**: Add `EXPO_PUBLIC_PAYPAL_CLIENT_ID` to `.env`
- **Payment failed**: Check console for details; ensure Client ID is correct
- **Amount mismatch**: Rider must enter the exact agreed fare to enable the button
