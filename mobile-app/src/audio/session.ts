import { setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type InterruptionEvent = { kind: 'began' | 'ended' };
export type RouteChangeEvent = { kind: 'changed' };

export interface AudioSubscription {
  remove(): void;
}

export async function configureForRecording(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    interruptionMode: 'doNotMix',
  });
}

export async function configureForPlayback(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: false,
    interruptionMode: 'doNotMix',
  });
}

type StatusLike = { playing?: boolean; didJustFinish?: boolean };

export function subscribeToInterruptions(
  player: AudioPlayer,
  listener: (event: InterruptionEvent) => void,
): AudioSubscription {
  // State machine so the very first playing=true transition (initial start of
  // playback) is not mistaken for "interruption ended". Only fire 'ended' after
  // a real 'began' has been observed (001-wolof-translate-mobile:T079).
  let mode: 'idle' | 'playing' | 'interrupted' = 'idle';
  const sub = player.addListener('playbackStatusUpdate', (status: StatusLike) => {
    const playing = !!status.playing;
    const finishedNaturally = !!status.didJustFinish;
    if (mode === 'idle' && playing) {
      mode = 'playing';
    } else if (mode === 'playing' && !playing && !finishedNaturally) {
      mode = 'interrupted';
      listener({ kind: 'began' });
    } else if (mode === 'interrupted' && playing) {
      mode = 'playing';
      listener({ kind: 'ended' });
    } else if (mode === 'playing' && !playing && finishedNaturally) {
      mode = 'idle';
    }
  });
  return { remove: () => sub.remove() };
}

export function subscribeToRouteChanges(
  _player: AudioPlayer,
  _listener: (event: RouteChangeEvent) => void,
): AudioSubscription {
  // SDK 55 does not expose AVAudioSession.routeChange through expo-audio events;
  // T056 wires the native bridge per research.md §10 R-D
  // (001-wolof-translate-mobile:T056)
  return { remove: () => {} };
}
