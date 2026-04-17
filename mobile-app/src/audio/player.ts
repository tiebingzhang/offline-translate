import { createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

import type { TranslationResult } from '@/api/bff-client';

import { configureForPlayback } from './session';

interface AudioPlayerLike {
  play: () => void;
  pause: () => void;
  release?: () => void;
  addListener: (
    event: string,
    listener: (status: { didJustFinish?: boolean }) => void,
  ) => { remove: () => void };
}

export interface PlayerDeps {
  createAudioPlayer: (source: string) => AudioPlayerLike;
  speakText: (text: string, options: { language: string }) => void;
  stopSpeech?: () => void;
  configureForPlayback?: () => Promise<void>;
}

export interface PlayResultOptions {
  onEnded?: () => void;
}

export interface Player {
  playResult(result: TranslationResult, opts?: PlayResultOptions): Promise<void>;
  stop(): void;
}

const EN_US = 'en-US';

export function makePlayer(deps: PlayerDeps): Player {
  let activePlayer: AudioPlayerLike | null = null;
  let activeSubscription: { remove: () => void } | null = null;

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
      activeSubscription = player.addListener('playbackStatusUpdate', (status) => {
        const playing = !!(status as { playing?: boolean }).playing;
        const finishedNaturally = !!status.didJustFinish;
        if (finishedNaturally || (lastPlaying && !playing)) {
          // Treat OS interruptions (phone call, Siri) as end-of-playback so the
          // UI returns to a coherent completed state (FR-008)
          // (001-wolof-translate-mobile:T055)
          opts.onEnded?.();
        }
        lastPlaying = playing;
      });
      player.play();
      return;
    }

    deps.speakText(result.translatedText, { language: EN_US });
  }

  function stop(): void {
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

  return { playResult, stop };
}

export const defaultPlayer: Player = makePlayer({
  createAudioPlayer: (source) => createAudioPlayer(source) as unknown as AudioPlayerLike,
  speakText: (text, options) => Speech.speak(text, options),
  stopSpeech: () => {
    void Speech.stop();
  },
  configureForPlayback,
});

export const playResult = defaultPlayer.playResult;
export const stopPlayback = defaultPlayer.stop;
