# Armada – End-to-End Test Checklist

Run through these flows before launch. Use a dev build (not Expo Go) for full features.

---

## 1. Ride Flow (Cash)

- [ ] **Rider:** Sign in (OTP or demo)
- [ ] **Rider:** Set pickup and dropoff on map
- [ ] **Rider:** Request ride, enter bid price
- [ ] **Driver:** Sign in, go online
- [ ] **Driver:** See bidding ride, place bid
- [ ] **Rider:** See driver bid(s), accept one
- [ ] **Rider:** See active ride, driver on map
- [ ] **Driver:** See active ride, navigate
- [ ] **Driver:** Mark ride complete
- [ ] **Rider:** Pay cash, confirm
- [ ] **Both:** See receipt / ride history

---

## 2. Ride Flow (Card / PayPal)

- [ ] **Rider:** Request ride, accept bid (same as above)
- [ ] **Rider:** At payment, choose card
- [ ] **Rider:** Complete PayPal flow (Live = real money; use small test amounts if needed)
- [ ] **Rider:** See confirmation
- [ ] **Driver:** See earnings updated

---

## 3. Emergency SOS

- [ ] **Rider:** Add emergency contact in profile
- [ ] **Rider:** During ride, tap Emergency
- [ ] **Rider:** Confirm SOS sent
- [ ] **Contact:** Receive SMS/link with location (if configured)

---

## 4. Food Stop

- [ ] **Rider:** Request ride, add food stop (vendor near route)
- [ ] **Rider:** Confirm vendor, items, extra fee
- [ ] **Rider:** Complete ride request
- [ ] **Vendor:** Receive order notification (if push enabled)
- [ ] **Driver:** See food stop in ride details
- [ ] **Driver:** Complete ride with stop

---

## 5. Chat

- [ ] **Rider:** During active ride, open chat
- [ ] **Rider:** Send message
- [ ] **Driver:** See message, reply
- [ ] **Both:** Messages appear in real time

---

## 6. Push Notifications

- [ ] **Driver:** Receive push when new bid appears
- [ ] **Rider:** Receive push when bid accepted
- [ ] **Rider:** Receive push when driver arriving (if implemented)

---

## 7. Edge Cases

- [ ] Cancel ride (rider) – refund / no charge
- [ ] Cancel ride (driver) – rider can re-request
- [ ] Offline – cached routes / graceful error
- [ ] Demo mode – full flow without OTP

---

## Notes

- Use **two devices** (or one device + emulator) for rider/driver flows
- For PayPal Live, test charges are real; use minimal amounts or a dedicated test card flow per PayPal’s docs
- Emergency SMS requires real phone numbers and Twilio/Firebase config
