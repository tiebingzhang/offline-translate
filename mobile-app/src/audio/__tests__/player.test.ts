import type { TranslationResult } from '../../api/bff-client';
import { makePlayer, type PlayerDeps } from '../player';

function makeFakePlayer() {
  const play = jest.fn();
  const remove = jest.fn();
  const addListener = jest.fn(() => ({ remove }));
  const release = jest.fn();
  const instance = { play, pause: jest.fn(), release, addListener };
  const createAudioPlayer = jest.fn((_source: string) => instance);
  const speakText = jest.fn();
  const setPlaybackMode = jest.fn(async () => {});
  const deps: PlayerDeps = {
    createAudioPlayer,
    speakText,
    configureForPlayback: setPlaybackMode,
  };
  return { deps, instance, createAudioPlayer, speakText, setPlaybackMode };
}

const baseWolofAudio: TranslationResult = {
  requestId: 'a1b2c3d4',
  direction: 'english_to_wolof',
  targetLanguage: 'wolof',
  transcribedText: 'Good morning',
  translatedText: 'Jamm nga fanaan',
  outputMode: 'wolof_audio',
  audioUrl: '/api/requests/a1b2c3d4/audio',
  localAudioUri: 'file:///document/audio/a1b2c3d4.m4a',
  completedAtMs: 1_713_276_005_083,
};

const baseTextOnly: TranslationResult = {
  requestId: 'e5f6g7h8',
  direction: 'wolof_to_english',
  targetLanguage: 'english',
  transcribedText: 'Jamm nga fanaan',
  translatedText: 'Good morning',
  outputMode: 'text_only',
  audioUrl: null,
  localAudioUri: null,
  completedAtMs: 1_713_276_010_083,
};

describe('audio/player', () => {
  test('english_to_wolof result: creates audio player from localAudioUri and plays it', async () => {
    const { deps, createAudioPlayer, instance, setPlaybackMode } = makeFakePlayer();
    const player = makePlayer(deps);

    await player.playResult(baseWolofAudio);

    expect(setPlaybackMode).toHaveBeenCalledTimes(1);
    expect(createAudioPlayer).toHaveBeenCalledWith(
      'file:///document/audio/a1b2c3d4.m4a',
    );
    expect(instance.play).toHaveBeenCalledTimes(1);
  });

  test('english_to_wolof without localAudioUri falls back to expo-speech (graceful degradation)', async () => {
    const { deps, createAudioPlayer, speakText } = makeFakePlayer();
    const player = makePlayer(deps);

    await player.playResult({ ...baseWolofAudio, localAudioUri: null });

    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(speakText).toHaveBeenCalledTimes(1);
  });

  test('wolof_to_english text-only result: speaks translatedText in en-US', async () => {
    const { deps, speakText, createAudioPlayer } = makeFakePlayer();
    const player = makePlayer(deps);

    await player.playResult(baseTextOnly);

    expect(createAudioPlayer).not.toHaveBeenCalled();
    expect(speakText).toHaveBeenCalledWith('Good morning', {
      language: 'en-US',
    });
  });

  test('invokes onEnded callback when playback finishes naturally', async () => {
    const { deps, instance } = makeFakePlayer();
    const player = makePlayer(deps);
    const onEnded = jest.fn();

    await player.playResult(baseWolofAudio, { onEnded });

    const addListenerMock = instance.addListener as unknown as jest.Mock;
    const listenerCall = addListenerMock.mock.calls[0] as [
      string,
      (status: { didJustFinish?: boolean }) => void,
    ];
    expect(listenerCall[0]).toBe('playbackStatusUpdate');
    const listener = listenerCall[1];

    listener({ didJustFinish: true });
    expect(onEnded).toHaveBeenCalledTimes(1);

    listener({ didJustFinish: false });
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  test('stop() releases the current player and silences speech', async () => {
    const { deps, instance, speakText } = makeFakePlayer();
    const stopSpeech = jest.fn();
    const player = makePlayer({ ...deps, stopSpeech });

    await player.playResult(baseWolofAudio);
    player.stop();

    expect(instance.release).toHaveBeenCalled();
    expect(stopSpeech).toHaveBeenCalled();
    speakText.mockClear();
  });
});
