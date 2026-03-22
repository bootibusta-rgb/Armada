# Firebase Security Rules

This document outlines the Firestore and Realtime Database rules for Armada.

## Firestore Rules (`firestore.rules`)

### `users/{userId}`
- **Read**: Any authenticated user (names/ratings in ride flow)
- **Write**: Owner **or admin** (`admin == true` or `role == 'admin'`) — admins can edit profiles from the Admin dashboard

### Admin access (`isAdmin()`)
Admins are users with `users/{uid}.admin == true` **or** `role == 'admin'`. They can:
- **Read/write** any `users/{userId}` and subcollection `users/{userId}/vehicles/{vehicleId}`
- **Read** all `rides` and `rides/{rideId}/bids`
- **Update** any `rides/{rideId}` (status, fare, etc.)
- **Update** any `food_orders/{orderId}`
- **Update** any `emergency_calls/{callId}`
- **Update/delete** `corporateShifts` (full moderation)
- **Read** all `earnings` (existing rule)

Set the first admin in Firebase Console → Firestore → `users/{yourUid}` → add field `admin` (boolean) `true`.

### `rides/{rideId}`
- **Create**: Any authenticated user (riders create rides)
- **Read**: Admin, or rider/driver of the ride, or status is `bidding` (so drivers can see open bids)
- **Update**: Rider, driver, **or admin**

### `rides/{rideId}/bids/{bidId}` (subcollection)
- **Read**: Rider, driver, bidding drivers, **or admin**
- **Create**: Any authenticated user (drivers add bids; riders add counter offers with `riderCounter: true`)
- **Update/Delete**: Denied (bids are immutable)

### `corporateShifts/{shiftId}`
- **Read**: Any authenticated user
- **Create**: Any authenticated user
- **Update**: Company, assigned driver, open-shift acceptance, **or admin**
- **Delete**: Company **or admin**

### `earnings/{id}`
- **Read**: Driver (own) or admin
- **Write**: Denied (written by Cloud Functions or backend)

### `food_orders/{orderId}`
- **Read**: Any authenticated user
- **Create**: Any authenticated user
- **Update**: Vendor matching `vendorId` in user profile **or admin**

### `emergency_calls/{callId}`
- **Read**: Admin or caller/callee
- **Create**: Any authenticated user
- **Update**: Caller, callee, **or admin**

### `announcements/{id}`
- **Read**: Any authenticated user
- **Write**: Denied (admin-only via console/Functions)

### `users/{userId}/vehicles/{vehicleId}` (subcollection)
- **Read/Write**: Driver (own) **or admin**

## Storage Rules (`storage.rules`)

### `vehicles/{driverId}/{fileName}`
- **Read**: Any authenticated user
- **Write**: Driver only (own folder), max 5MB, images only

### `id_verification/{userId}/{fileName}`
- **Read**: Owner **or admin** (Storage rules call Firestore to verify `admin` / `role`)
- **Write**: Owner only, max 5MB, images only  
  Used at signup for a photo of the selected ID type. Admins open the URL from the user profile in the Admin app (same Firebase Auth session).

**Deploy Storage after changing rules:** `firebase deploy --only storage`

## Realtime Database Rules (`database.rules`)

### `locations/drivers/{driverId}`
- **Write**: Driver only (`auth.uid == $driverId`)
- **Read**: Any authenticated user (riders need driver location during active ride)

### `chats/{rideId}`
- **`_participants`**: Stores riderId/driverId when ride is accepted (written by rideService)
- **`messages`**: Read/write only if `auth.uid` is rider or driver of that ride

## Deploy

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only database
```
