# PayPal “app subscription” pattern (Armada)

Reusable flow for **listing fees**, **vendor premium**, and future products (driver daily fee, corporate plan, etc.):

1. **Cloud Functions**
   - `create*Order` — loads the user from Firestore, **computes amount on the server**, creates a PayPal v2 order, stores a **pending** doc in a dedicated collection (`*_paypal_orders`), returns `orderId` + `approvalUrl`.
   - `capture*Order` — captures (with **idempotent** handling for `ORDER_ALREADY_CAPTURED` / 422), verifies amount/currency against the pending doc, then **`syncPayPalOrderToUser`** in a **transaction** so the user is updated at most once per order.

2. **Client**
   - `payWithPayPalOrders()` in `src/services/appPayPalOrderService.js` — `createPayPalAppReturnUrl()` in `src/utils/paypalAppLinks.js` (uses `expo-constants`, not `expo-linking`) → callable create → `WebBrowser.openAuthSessionAsync` → callable capture.

3. **Adding a new product**
   - Copy the vendor or car-rental callable pair in `functions/index.js` (or split into a required module).
   - Add a Firestore pending collection name and a small `sync*FromPayPalCapture` that calls `syncPayPalOrderToUser(collection, ..., handlers)`.
   - Keep **plan/pricing tables on the server** (like `VENDOR_PLAN_BY_ID`) so the client cannot change the charged amount.
   - Add a thin wrapper in `src/services/` that calls `payWithPayPalOrders({ createFunctionName, captureFunctionName, returnPath, cancelPath, createExtra })`.

4. **Config**
   - Same PayPal credentials: `paypal.client_id`, `paypal.client_secret`, optional `paypal.sandbox`, `paypal.listing_currency`.

Rides still use **`verifyPayPalCapture`** (capture-centric) where that fits better than Orders.
