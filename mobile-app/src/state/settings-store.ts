import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export const SETTINGS_KEYS = {
  tapMode: 'wt.tapMode',
  devModeEnabled: 'wt.devModeEnabled',
  backendUrlOverride: 'wt.backendUrlOverride',
} as const;

export interface SettingsState {
  tapMode: boolean;
  devModeEnabled: boolean;
  backendUrlOverride: string | null;
  setTapMode: (value: boolean) => void;
  setDevModeEnabled: (value: boolean) => void;
  setBackendUrlOverride: (value: string | null) => void;
}

type PersistedShape = Pick<SettingsState, 'tapMode' | 'devModeEnabled' | 'backendUrlOverride'>;

function parseOr<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Multiplex a single persist slice across the three AsyncStorage keys mandated
// by data-model.md §4; default persist would write a single blob, which the
// spec forbids (001-wolof-translate-mobile:T022)
const multiKeyStorage: StateStorage = {
  getItem: async () => {
    const entries = await AsyncStorage.multiGet([
      SETTINGS_KEYS.tapMode,
      SETTINGS_KEYS.devModeEnabled,
      SETTINGS_KEYS.backendUrlOverride,
    ]);
    const byKey = new Map(entries);
    const state: PersistedShape = {
      tapMode: parseOr<boolean>(byKey.get(SETTINGS_KEYS.tapMode) ?? null, false),
      devModeEnabled: parseOr<boolean>(byKey.get(SETTINGS_KEYS.devModeEnabled) ?? null, false),
      backendUrlOverride: parseOr<string | null>(
        byKey.get(SETTINGS_KEYS.backendUrlOverride) ?? null,
        null,
      ),
    };
    return JSON.stringify({ state, version: 1 });
  },
  setItem: async (_name, value) => {
    const envelope = JSON.parse(value) as { state?: Partial<PersistedShape> };
    const state = envelope.state ?? {};
    await AsyncStorage.multiSet([
      [SETTINGS_KEYS.tapMode, JSON.stringify(state.tapMode ?? false)],
      [SETTINGS_KEYS.devModeEnabled, JSON.stringify(state.devModeEnabled ?? false)],
      [SETTINGS_KEYS.backendUrlOverride, JSON.stringify(state.backendUrlOverride ?? null)],
    ]);
  },
  removeItem: async () => {
    await AsyncStorage.multiRemove([
      SETTINGS_KEYS.tapMode,
      SETTINGS_KEYS.devModeEnabled,
      SETTINGS_KEYS.backendUrlOverride,
    ]);
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      tapMode: false,
      devModeEnabled: false,
      backendUrlOverride: null,
      setTapMode: (value) => set({ tapMode: value }),
      setDevModeEnabled: (value) => set({ devModeEnabled: value }),
      setBackendUrlOverride: (value) => set({ backendUrlOverride: value }),
    }),
    {
      name: 'wt.settings',
      version: 1,
      storage: createJSONStorage(() => multiKeyStorage),
      partialize: ({ tapMode, devModeEnabled, backendUrlOverride }) => ({
        tapMode,
        devModeEnabled,
        backendUrlOverride,
      }),
    },
  ),
);
