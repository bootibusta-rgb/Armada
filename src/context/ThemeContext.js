import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { useAuth } from './AuthContext';

const THEME_KEY = 'armada_theme'; // 'light' | 'dark' | 'system'

const lightColors = {
  white: '#FFFFFF',
  black: '#0A0A0A',
  primary: '#7C3AED',
  primaryLight: '#8B5CF6',
  primaryDark: '#5B21B6',
  secondary: '#FACC15',
  accent: '#F97316',
  background: '#FFFFFF',
  surface: '#FAFAFA',
  text: '#0A0A0A',
  textSecondary: '#525252',
  error: '#DC2626',
  success: '#22C55E',
  purple: '#7C3AED',
  orange: '#F97316',
  orangeDark: '#EA580C',
  green: '#22C55E',
  yellow: '#FACC15',
  cash: '#FACC15',
  card: '#F5F5F5',
  onPrimary: '#FFFFFF',
};

const darkColors = {
  white: '#1A1A1A',
  black: '#F5F5F5',
  primary: '#A78BFA',
  primaryLight: '#8B5CF6',
  primaryDark: '#6D28D9',
  secondary: '#FDE047',
  accent: '#FB923C',
  background: '#0F0F0F',
  surface: '#1A1A1A',
  text: '#F5F5F5',
  textSecondary: '#A3A3A3',
  error: '#EF4444',
  success: '#4ADE80',
  purple: '#A78BFA',
  orange: '#FB923C',
  orangeDark: '#EA580C',
  green: '#4ADE80',
  yellow: '#FDE047',
  cash: '#FDE047',
  card: '#262626',
  onPrimary: '#FFFFFF',
};

const ThemeContext = createContext({ theme: lightColors, isDark: false, setThemeMode: () => {}, hasProfile: false });

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const { userProfile } = useAuth();
  const systemDark = useColorScheme() === 'dark';
  const [mode, setMode] = useState('system');

  const hasProfile = !!userProfile;

  useEffect(() => {
    if (!hasProfile) return;
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored && ['light', 'dark', 'system'].includes(stored)) setMode(stored);
    });
  }, [hasProfile]);

  // Dark mode only for users with a profile; auth screens always use light
  const isDark = hasProfile && (mode === 'dark' || (mode === 'system' && systemDark));
  const theme = {
    colors: isDark ? darkColors : lightColors,
    fonts: { regular: 'System', bold: 'System' },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    borderRadius: { sm: 8, md: 12, lg: 16, full: 9999 },
  };

  const setThemeMode = (m) => {
    if (!hasProfile) return;
    setMode(m);
    AsyncStorage.setItem(THEME_KEY, m);
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, mode, setThemeMode, hasProfile }}>
      {children}
    </ThemeContext.Provider>
  );
}
