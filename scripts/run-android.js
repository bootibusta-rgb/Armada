#!/usr/bin/env node
/**
 * Run expo run:android with JAVA_HOME auto-detected on Windows.
 * Fixes "JAVA_HOME is not set" when Java is installed but not in PATH.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

const JAVA_CANDIDATES = [
  path.join(programFiles, 'Microsoft', 'jdk-17.0.18'),
  path.join(programFiles, 'Microsoft', 'jdk-17.0.13'),
  path.join(programFiles, 'Microsoft', 'jdk-17.0.12'),
  path.join(programFiles, 'Microsoft', 'jdk-17.0.11'),
  path.join(programFiles, 'Microsoft', 'jdk-21.0.5'),
  path.join(programFiles, 'Microsoft', 'jdk-21.0.4'),
  path.join(programFiles, 'Java', 'jdk-17'),
  path.join(programFiles, 'Java', 'jdk-21'),
  path.join(programFiles, 'Eclipse Adoptium', 'jdk-17.0.13.11-hotspot'),
  path.join(programFiles, 'Eclipse Adoptium', 'jdk-17.0.12.7-hotspot'),
];

function findJavaHome() {
  if (process.env.JAVA_HOME) {
    const javaExe = path.join(process.env.JAVA_HOME, 'bin', 'java.exe');
    if (fs.existsSync(javaExe)) return process.env.JAVA_HOME;
  }

  for (const candidate of JAVA_CANDIDATES) {
    const javaExe = path.join(candidate, 'bin', 'java.exe');
    if (fs.existsSync(javaExe)) return candidate;
  }

  try {
    const dirs = fs.readdirSync(path.join(programFiles, 'Microsoft'));
    const jdk = dirs.find((d) => d.startsWith('jdk-'));
    if (jdk) {
      const p = path.join(programFiles, 'Microsoft', jdk);
      if (fs.existsSync(path.join(p, 'bin', 'java.exe'))) return p;
    }
  } catch (_) {}

  try {
    const dirs = fs.readdirSync(path.join(programFiles, 'Java'));
    const jdk = dirs.find((d) => d.startsWith('jdk-'));
    if (jdk) {
      const p = path.join(programFiles, 'Java', jdk);
      if (fs.existsSync(path.join(p, 'bin', 'java.exe'))) return p;
    }
  } catch (_) {}

  return null;
}

const javaHome = findJavaHome();
if (!javaHome) {
  console.error(`
JAVA_HOME is not set and Java was not found in common locations.

Install JDK 17 (required for Android builds):
  1. winget install Microsoft.OpenJDK.17
  OR
  2. Download: https://learn.microsoft.com/en-us/java/openjdk/download#openjdk-17

Then run: npm run run:android
`);
  process.exit(1);
}

const env = { ...process.env, JAVA_HOME: javaHome };
const result = spawnSync('npx', ['expo', 'run:android'], {
  stdio: 'inherit',
  env,
  shell: true,
});

process.exit(result.status ?? 1);
