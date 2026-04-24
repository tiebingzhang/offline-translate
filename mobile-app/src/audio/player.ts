import { createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import type { TranslationResult } from '@/api/bff-client';

import { configureForPlayback, subscribeToInterruptions } from './session';

interface AudioPlayerLike {
  play: () => void;
  pause: () => void;
  release?: () => void;
  addListener: (
    event: string,
    // AudioStatus fields surfaced by expo-audio SDK 55 on
    // `playbackStatusUpdate`. `isLoaded === false` after an initial status
    // event signals a load failure (corrupt m4a, 0-byte, unlink race, native
    // load error) — listener keys on it to escape a stuck 'playing' phase.
    // (001-wolof-translate-mobile:T167)
    listener: (status: {
      didJustFinish?: boolean;
      isLoaded?: boolean;
      playing?: boolean;
    }) => void,
  ) => { remove: () => void };
}

export interface PlayerDeps {
  createAudioPlayer: (source: string) => AudioPlayerLike;
  speakText: (
    text: string,
    options: {
      language: string;
      onDone?: () => void;
      onStopped?: () => void;
      onError?: () => void;
    },
  ) => void;
  stopSpeech?: () => void;
  configureForPlayback?: () => Promise<void>;
}

export interface PlayResultOptions {
  onEnded?: () => void;
  // Invoked when an OS interruption (phone call, Siri, alarm) begins while
  // translated audio is playing. Callers use this to drive pipeline state
  // (e.g. transition 'playing' → 'completed' so the replay affordance is
  // re-exposed). FR-008 (001-wolof-translate-mobile:T079)
  onInterruptionBegan?: () => void;
}

export interface Player {
  playResult(result: TranslationResult, opts?: PlayResultOptions): Promise<void>;
  // Pause current playback without tearing down the active player, so a
  // subsequent resume or stop() is still possible. Used by pipeline-store on
  // OS interruptions (FR-008) (001-wolof-translate-mobile:T079)
  pause(): void;
  stop(): void;
}

const EN_US = 'en-US';

export function makePlayer(deps: PlayerDeps): Player {
  let activePlayer: AudioPlayerLike | null = null;
  let activeSubscription: { remove: () => void } | null = null;
  let activeInterruptionSub: { remove: () => void } | null = null;

  async function playResult(
    result: TranslationResult,
    opts: PlayResultOptions = {},
  ): Promise<void> {
    stop();
    if (deps.configureForPlayback) {
      await deps.configureForPlayback();
    }

    const hasPlayableAudio =
      !!result.localAudioUri && result.outputMode !== 'text_only';

    if (hasPlayableAudio) {
      const player = deps.createAudioPlayer(result.localAudioUri as string);
      activePlayer = player;
      let lastPlaying = false;
      // Context7 (expo-audio SDK 55) confirmed AudioStatus exposes isLoaded
      // but no discrete `error` field. Option 1 adopted per T164: listener
      // keys on `isLoaded === false` after an event arrives. `finished`
      // de-dupes so onEnded fires AT MOST ONCE across the natural-finish,
      // interruption, and load-failure branches. (001-wolof-translate-mobile:T167)
      let finished = false;
      activeSubscription = player.addListener('playbackStatusUpdate', (status) => {
        const playing = !!status.playing;
        const finishedNaturally = !!status.didJustFinish;
        // Load-failure branch (Bug C): corrupt file, 0-byte, unlink race, or
        // native load error emits `{ isLoaded: false, playing: false }` and
        // never sets didJustFinish, so the original `lastPlaying && !playing`
        // transition never triggers (lastPlaying stays false). Treat a
        // persistent isLoaded:false as terminal. (001-wolof-translate-mobile:T167)
        const loadFailed = status.isLoaded === false;
        if (!finished && (finishedNaturally || (lastPlaying && !playing) || loadFailed)) {
          // Treat OS interruptions (phone call, Siri) and load failures as
          // end-of-playback so the UI returns to a coherent completed state
          // (FR-008). (001-wolof-translate-mobile:T055, T167)
          finished = true;
          opts.onEnded?.();
        }
        lastPlaying = playing;
      });
      // Dedicated FR-008 hook: surface OS audio interruptions (phone call,
      // Siri, alarm) as a distinct signal so callers can react explicitly
      // (pausing the pipeline, preserving the result for replay) rather than
      // only observing via the generic onEnded path. The session-layer state
      // machine guarantees 'began' fires on exactly the playing → not-playing
      // transition (not on natural finish).
      // (001-wolof-translate-mobile:T079)
      if (opts.onInterruptionBegan) {
        activeInterruptionSub = subscribeToInterruptions(
          // The AudioPlayer surface required by subscribeToInterruptions is
          // the same addListener shape we already hold here; cast via unknown
          // to avoid re-exporting the internal type from expo-audio.
          player as unknown as Parameters<typeof subscribeToInterruptions>[0],
          (event) => {
            if (event.kind === 'began') {
              opts.onInterruptionBegan?.();
            }
          },
        );
      }
      player.play();
      return;
    }

    // All three terminal TTS callbacks route to onEnded so any exit path
    // (natural finish, Speech.stop(), backend error) releases the pipeline
    // from the 'playing' phase (001-wolof-translate-mobile:bugfix-tts-onEnded)
    deps.speakText(result.translatedText, {
      language: EN_US,
      onDone: opts.onEnded,
      onStopped: opts.onEnded,
      onError: opts.onEnded,
    });
  }

  function pause(): void {
    if (activePlayer) {
      activePlayer.pause();
    }
    deps.stopSpeech?.();
  }

  function stop(): void {
    if (activeInterruptionSub) {
      activeInterruptionSub.remove();
      activeInterruptionSub = null;
    }
    if (activeSubscription) {
      activeSubscription.remove();
      activeSubscription = null;
    }
    if (activePlayer) {
      activePlayer.release?.();
      activePlayer = null;
    }
    deps.stopSpeech?.();
  }

  return { playResult, pause, stop };
}

export const defaultPlayer: Player = makePlayer({
  createAudioPlayer: (source) => createAudioPlayer(source) as unknown as AudioPlayerLike,
  speakText: (text, options) =>
    Speech.speak(text, {
      language: options.language,
      onDone: options.onDone,
      onStopped: options.onStopped,
      onError: options.onError,
    }),
  stopSpeech: () => {
    void Speech.stop();
  },
  configureForPlayback,
});

export const playResult = defaultPlayer.playResult;
export const stopPlayback = defaultPlayer.stop;
