import '@/i18n';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import SettingsSheet from '@/components/SettingsSheet';
import { useSettingsStore } from '@/state/settings-store';

function resetStoresForTest(): void {
  useSettingsStore.setState({
    tapMode: false,
    devModeEnabled: false,
    backendUrlOverride: null,
  });
}

describe('SettingsSheet — wired behavior (T103)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStoresForTest();
  });

  test('renders the tap-mode toggle with default value from settings-store', () => {
    const tree = render(<SettingsSheet />);
    const toggle = tree.getByTestId('SettingsSheet.tapModeToggle');
    expect(toggle).toBeTruthy();
    // Default is tapMode=false (press-and-hold remains the primary path).
    // (001-wolof-translate-mobile:T103)
    expect(toggle.props.value).toBe(false);
  });

  test('tap-mode toggle press flips settings-store.tapMode', () => {
    const tree = render(<SettingsSheet />);
    expect(useSettingsStore.getState().tapMode).toBe(false);

    const toggle = tree.getByTestId('SettingsSheet.tapModeToggle');
    fireEvent(toggle, 'valueChange', true);
    expect(useSettingsStore.getState().tapMode).toBe(true);

    fireEvent(toggle, 'valueChange', false);
    expect(useSettingsStore.getState().tapMode).toBe(false);
  });
});
