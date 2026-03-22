# Fix: Leaked Firebase API Key (google-services.json)

Your Firebase API key was committed in `google-services.json`. Follow these steps.

---

## Part 1: Create a new API key and delete the old one

### Step 1: Open the Credentials page

1. Go to **[Google Cloud Console](https://console.cloud.google.com)**
2. At the top, click the **project dropdown** and select **Armada** (project id: armada-25d8a)
3. In the left sidebar, go to **APIs & Services** → **Credentials**
4. You’ll see sections like **API keys**, **OAuth 2.0 Client IDs**, etc.

### Step 2: Locate the leaked key

1. Under **API keys**, find the key that was exposed (check your GitGuardian/GitHub alert)
2. Click the **key name** (not the copy icon) to open its details page

### Step 3: Create a new key (two ways)

**Option A – Rotate key (if you see it)**

1. On the key’s details page, look for **Rotate key** or **Create a copy**
2. If **Rotate key** exists: click it → enter a name (e.g. `Armada Android – rotated`) → **Create**
3. If **Create a copy** exists: click it → enter a name → **Create**
4. **Copy the new key string** shown in the dialog and save it somewhere safe

**Option B – Create a new key (if Rotate/Copy is not available)**

1. Go back to **Credentials** (breadcrumb or left menu)
2. Click **+ Create credentials** (top of page)
3. Choose **API key**
4. A new key is created; **copy the key string** and save it
5. Click **Edit API key** (or the key name)
6. Under **Application restrictions**:
   - Select **Android apps**
   - Click **Add an item**
   - Package name: `com.armada.app`
   - (Optional) Add your SHA-1: run `cd android && ./gradlew signingReport` to get it
7. Under **API restrictions**:
   - Select **Restrict key**
   - Add the Firebase APIs you use (e.g. Firebase Authentication API, Firestore, etc.)
8. Click **Save**

### Step 4: Update your local google-services.json

1. Open `h:\Armada\google-services.json` in a text editor
2. Find the `"current_key"` field in the `api_key` array
3. Replace the value with your **new** key string
4. Save the file
5. Copy the file to `h:\Armada\android\app\google-services.json` (or edit that file and make the same change)

### Step 5: Delete the old (compromised) key

1. Go back to **Credentials**: [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Under **API keys**, find the **old** (compromised) key
3. Click the key name to open it
4. Click **Delete** (or the trash icon) at the top
5. Confirm deletion

---

## Part 2: Alternative – download fresh from Firebase

If Firebase creates the key for you when you add an Android app:

1. Go to **[Firebase Console](https://console.firebase.google.com)** → project **Armada**
2. Click the **gear** (Project settings)
3. Under **Your apps**, find your Android app
4. Click **Download google-services.json**
5. Replace these files with the downloaded file:
   - `h:\Armada\google-services.json`
   - `h:\Armada\android\app\google-services.json`

**Note:** The new file may still contain the same key if Firebase hasn’t rotated it. To fully fix the leak, you must **delete the old key** in Google Cloud Console (Part 1, Step 5) and let Firebase use a new one, or create a new key as in Part 1.

---

## Part 3: Verify .gitignore

These files are in `.gitignore` and will not be committed:

- `google-services.json`
- `android/app/google-services.json`

---

## Part 4: For new developers

```bash
# Copy example (structure only – no keys)
cp google-services.json.example google-services.json
cp google-services.json android/app/google-services.json
# Then download the real file from Firebase Console and replace both
```

---

## Part 5: Dismiss the GitHub alert

1. Go to **GitHub** → your repo
2. **Security** → **Secret scanning alerts**
3. Open the Armada alert
4. Click **Mark as resolved** (after you’ve created a new key and deleted the old one)
