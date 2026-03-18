# Firebase Security Rules

This document outlines the Firestore and Realtime Database rules for Armada.

## Firestore Rules (`firestore.rules`)

### `users/{userId}`
- **Read**: Own document or admin
- **Write**: Own document only (profile updates)

### `rides/{rideId}`
- **Create**: Any authenticated user (riders create rides)
- **Read**: Admin, or rider/driver of the ride, or status is `bidding` (so drivers can see open bids)
- **Update**: Rider or driver only

### `rides/{rideId}/bids/{bidId}` (subcollection)
- **Read**: Any authenticated user
- **Create**: Any authenticated user (drivers add bids; riders add counter offers with `riderCounter: true`)
- **Update/Delete**: Denied (bids are immutable)

### `corporateShifts/{shiftId}`
- **Read**: Any authenticated user
- **Create**: Any authenticated user
- **Update**: Company (owner) or driver who is assigned, or driver accepting an `open` shift (setting `driverId`)
- **Delete**: Company only

### `earnings/{id}`
- **Read**: Driver (own) or admin
- **Write**: Denied (written by Cloud Functions or backend)

### `food_orders/{orderId}`
- **Read**: Any authenticated user
- **Create**: Any authenticated user
- **Update**: Vendor matching `vendorId` in user profile

### `emergency_calls/{callId}`
- **Read**: Admin or caller/callee
- **Create**: Any authenticated user
- **Update**: Caller or callee

### `announcements/{id}`
- **Read**: Any authenticated user
- **Write**: Denied (admin-only via console/Functions)

### `users/{userId}/vehicles/{vehicleId}` (subcollection)
- **Read/Write**: Driver (own vehicles only)

## Storage Rules (`storage.rules`)

### `vehicles/{driverId}/{fileName}`
- **Read**: Any authenticated user
- **Write**: Driver only (own folder), max 5MB, images only

## Realtime Database Rules (`database.rules`)

Used for `locations/drivers/{driverId}`:
- **Write**: Driver updates own location
- **Read**: Rider or app services for real-time driver tracking

## Deploy

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only database
```
