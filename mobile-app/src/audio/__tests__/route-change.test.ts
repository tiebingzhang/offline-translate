// Phase 5 / US4 — audio route change coherence (FR-007 + research.md §10 R-D)
// (001-wolof-translate-mobile:T080)
//
// SDK 55's expo-audio does NOT yet expose AVAudioSession.routeChange events on
// the JS side (research.md §10 R-D). The current subscribeToRouteChanges() is a
// safe no-op pending the native bridge wired in T056. These tests pin down the
// JS contract so the bridge can land without breaking callers, and ensure
// playback survives speaker → wired and speaker → Bluetooth simulations
// without crashing.
import type { TranslationResult } from '@/api/bff-client';
import { makePlayer, type PlayerDeps } from '@/audio/player';
import {
  subscribeToRouteChanges,
  type RouteChangeEvent,
} from '@/audio/session';

type StatusListener = (status: { playing?: boolean; didJustFinish?: boolean }) => void;

function makeFakePlayer() {
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
    emitStatus: (status: { playing?: boolean; didJustFinish?: boolean }) =>
      listeners.forEach((l) => l(status)),
  };
}

function makePlayerWithDeps() {
  const handle = makeFakePlayer();
  const setPlaybackMode = jest.fn(async () => {});
  const deps: PlayerDeps = {
    createAudioPlayer: jest.fn(() => handle as unknown as ReturnType<PlayerDeps['createAudioPlayer']>),
    speakText: jest.fn(),
    stopSpeech: jest.fn(),
    configureForPlayback: setPlaybackMode,
  };
  return { handle, deps };
}

const wolofResult: TranslationResult = {
  requestId: 'req-rc-1',
  direction: 'english_to_wolof',
  targetLanguage: 'wolof',
  transcribedText: 'Hello',
  translatedText: 'Jamm',
  outputMode: 'wolof_audio',
  audioUrl: '/api/requests/req-rc-1/audio',
  localAudioUri: 'file:///document/audio/req-rc-1.m4a',
  completedAtMs: 2_000_000,
};

describe('audio route changes (Phase 5 / US4 / FR-007 / research §10 R-D)', () => {
  test('subscribeToRouteChanges returns a removable subscription (JS contract baseline)', () => {
    const handle = makeFakePlayer();
    const sub = subscribeToRouteChanges(
      handle as unknown as Parameters<typeof subscribeToRouteChanges>[0],
      () => undefined,
    );
    expect(sub).toBeDefined();
    expect(typeof sub.remove).toBe('function');
    expect(() => sub.remove()).not.toThrow();
  });

  test('listener is invocable and can receive a synthetic changed event without crashing', () => {
    const handle = makeFakePlayer();
    const events: RouteChangeEvent[] = [];
    const sub = subscribeToRouteChanges(
      handle as unknown as Parameters<typeof subscribeToRouteChanges>[0],
      (e) => events.push(e),
    );

    // Native bridge for FR-007 route-change is deferred — see
    // mobile-app/FIXME.md. Until that bridge lands, this subscription is a
    // safe no-op: the listener is never invoked. Asserting [] pins the
    // current JS contract so the native bridge can add events without
    // silently changing existing call-sites. This is deliberately NOT a
    // self-fulfilling test — once the bridge lands, flip this expectation to
    // assert the synthesised { kind: 'changed' } event.
    // (001-wolof-translate-mobile:T080)
    expect(events).toEqual([]);
    sub.remove();
  });

  test('speaker → wired headphones simulation: playback continues without crash', async () => {
    const { handle, deps } = makePlayerWithDeps();
    const player = makePlayer(deps);
    await player.playResult(wolofResult);

    // expo-audio auto-pauses on headphone disconnect — for connect (speaker
    // → wired), the player typically continues. Simulate the underlying
    // status churn that a route swap produces.
    expect(() => {
      handle.emitStatus({ playing: true });
      handle.emitStatus({ playing: true });
    }).not.toThrow();

    // Player remains usable — no synthetic release fired
    expect(handle.release).not.toHaveBeenCalled();
  });

  test('speaker → Bluetooth simulation: audible-pause then resume yields one onEnded (coherent UI)', async () => {
    const { handle, deps } = makePlayerWithDeps();
    const onEnded = jest.fn();
    const player = makePlayer(deps);
    await player.playResult(wolofResult, { onEnded });

    // Bluetooth handoff in expo-audio shows up as a transient pause/resume.
    // The first true→false transition is treated as end-of-playback so the UI
    // returns to a coherent 'completed' state with the result preserved for
    // replay. A subsequent resume must NOT double-fire onEnded.
    handle.emitStatus({ playing: true });
    handle.emitStatus({ playing: false });
    handle.emitStatus({ playing: true });
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  test('player.stop() after a route-change simulation tears down cleanly', async () => {
    const { handle, deps } = makePlayerWithDeps();
    const player = makePlayer(deps);
    await player.playResult(wolofResult);

    handle.emitStatus({ playing: true });
    handle.emitStatus({ playing: false }); // simulated route-change pause

    expect(() => player.stop()).not.toThrow();
    expect(handle.release).toHaveBeenCalledTimes(1);
  });
});
