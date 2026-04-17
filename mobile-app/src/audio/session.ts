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
  let lastPlaying = false;
  // Heuristic: expo-audio SDK 55 surfaces OS interruptions as externally-driven
  // pause/resume in playbackStatusUpdate; T055 refines on-device
  // (001-wolof-translate-mobile:T025)
  const sub = player.addListener('playbackStatusUpdate', (status: StatusLike) => {
    const playing = !!status.playing;
    const finishedNaturally = !!status.didJustFinish;
    if (lastPlaying && !playing && !finishedNaturally) {
      listener({ kind: 'began' });
    } else if (!lastPlaying && playing) {
      listener({ kind: 'ended' });
    }
    lastPlaying = playing;
  });
  return { remove: () => sub.remove() };
}

export function subscribeToRouteChanges(
  _player: AudioPlayer,
  _listener: (event: RouteChangeEvent) => void,
): AudioSubscription {
  // SDK 55 does not expose AVAudioSession.routeChange through expo-audio events;
  // T056 wires the native bridge per research.md §10 R-D
  // (001-wolof-translate-mobile:T025)
  return { remove: () => {} };
}
