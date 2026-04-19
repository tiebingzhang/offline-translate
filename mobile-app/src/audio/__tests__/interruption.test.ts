// Phase 5 / US4 — audio interruption coherence (FR-008)
// (001-wolof-translate-mobile:T079)
import type { TranslationResult } from '@/api/bff-client';
import { makePlayer, type PlayerDeps } from '@/audio/player';
import { subscribeToInterruptions, type InterruptionEvent } from '@/audio/session';

type StatusListener = (status: { playing?: boolean; didJustFinish?: boolean }) => void;

interface FakePlayerHandle {
  play: jest.Mock;
  pause: jest.Mock;
  release: jest.Mock;
  addListener: jest.Mock;
  emitStatus: (status: { playing?: boolean; didJustFinish?: boolean }) => void;
}

function makeFakePlayer(): FakePlayerHandle {
  const listeners: StatusListener[] = [];
  const play = jest.fn();
  const pause = jest.fn();
  const release = jest.fn();
  const addListener = jest.fn((event: string, listener: StatusListener) => {
    if (event === 'playbackStatusUpdate') listeners.push(listener);
    return {
      remove: () => {
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      },
    };
  });
  return {
    play,
    pause,
    release,
    addListener,
    emitStatus: (status) => listeners.forEach((l) => l(status)),
  };
}

function makePlayerForResult() {
  const handle = makeFakePlayer();
  const speakText = jest.fn();
  const stopSpeech = jest.fn();
  const setPlaybackMode = jest.fn(async () => {});
  const deps: PlayerDeps = {
    createAudioPlayer: jest.fn(() => handle as unknown as ReturnType<PlayerDeps['createAudioPlayer']>),
    speakText,
    stopSpeech,
    configureForPlayback: setPlaybackMode,
  };
  return { handle, deps, speakText, stopSpeech };
}

const wolofResult: TranslationResult = {
  requestId: 'req-int-1',
  direction: 'english_to_wolof',
  targetLanguage: 'wolof',
  transcribedText: 'Good morning',
  translatedText: 'Jamm nga fanaan',
  outputMode: 'wolof_audio',
  audioUrl: '/api/requests/req-int-1/audio',
  localAudioUri: 'file:///document/audio/req-int-1.m4a',
  completedAtMs: 2_000_000,
};

describe('audio interruption coherence (Phase 5 / US4 / FR-008)', () => {
  test('OS interruption begin during playback fires onEnded (coherent state)', async () => {
    const { handle, deps } = makePlayerForResult();
    const onEnded = jest.fn();
    const player = makePlayer(deps);

    await player.playResult(wolofResult, { onEnded });
    expect(handle.play).toHaveBeenCalledTimes(1);

    // Begin: simulate playback going from playing → not playing without
    // didJustFinish — that is how an OS interruption surfaces in expo-audio.
    handle.emitStatus({ playing: true });
    handle.emitStatus({ playing: false });

    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  test('natural finish also fires onEnded exactly once (no double-fire on interruption afterward)', async () => {
    const { handle, deps } = makePlayerForResult();
    const onEnded = jest.fn();
    const player = makePlayer(deps);

    await player.playResult(wolofResult, { onEnded });
    handle.emitStatus({ playing: true });
    handle.emitStatus({ didJustFinish: true });
    expect(onEnded).toHaveBeenCalledTimes(1);

    // Subsequent stray status events must not double-fire onEnded
    handle.emitStatus({ playing: false });
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  test('subscribeToInterruptions surfaces began on playing → not-playing transition', () => {
    const handle = makeFakePlayer();
    const events: InterruptionEvent[] = [];
    const sub = subscribeToInterruptions(
      handle as unknown as Parameters<typeof subscribeToInterruptions>[0],
      (e) => events.push(e),
    );

    handle.emitStatus({ playing: true });
    handle.emitStatus({ playing: false });
    expect(events).toEqual([{ kind: 'began' }]);

    handle.emitStatus({ playing: true });
    expect(events).toEqual([{ kind: 'began' }, { kind: 'ended' }]);

    sub.remove();
  });

  test('didJustFinish does NOT count as began (natural end is not an interruption)', () => {
    const handle = makeFakePlayer();
    const events: InterruptionEvent[] = [];
    subscribeToInterruptions(
      handle as unknown as Parameters<typeof subscribeToInterruptions>[0],
      (e) => events.push(e),
    );

    handle.emitStatus({ playing: true });
    handle.emitStatus({ playing: false, didJustFinish: true });
    expect(events).toEqual([]);
  });

  test('subscription remove() unsubscribes and is idempotent', () => {
    const handle = makeFakePlayer();
    const events: InterruptionEvent[] = [];
    const sub = subscribeToInterruptions(
      handle as unknown as Parameters<typeof subscribeToInterruptions>[0],
      (e) => events.push(e),
    );

    sub.remove();
    expect(() => sub.remove()).not.toThrow();

    handle.emitStatus({ playing: true });
    handle.emitStatus({ playing: false });
    expect(events).toEqual([]);
  });
});
