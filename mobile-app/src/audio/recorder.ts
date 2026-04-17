import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { configureForPlayback, configureForRecording } from './session';

export const MAX_RECORDING_SEC = 60;
export const COUNTDOWN_BEGIN_AT_SEC = 55;
export const MIN_RECORDING_SEC = 0.1;

export const RECORDER_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 48_000,
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
  },
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
  },
  web: {},
};

export interface RecordingTick {
  elapsedSec: number;
  countdownSec: number | null;
  shouldAutoStop: boolean;
}

export function computeRecordingTick(
  startedAtMs: number,
  nowMs: number,
): RecordingTick {
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const countdownSec =
    elapsedSec >= COUNTDOWN_BEGIN_AT_SEC
      ? Math.max(0, MAX_RECORDING_SEC - elapsedSec)
      : null;
  const shouldAutoStop = elapsedSec >= MAX_RECORDING_SEC;
  return { elapsedSec, countdownSec, shouldAutoStop };
}

export function shouldSubmitRecording(durationSec: number): boolean {
  return durationSec >= MIN_RECORDING_SEC;
}

export interface UseRecorderOptions {
  onAutoSubmit?: (uri: string, durationSec: number) => void;
  onTooShort?: () => void;
  onPermissionDenied?: () => void;
}

export interface UseRecorderValue {
  status: 'idle' | 'recording';
  elapsedSec: number;
  countdownSec: number | null;
  start: () => Promise<void>;
  stop: () => Promise<{ uri: string; durationSec: number } | null>;
}

export function useRecorder(options: UseRecorderOptions = {}): UseRecorderValue {
  const recorder = useAudioRecorder(RECORDER_OPTIONS);
  const [status, setStatus] = useState<'idle' | 'recording'>('idle');
  const [tick, setTick] = useState<RecordingTick>({
    elapsedSec: 0,
    countdownSec: null,
    shouldAutoStop: false,
  });
  const startedAtRef = useRef<number | null>(null);
  const autoStopRef = useRef<boolean>(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (status !== 'recording') return;
    const startedAt = startedAtRef.current ?? Date.now();
    const id = setInterval(() => {
      const next = computeRecordingTick(startedAt, Date.now());
      setTick(next);
      if (next.shouldAutoStop && !autoStopRef.current) {
        autoStopRef.current = true;
        void stop().then((result) => {
          if (result && shouldSubmitRecording(result.durationSec)) {
            optionsRef.current.onAutoSubmit?.(result.uri, result.durationSec);
          }
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [status]);

  const start = useCallback(async () => {
    const perms = await AudioModule.getRecordingPermissionsAsync();
    let granted = perms.granted;
    if (!granted) {
      const next = await AudioModule.requestRecordingPermissionsAsync();
      granted = next.granted;
    }
    if (!granted) {
      optionsRef.current.onPermissionDenied?.();
      return;
    }
    await configureForRecording();
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAtRef.current = Date.now();
    autoStopRef.current = false;
    setTick({ elapsedSec: 0, countdownSec: null, shouldAutoStop: false });
    setStatus('recording');
  }, [recorder]);

  const stop = useCallback(async (): Promise<
    { uri: string; durationSec: number } | null
  > => {
    if (status !== 'recording') return null;
    const startedAt = startedAtRef.current ?? Date.now();
    const durationSec = Math.max(0, (Date.now() - startedAt) / 1000);
    await recorder.stop();
    const uri = recorder.uri ?? '';
    setStatus('idle');
    startedAtRef.current = null;
    await configureForPlayback().catch(() => undefined);

    if (!shouldSubmitRecording(durationSec)) {
      optionsRef.current.onTooShort?.();
      return null;
    }
    if (!uri) return null;
    return { uri, durationSec };
  }, [recorder, status]);

  return {
    status,
    elapsedSec: tick.elapsedSec,
    countdownSec: tick.countdownSec,
    start,
    stop,
  };
}
