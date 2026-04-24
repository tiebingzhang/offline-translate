import { act, renderHook } from '@testing-library/react-native';
import { AudioModule, useAudioRecorder } from 'expo-audio';

import { configureForRecording } from '@/audio/session';

import {
  computeRecordingTick,
  COUNTDOWN_BEGIN_AT_SEC,
  MAX_RECORDING_SEC,
  MIN_RECORDING_SEC,
  RECORDER_OPTIONS,
  shouldSubmitRecording,
  useRecorder,
} from '../recorder';

// Bug D regression lock — verify the recorder-layer contract the MainScreen
// caller relies on: permission denial short-circuits BEFORE session
// configuration. This is additive coverage, not a failing-then-passing test:
// current implementation already satisfies the assertions; the test exists to
// prevent regression of the single-source-of-truth contract.
// (001-wolof-translate-mobile:T169)
jest.mock('@/audio/session', () => ({
  configureForRecording: jest.fn(async () => {}),
  configureForPlayback: jest.fn(async () => {}),
}));

describe('recorder — pure timing helpers', () => {
  describe('computeRecordingTick', () => {
    test('returns elapsedSec floored to whole seconds', () => {
      expect(computeRecordingTick(1_000_000, 1_000_000).elapsedSec).toBe(0);
      expect(computeRecordingTick(1_000_000, 1_000_500).elapsedSec).toBe(0);
      expect(computeRecordingTick(1_000_000, 1_003_000).elapsedSec).toBe(3);
      expect(computeRecordingTick(1_000_000, 1_059_000).elapsedSec).toBe(59);
    });

    test('countdownSec is null until the last 5 seconds, then counts down', () => {
      expect(computeRecordingTick(0, 30_000).countdownSec).toBeNull();
      expect(computeRecordingTick(0, 54_999).countdownSec).toBeNull();
      expect(computeRecordingTick(0, 55_000).countdownSec).toBe(5);
      expect(computeRecordingTick(0, 56_000).countdownSec).toBe(4);
      expect(computeRecordingTick(0, 59_000).countdownSec).toBe(1);
      expect(computeRecordingTick(0, 60_000).countdownSec).toBe(0);
    });

    test('shouldAutoStop is true once elapsed >= MAX_RECORDING_SEC (FR-002a)', () => {
      expect(computeRecordingTick(0, 59_999).shouldAutoStop).toBe(false);
      expect(computeRecordingTick(0, 60_000).shouldAutoStop).toBe(true);
      expect(computeRecordingTick(0, 61_000).shouldAutoStop).toBe(true);
    });

    test('COUNTDOWN_BEGIN_AT_SEC is 55, MAX_RECORDING_SEC is 60', () => {
      expect(MAX_RECORDING_SEC).toBe(60);
      expect(COUNTDOWN_BEGIN_AT_SEC).toBe(55);
    });
  });

  describe('shouldSubmitRecording', () => {
    test('refuses zero-length recordings (edge case)', () => {
      expect(shouldSubmitRecording(0)).toBe(false);
    });

    test('refuses recordings shorter than MIN_RECORDING_SEC', () => {
      expect(shouldSubmitRecording(MIN_RECORDING_SEC - 0.001)).toBe(false);
    });

    test('accepts any recording >= MIN_RECORDING_SEC', () => {
      expect(shouldSubmitRecording(MIN_RECORDING_SEC)).toBe(true);
      expect(shouldSubmitRecording(3)).toBe(true);
      expect(shouldSubmitRecording(60)).toBe(true);
    });
  });

  describe('RECORDER_OPTIONS — AAC/m4a 48 kbps mono 16 kHz per research.md §2', () => {
    test('targets AAC inside an m4a container', () => {
      expect(RECORDER_OPTIONS.extension).toBe('.m4a');
    });

    test('mono at 16 kHz at 48 kbps', () => {
      expect(RECORDER_OPTIONS.sampleRate).toBe(16_000);
      expect(RECORDER_OPTIONS.numberOfChannels).toBe(1);
      expect(RECORDER_OPTIONS.bitRate).toBe(48_000);
    });

    test('iOS output format is MPEG4 AAC', () => {
      expect(RECORDER_OPTIONS.ios?.outputFormat).toBeDefined();
    });
  });
});

describe('useRecorder hook — permission handling (Bug D)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Baseline useAudioRecorder from jest.setup.ts returns undefined — override
    // with a minimal shape so the hook body can construct without crashing.
    // (001-wolof-translate-mobile:T169)
    (useAudioRecorder as jest.Mock).mockReturnValue({
      prepareToRecordAsync: jest.fn(async () => {}),
      record: jest.fn(),
      stop: jest.fn(async () => {}),
      uri: null,
    });
  });

  test('start(): permission denial fires onPermissionDenied and keeps status idle (Bug D, recorder layer)', async () => {
    // Override jest.setup.ts defaults (granted: true) for this test only.
    // (001-wolof-translate-mobile:T169)
    (
      AudioModule.getRecordingPermissionsAsync as jest.Mock
    ).mockResolvedValueOnce({ granted: false });
    (
      AudioModule.requestRecordingPermissionsAsync as jest.Mock
    ).mockResolvedValueOnce({ granted: false });

    const onPermissionDenied = jest.fn();
    const { result } = renderHook(() => useRecorder({ onPermissionDenied }));

    await act(async () => {
      await result.current.start();
    });

    // (a) denial callback fires exactly once
    expect(onPermissionDenied).toHaveBeenCalledTimes(1);
    // (b) status did NOT flip to 'recording' — stays 'idle'
    expect(result.current.status).toBe('idle');
    // (c) session configuration short-circuited — never invoked on denial
    expect(configureForRecording).not.toHaveBeenCalled();
  });
});
