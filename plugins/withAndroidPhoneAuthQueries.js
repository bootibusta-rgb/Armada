/**
 * Android 11+ package visibility: Firebase Phone Auth / Play Integrity / reCAPTCHA need to resolve
 * Google Play services and (when applicable) Chrome. Without `<queries><package>`, some devices
 * (e.g. budget Samsung) return auth/unknown (internal error / code 39).
 */
const { withAndroidManifest } = require('expo/config-plugins');

const PACKAGES = [
  'com.google.android.gms',
  'com.android.chrome',
  'com.chrome.beta',
  /** Samsung Internet — used for reCAPTCHA / verification UI on many Galaxy devices when Chrome is absent. */
  'com.sec.android.app.sbrowser',
];

module.exports = function withAndroidPhoneAuthQueries(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults;
    if (!manifest.queries?.length) {
      manifest.queries = [{}];
    }
    const q0 = manifest.queries[0];
    const existing = Array.isArray(q0.package) ? q0.package : [];
    const seen = new Set(existing.map((p) => p?.$?.['android:name']).filter(Boolean));
    const next = [...existing];
    for (const name of PACKAGES) {
      if (seen.has(name)) continue;
      seen.add(name);
      next.push({ $: { 'android:name': name } });
    }
    q0.package = next;
    return modConfig;
  });
};
