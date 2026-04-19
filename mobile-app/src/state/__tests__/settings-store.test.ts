import AsyncStorage from '@react-native-async-storage/async-storage';

import { SETTINGS_KEYS, useSettingsStore } from '../settings-store';

// FR-016 validation: dev-mode state + backend URL override survive a cold
// relaunch. A real cold start looks like:
//  1. AsyncStorage contains the last-persisted values.
//  2. The zustand store factory runs; persist middleware reads AsyncStorage
//     and merges the values into the in-memory state.
//
// We simulate (1) by writing directly into the multi-key layout the settings
// storage uses (data-model.md §4), then invoke rehydrate() which is the
// same call the persist middleware makes on construction. We avoid touching
// the store's in-memory fields before rehydrate because the persist
// middleware subscribes to every setState — any setState({defaults}) call
// would itself fire a write that clobbers AsyncStorage, defeating the test.
// (001-wolof-translate-mobile:T090)

async function writeStoredValues(values: {
  tapMode?: boolean;
  devModeEnabled?: boolean;
  backendUrlOverride?: string | null;
}): Promise<void> {
  if (values.tapMode !== undefined) {
    await AsyncStorage.setItem(
      SETTINGS_KEYS.tapMode,
      JSON.stringify(values.tapMode),
    );
  }
  if (values.devModeEnabled !== undefined) {
    await AsyncStorage.setItem(
      SETTINGS_KEYS.devModeEnabled,
      JSON.stringify(values.devModeEnabled),
    );
  }
  if (values.backendUrlOverride !== undefined) {
    await AsyncStorage.setItem(
      SETTINGS_KEYS.backendUrlOverride,
      JSON.stringify(values.backendUrlOverride),
    );
  }
}

describe('settings-store persistence across cold relaunch (T090)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('devModeEnabled survives a simulated cold relaunch', async () => {
    // Prior-session write.
    await writeStoredValues({ devModeEnabled: true });

    // Simulated cold start: rehydrate reads from AsyncStorage into the store.
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().devModeEnabled).toBe(true);
  });

  test('backendUrlOverride survives a simulated cold relaunch', async () => {
    await writeStoredValues({
      backendUrlOverride: 'https://bff.staging.example.com',
    });

    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().backendUrlOverride).toBe(
      'https://bff.staging.example.com',
    );
  });

  test('defaults are used when AsyncStorage has no prior values', async () => {
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().devModeEnabled).toBe(false);
    expect(useSettingsStore.getState().backendUrlOverride).toBe(null);
  });

  test('clearing the override reverts to null across relaunch', async () => {
    // Simulate an earlier session that set then cleared the override.
    await writeStoredValues({ backendUrlOverride: null });

    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().backendUrlOverride).toBe(null);
  });

  test('both fields rehydrate together after a relaunch', async () => {
    await writeStoredValues({
      devModeEnabled: true,
      backendUrlOverride: 'https://example.org',
    });

    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().devModeEnabled).toBe(true);
    expect(useSettingsStore.getState().backendUrlOverride).toBe(
      'https://example.org',
    );
  });

  test('setters write-through to AsyncStorage (persist round-trip)', async () => {
    useSettingsStore.getState().setDevModeEnabled(true);
    await new Promise((r) => setTimeout(r, 10));

    expect(await AsyncStorage.getItem(SETTINGS_KEYS.devModeEnabled)).toBe(
      JSON.stringify(true),
    );

    useSettingsStore
      .getState()
      .setBackendUrlOverride('https://bff.staging.example.com');
    await new Promise((r) => setTimeout(r, 10));

    expect(
      await AsyncStorage.getItem(SETTINGS_KEYS.backendUrlOverride),
    ).toBe(JSON.stringify('https://bff.staging.example.com'));
  });
});
