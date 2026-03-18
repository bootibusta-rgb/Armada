# Armada 🇯🇲

A Jamaica-focused ride-sharing MVP with bid-your-price (inDrive-style), cash-first payments, and Corporate mode for companies like KFC to book late-night staff rides.

Built with **React Native (Expo)**, **Firebase**, **Google Maps**, and **PayPal** for card payments.

---

## Features

### Rider
- **Home**: Google Maps, pickup/dropoff autocomplete, bid-your-price (J$), Request Ride
- **Bidding**: Real-time nearby drivers list – accept/counter/reject via chat
- **Active ride**: Live tracking, ETA, share location, emergency SOS button
- **Payment**: Cash (pay driver) or card (PayPal auto-charge)
- **Extras**: Voice bidding (mic → speech-to-text), group fare split (2–5), Armada Coins loyalty

### Driver
- **Dashboard**: Incoming bids – accept/counter/reject, real-time map
- **Earnings**: Daily/weekly view, take-home after 20% platform cut
- **Gold Tier**: J$200/day for priority on corporate shifts
- **Corporate gigs**: Auto-notify for booked shifts (e.g. 11PM–2AM, 5 rides @ J$800)

### Corporate
- **Set shift**: Time range, # of rides, J$ per ride
- **Monthly sub**: J$50k/month (fake payment for demo)
- **Dashboard**: Assigned drivers, ride logs, cost savings vs taxi

---

## Quick Start (Demo Mode)

1. **Install dependencies**
   ```bash
   cd h:\Armada
   npm install
   ```

2. **Start the app**
   ```bash
   npx expo start
   ```

3. **Run on device/simulator**
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Or scan QR code with Expo Go app

4. **Demo flow**
   - On Phone Auth screen: tap **"Demo Mode (skip OTP)"**
   - On OTP screen: tap **"Skip (Demo)"**
   - Choose **Rider**, **Driver**, or **Corporate**
   - Explore screens with fake data (3 drivers, 1 corporate shift)

---

## Full Setup (Production)

### 1. Firebase

1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Authentication** → Phone
3. Create **Firestore** database
4. Create **Realtime Database**
5. Copy config to `src/config/firebase.js`:

   ```js
   const firebaseConfig = {
     apiKey: 'YOUR_API_KEY',
     authDomain: 'YOUR_PROJECT.firebaseapp.com',
     projectId: 'YOUR_PROJECT_ID',
     storageBucket: 'YOUR_PROJECT.appspot.com',
     messagingSenderId: 'YOUR_SENDER_ID',
     appId: 'YOUR_APP_ID',
     databaseURL: 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
   };
   ```

6. Deploy Firestore rules: `firebase deploy --only firestore`
7. Deploy Realtime DB rules: `firebase deploy --only database`

### 2. Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

### 3. Google Maps

1. Get API keys from [Google Cloud Console](https://console.cloud.google.com)
2. Enable Maps SDK for iOS and Android
3. Add to `app.json`:
   - `ios.config.googleMapsApiKey`
   - `android.config.googleMaps.apiKey`

### 4. PayPal

- Integrate PayPal SDK server-side in Cloud Functions
- Use `chargeCard` in `src/services/paymentService.js` to call your Cloud Function

---

## Project Structure

```
h:\Armada\
├── App.js                 # Entry, AuthProvider, RootNavigator
├── app.json               # Expo config
├── package.json
├── assets/                # Icons, splash
├── src/
│   ├── config/
│   │   ├── firebase.js
│   │   └── theme.js
│   ├── context/
│   │   └── AuthContext.js
│   ├── navigation/
│   │   ├── RootNavigator.js
│   │   ├── AuthNavigator.js
│   │   ├── MainNavigator.js
│   │   ├── RiderTabs.js
│   │   ├── DriverTabs.js
│   │   └── CorporateTabs.js
│   ├── screens/
│   │   ├── auth/          # PhoneAuth, OTP, RoleSelect
│   │   ├── rider/         # Home, Bidding, ActiveRide, Payment, ArmadaCoins
│   │   ├── driver/        # Dashboard, Earnings, GoldTier, CorporateGigs
│   │   └── corporate/     # Dashboard, Shifts, Subscription
│   ├── components/       # VoiceBiddingButton, OfflineBanner, EmergencyButton
│   ├── services/         # auth, ride, chat, payment, corporate, earnings, iriCoins
│   └── hooks/            # useOfflineQueue
├── functions/             # Cloud Functions
├── firestore.rules
└── database.rules.json
```

---

## Firestore Collections

| Collection         | Purpose                          |
|--------------------|----------------------------------|
| `users`            | role, rating, irieCoins          |
| `rides`            | status, bid history, finalFare   |
| `rides/{id}/bids`  | driver bids per ride             |
| `corporateShifts`  | company shifts                    |
| `earnings`         | driver earnings (Cloud Function)  |

---

## Realtime Database

- `locations/drivers/{driverId}` – live driver location
- `chats/{rideId}/messages` – ride chat

---

## UI Theme

- **Primary**: Green (#1B5E20) – inDrive-style
- **Secondary**: Yellow (#FFD54F) – Jamaican accent
- **Armada** branding, reggae-inspired icons

---

## Offline Mode

- `useOfflineQueue` hook caches ride requests when offline
- Maps/routes cached via React Native Maps
- Requests queued and synced when back online

---

## License

MIT
