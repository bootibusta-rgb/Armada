// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');
const { resolve: metroResolve } = require('metro-resolver').default;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const upstreamResolveRequest = config.resolver.resolveRequest;

/**
 * react-native-webrtc imports `event-target-shim/index`, which is not listed in that package's
 * "exports" field — Metro warns and falls back. Point explicitly at index.js to silence this.
 */
function resolveEventTargetShim(moduleName) {
  if (typeof moduleName !== 'string') return null;

  if (moduleName === 'event-target-shim/index') {
    const candidates = [
      path.join(__dirname, 'node_modules', 'react-native-webrtc', 'node_modules', 'event-target-shim', 'index.js'),
      path.join(__dirname, 'node_modules', 'event-target-shim', 'index.js'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return { type: 'sourceFile', filePath: path.resolve(c) };
      }
    }
    return null;
  }

  if (!moduleName.includes('event-target-shim')) return null;

  const base = path.basename(moduleName, path.extname(moduleName));
  if (base !== 'index') return null;

  const dir = path.dirname(moduleName);
  if (path.basename(dir) !== 'event-target-shim') return null;

  const indexJs = path.join(dir, 'index.js');
  if (fs.existsSync(indexJs)) {
    return { type: 'sourceFile', filePath: path.resolve(indexJs) };
  }
  return null;
}

// Resolve react-native-maps to a web mock when building for web
// (react-native-maps uses native modules that don't exist on web)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = resolveEventTargetShim(moduleName);
  if (shim) return shim;

  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'src/mocks/react-native-maps.web.js'),
      type: 'sourceFile',
    };
  }
  if (typeof upstreamResolveRequest === 'function') {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return metroResolve(context, moduleName, platform);
};

module.exports = config;
