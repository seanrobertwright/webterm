import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export const THEMES = [
  { id: 'tron', name: 'Tron', color: 'oklch(0.75 0.18 195)', description: 'Cyan' },
  { id: 'ares', name: 'Ares', color: 'oklch(0.6 0.25 25)', description: 'Red' },
  { id: 'clu', name: 'Clu', color: 'oklch(0.75 0.2 55)', description: 'Orange' },
  { id: 'athena', name: 'Athena', color: 'oklch(0.85 0.18 90)', description: 'Gold' },
  { id: 'aphrodite', name: 'Aphrodite', color: 'oklch(0.7 0.22 340)', description: 'Pink' },
  { id: 'poseidon', name: 'Poseidon', color: 'oklch(0.6 0.2 250)', description: 'Blue' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'webterm-theme';
const DEFAULT_THEME: ThemeId = 'tron';

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) {
      return stored as ThemeId;
    }
  } catch {
    // localStorage may not be available
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(getStoredTheme);

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: ThemeId) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // localStorage may not be available
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
