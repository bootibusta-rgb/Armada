import Constants from 'expo-constants';

/**
 * Bump with each Play upload that includes phone-auth / integrity fixes.
 * Testers below this native versionCode (or version name) see an on-screen warning before OTP.
 */
export const MIN_NATIVE_VERSION_CODE_PHONE_AUTH = 56;

/** Keep in sync with app.config.js `version` when you ship phone-auth fixes. */
export const MIN_APP_VERSION_NAME_PHONE_AUTH = '10.12.25';

function parseVersionParts(v) {
  return String(v || '')
    .trim()
    .split(/[.\-]/)
    .map((x) => parseInt(x, 10) || 0);
}

export function isAppVersionOlderThan(current, minimum) {
  const a = parseVersionParts(current);
  const b = parseVersionParts(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff < 0;
  }
  return false;
}

export function getNativeVersionCode() {
  const raw = Constants.nativeBuildVersion;
  const n = parseInt(String(raw || '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {string | null} non-null when this install is likely too old for reliable phone OTP
 */
export function getPhoneAuthInstallWarning() {
  const ver = Constants.nativeApplicationVersion || Constants.expoConfig?.version || '';
  const code = getNativeVersionCode();
  const minName = MIN_APP_VERSION_NAME_PHONE_AUTH;
  const minCode = MIN_NATIVE_VERSION_CODE_PHONE_AUTH;

  const codeStale = code != null && code < minCode;
  const nameStale = ver && isAppVersionOlderThan(ver, minName);

  if (!codeStale && !nameStale) return null;

  const label = code != null ? `${ver} (build ${code})` : ver || 'unknown';
  return (
    `This install looks outdated (${label}). From Play closed testing: open the Play Store → Armada → Update, ` +
    `or uninstall and reinstall from your tester link. Phone sign-in needs ${minName} (build ${minCode}) or newer. ` +
    `Numbers already listed in Firebase Authentication are fine — that is not what causes (auth/unknown).`
  );
}
