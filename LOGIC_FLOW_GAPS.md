# Logic & Flow Gaps – Areas to Work On

Based on a review of the codebase, here are the main gaps in logic and flow.

---

## 1. **Driver Bidding (High Priority)**

**Location:** `src/screens/driver/DriverDashboardScreen.js`

**Issue:** Accept, Counter, and Reject only show `alert()`. They do not:
- Add bids to the ride’s `bids` collection (rider subscribes to bids)
- Update ride status when the driver accepts
- Persist counter offers

**Fix:** Wire `handleBid` to Firebase:
- **Accept** – Add a bid with `driverId`, `driverName`, `price: ride.bidPrice`, then rider can accept
- **Counter** – Show a text input for price, then call `addBid(rideId, { driverId, driverName, price, driverId: userProfile.id })`
- **Reject** – Optionally remove or mark the ride so the driver no longer sees it

---

## 2. **Driver Online Status (High Priority)**

**Location:** `src/screens/driver/DriverDashboardScreen.js`

**Issue:** The `isOnline` switch is local state only. `getNearbyDrivers` filters by `isOnline === true`, but that value is never written to Firebase.

**Fix:** When the driver toggles Online:
- Update the user document: `updateDoc(doc(db, 'users', driverId), { isOnline: value })`
- Ensure the user document has an `isOnline` field

---

## 3. **Driver Seeing Rider Counters (Medium Priority)**

**Location:** `src/screens/driver/DriverDashboardScreen.js`

**Issue:** When the rider sends a counter via `addBid`, the driver does not see it. The driver only sees `subscribeToBiddingRides` (list of rides). There is no subscription to bids for a specific ride.

**Fix:** When the driver focuses or taps a ride card:
- Subscribe to bids for that ride: `subscribeToBids(rideId, callback)`
- Show rider counters on the card (e.g. “Rider countered: J$1500”)

---

## 4. **Corporate Shifts – List Not Synced (Medium Priority)**

**Location:** `src/screens/corporate/ShiftsScreen.js`

**Issue:** After creating a shift, the list is updated locally. When Firebase succeeds, there is no `subscribeToShifts` to keep the list in sync.

**Fix:** Use `subscribeToShifts(companyId, setShifts)` in a `useEffect` instead of (or in addition to) local state.

---

## 5. **Corporate Dashboard – Demo Data Only (Medium Priority)**

**Location:** `src/screens/corporate/CorporateDashboardScreen.js`

**Issue:** Uses hardcoded `DEMO_STATS` for drivers, rides, cost savings.

**Fix:** Call `getCompanyRides`, `subscribeToShifts`, and any analytics services to compute real stats.

---

## 6. **Driver Earnings – Demo Fallback (Medium Priority)**

**Location:** `src/screens/driver/EarningsScreen.js`

**Issue:** When `getDriverEarnings` fails or returns no data, it falls back to `DEMO_EARNINGS` instead of showing a clear “No earnings yet” state.

**Fix:** Call `getDriverEarnings` and handle empty results (e.g. “Complete rides to see earnings”).

---

## 7. **Voice Bidding (Low Priority)**

**Location:** `src/components/VoiceBiddingButton.js`

**Issue:** Shows an alert and does not perform speech-to-text.

**Fix:** Integrate a speech API (e.g. Google Cloud Speech-to-Text, Expo Speech) to convert speech to a number and fill the bid field.

---

## 8. **Payment Screen – rideId for PayPal (Low Priority)**

**Location:** `src/screens/rider/PaymentScreen.js`

**Issue:** `processCardPayment` is called with `route.params?.rideId`. When coming from ActiveRide, `rideId` is passed; ensure it is always present for non-demo flows.

---

## 9. **Bidding When No Bids (Low Priority)**

**Location:** `src/screens/rider/BiddingScreen.js`

**Issue:** When there are no bids yet, `displayDrivers` falls back to `DEMO_DRIVERS` in production, which may be misleading.

**Fix:** Show an empty state (e.g. “Waiting for driver bids…”) instead of demo drivers when `bids.length === 0` and not in demo mode.

---

## 10. **Firebase Security Rules**

**Issue:** Firestore and Realtime Database rules need to be defined so that:
- Riders can read/write only their rides and bids
- Drivers can read rides in bidding and add bids
- Users can update their own `isOnline`
- Admin can read all data

---

## Priority Summary

| Priority  | Area               | Effort  |
|----------|--------------------|---------|
| High     | Driver bidding     | Medium  |
| High     | Driver online      | Low     |
| Medium   | Driver sees rider counters | Medium |
| Medium   | Shifts subscription | Low    |
| Medium   | Corporate dashboard | Medium |
| Medium   | Driver earnings    | Low     |
| Low      | Voice bidding      | High    |
| Low      | Empty bidding state | Low   |
| Low      | PayPal rideId      | Low     |

---

## Recommended Order

1. **Driver online status** – Small change, unblocks driver matching.
2. **Driver bidding** – Core flow; driver must be able to add bids and accept.
3. **Driver sees rider counters** – Completes the bidding loop.
4. **Bidding empty state** – Better UX when no drivers have bid yet.
5. **Corporate shifts subscription** – Keeps shifts in sync.
6. **Corporate dashboard & driver earnings** – Replace demo data with real data.
