#!/usr/bin/env node
/**
 * Sync EXPO_PUBLIC_* vars from .env to EAS secrets for production builds.
 * Run: node scripts/set-eas-secrets.js
 * Requires: .env filled with your values, eas-cli installed (npm i -g eas-cli)
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  console.error('No .env file found. Copy .env.example to .env and fill your values.');
  process.exit(1);
}

const env = fs.readFileSync(envPath, 'utf8');
const vars = [];
for (const line of env.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  if (key.startsWith('EXPO_PUBLIC_') && value) {
    vars.push({ key, value });
  }
}

if (vars.length === 0) {
  console.error('No EXPO_PUBLIC_* variables with values found in .env');
  process.exit(1);
}

console.log(`Syncing ${vars.length} secrets to EAS...`);
for (const { key, value } of vars) {
  const result = spawnSync(
    'npx',
    ['eas', 'env:create', 'production', '--name', key, '--value', value, '--visibility', 'plaintext', '--force', '--non-interactive'],
    { stdio: 'inherit', shell: true }
  );
  if (result.status === 0) {
    console.log(`  ✓ ${key}`);
  } else {
    console.error(`  ✗ ${key} (exit ${result.status})`);
  }
}
console.log('Done.');
