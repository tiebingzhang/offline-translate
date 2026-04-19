import '@/i18n';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import DirectionButton from '@/components/DirectionButton';
import { useSettingsStore } from '@/state/settings-store';

function resetSettings(tapMode: boolean = false): void {
  useSettingsStore.setState({
    tapMode,
    devModeEnabled: false,
    backendUrlOverride: null,
  });
}

describe('DirectionButton — press-and-hold mode (tapMode=false) — FR-028', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSettings(false);
  });

  test('onPressIn fires on press, onPressOut fires on release', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const tree = render(
      <DirectionButton
        direction="english_to_wolof"
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );
    const button = tree.getByRole('button');

    fireEvent(button, 'pressIn');
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).not.toHaveBeenCalled();

    fireEvent(button, 'pressOut');
    expect(onPressOut).toHaveBeenCalledTimes(1);
    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  test('disabled state blocks onPressIn / onPressOut', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const tree = render(
      <DirectionButton
        direction="english_to_wolof"
        disabled
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );
    const button = tree.getByRole('button');
    fireEvent(button, 'pressIn');
    fireEvent(button, 'pressOut');
    expect(onPressIn).not.toHaveBeenCalled();
    expect(onPressOut).not.toHaveBeenCalled();
  });
});

describe('DirectionButton — tap mode (tapMode=true) — FR-028', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSettings(true);
  });

  test('first tap fires onPressIn; second tap (while recording) fires onPressOut', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const tree = render(
      <DirectionButton
        direction="english_to_wolof"
        recording={false}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );
    const button = tree.getByRole('button');

    // First tap — not yet recording; behaves like pressStart.
    fireEvent.press(button);
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).not.toHaveBeenCalled();

    // Caller now re-renders with recording=true (mirrors live pipeline).
    tree.rerender(
      <DirectionButton
        direction="english_to_wolof"
        recording={true}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );

    // Second tap while recording — fires onPressOut.
    fireEvent.press(button);
    expect(onPressOut).toHaveBeenCalledTimes(1);
    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  test('press-in/press-out events are ignored in tap mode (no double-fire)', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    const tree = render(
      <DirectionButton
        direction="english_to_wolof"
        recording={false}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );
    const button = tree.getByRole('button');
    fireEvent(button, 'pressIn');
    fireEvent(button, 'pressOut');
    expect(onPressIn).not.toHaveBeenCalled();
    expect(onPressOut).not.toHaveBeenCalled();
  });

  test('toggling tapMode mid-capture does not wedge state — next user action still reaches store', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    // Start in press-and-hold mode, begin a capture.
    resetSettings(false);
    const tree = render(
      <DirectionButton
        direction="english_to_wolof"
        recording={false}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );
    const button = tree.getByRole('button');
    fireEvent(button, 'pressIn');
    expect(onPressIn).toHaveBeenCalledTimes(1);

    // User flips tapMode on while still holding. Parent re-renders with recording=true.
    resetSettings(true);
    tree.rerender(
      <DirectionButton
        direction="english_to_wolof"
        recording={true}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      />,
    );

    // A subsequent tap (tap-mode release) still terminates the capture.
    fireEvent.press(button);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });
});
