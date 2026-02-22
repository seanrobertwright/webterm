/**
 * Zustand store for terminal settings with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SettingsState {
  fontSize: number;
  fontFamily: string;
  themeName: string;
}

export interface SettingsActions {
  setFontSize: (fontSize: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setThemeName: (themeName: string) => void;
}

export type SettingsStore = SettingsState & SettingsActions;

const defaultSettings: SettingsState = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', monospace",
  themeName: 'default',
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setFontSize: (fontSize) => {
        set({ fontSize: Math.max(8, Math.min(32, fontSize)) });
      },

      setFontFamily: (fontFamily) => {
        set({ fontFamily });
      },

      setThemeName: (themeName) => {
        set({ themeName });
      },
    }),
    {
      name: 'webterm-settings',
    }
  )
);
