import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SettingsState {
  tapMode: boolean;
  devModeEnabled: boolean;
  backendUrlOverride: string | null;
  setTapMode: (value: boolean) => void;
  setDevModeEnabled: (value: boolean) => void;
  setBackendUrlOverride: (value: string | null) => void;
}

const STORAGE_KEY_VERSION = 1;

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
      version: STORAGE_KEY_VERSION,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tapMode: state.tapMode,
        devModeEnabled: state.devModeEnabled,
        backendUrlOverride: state.backendUrlOverride,
      }),
    },
  ),
);
