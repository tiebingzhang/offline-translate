import '@/i18n';
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { useRecorder } from '@/audio/recorder';
import { usePipelineStore } from '@/state/pipeline-store';
import { initialPipelineState } from '@/pipeline/state-machine';

// Bug D integration tests — assert MainScreen returns the pipeline-store phase
// to 'idle' when the recorder fails to start (permission denied OR
// recorder.start() rejection). Both tests drive the bug via a mocked
// useRecorder and assert pipeline-store state after press-in.
// (001-wolof-translate-mobile:T170, T171)

jest.mock('@/audio/recorder', () => ({
  useRecorder: jest.fn(),
}));

jest.mock('@/audio/player', () => ({
  defaultPlayer: {
    playResult: jest.fn(async () => {}),
    stop: jest.fn(),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/design/BackgroundPattern', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, default: View };
});

// Import MainScreen AFTER mocks are set so its module-level imports pick up
// the mocked shapes. (001-wolof-translate-mobile:T170)
import MainScreen from '../index';

function resetPipelineStore() {
  usePipelineStore.setState({
    ...usePipelineStore.getState(),
    ...initialPipelineState,
  });
}

describe('MainScreen — recorder failure recovery (Bug D)', () => {
  beforeEach(() => {
    resetPipelineStore();
    (useRecorder as jest.Mock).mockReset();
  });

  afterEach(() => {
    resetPipelineStore();
  });

  test('Main screen: recorder permission denial returns phase to idle (Bug D)', async () => {
    (useRecorder as jest.Mock).mockImplementation((opts) => ({
      status: 'idle',
      elapsedSec: 0,
      countdownSec: null,
      // Permission-denial path: recorder.start() synchronously invokes the
      // onPermissionDenied callback passed to useRecorder, then resolves
      // without flipping internal status — matches recorder.ts:102-120.
      // (001-wolof-translate-mobile:T170)
      start: jest.fn(async () => {
        opts.onPermissionDenied?.();
      }),
      stop: jest.fn(async () => null),
    }));

    const tree = render(<MainScreen />);
    const button = tree.getByLabelText('English → Wolof translate button');

    await act(async () => {
      fireEvent(button, 'pressIn');
      // Flush the microtask queue so recorder.start()'s resolution + any
      // chained .catch run before we sample state.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(usePipelineStore.getState().phase).toBe('idle');
  });

  test('Main screen: recorder.start() rejection returns phase to idle (Bug D, thrown path)', async () => {
    (useRecorder as jest.Mock).mockImplementation(() => ({
      status: 'idle',
      elapsedSec: 0,
      countdownSec: null,
      start: jest.fn(() =>
        Promise.reject(new Error('prepareToRecordAsync failed')),
      ),
      stop: jest.fn(async () => null),
    }));

    const tree = render(<MainScreen />);
    const button = tree.getByLabelText('English → Wolof translate button');

    await act(async () => {
      fireEvent(button, 'pressIn');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(usePipelineStore.getState().phase).toBe('idle');
  });
});
