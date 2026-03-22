/**
 * PayPal OAuth return URLs without expo-linking (avoids Metro "Unable to resolve expo-linking" on some setups).
 * Mirrors common expo-linking createURL behavior for StoreClient vs dev/build clients.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';

function collectManifestSchemes() {
  const ec = Constants.expoConfig;
  if (!ec) return [];
  if (Array.isArray(ec.scheme)) {
    return ec.scheme.filter((s) => typeof s === 'string');
  }
  if (typeof ec.scheme === 'string') {
    return [ec.scheme];
  }
  return [];
}

/**
 * URL PayPal redirects to after approval; must match WebBrowser.openAuthSessionAsync second argument.
 * @param {string} pathSegment e.g. 'listing-paypal-return' (no leading slash)
 */
export function createPayPalAppReturnUrl(pathSegment) {
  const path = String(pathSegment || '').replace(/^\/+/, '');
  const schemes = collectManifestSchemes();
  const primaryScheme = schemes[0] || 'armada';

  const hostUri = Constants.expoConfig?.hostUri || '';

  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    if (hostUri) {
      const p = path ? `/--/${path}` : '';
      const trimmed = hostUri.replace(/\/$/, '');
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return `${trimmed}${p}`;
      }
      const withoutExp = trimmed.replace(/^exp:\/\//, '');
      return `exp://${withoutExp}${p}`;
    }
  }

  return `${primaryScheme}://${path}`;
}

/**
 * PayPal appends ?token=<ORDER_ID> to the return URL.
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
export function parsePayPalReturnOrderId(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const q = url.indexOf('?');
    if (q !== -1) {
      const params = new URLSearchParams(url.slice(q + 1));
      const token = params.get('token');
      if (token) return token;
    }
  } catch (e) {
    /* fall through */
  }
  const m = url.match(/[?&]token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
