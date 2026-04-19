import '@/i18n';
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import DevPanelSheet from '@/components/DevPanelSheet';
import { useSettingsStore } from '@/state/settings-store';
import { useDevLogStore } from '@/state/dev-log-store';
import { usePipelineStore } from '@/state/pipeline-store';
import { initialPipelineState } from '@/pipeline/state-machine';
import type { JobState } from '@/api/bff-client';

// expo-document-picker is mocked in jest.setup.ts with a default
// { canceled: true } response; individual tests can override via jest.mocked().
// (001-wolof-translate-mobile:T089)
import * as DocumentPicker from 'expo-document-picker';

// FR-015a preview tests need a createAudioPlayer spy — jest.setup.ts does not
// ship one because only DevPanelSheet uses it directly. We augment the
// existing expo-audio mock here with a minimal factory that returns a play /
// addListener pair the handler can drive. (001-wolof-translate-mobile:T089)
const mockPlay = jest.fn();
const mockAddListener = jest.fn(() => ({ remove: jest.fn() }));
const mockRelease = jest.fn();
const mockRemove = jest.fn();
const mockCreateAudioPlayer = jest.fn((_source: string) => ({
  play: mockPlay,
  addListener: mockAddListener,
  release: mockRelease,
  remove: mockRemove,
}));
jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(),
  useAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => {}),
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingOptionsPresets: { HIGH_QUALITY: {} },
  IOSOutputFormat: { MPEG4AAC: 'aac' },
  AudioQuality: { MEDIUM: 'medium' },
  createAudioPlayer: (source: string) => mockCreateAudioPlayer(source),
}));

function resetStoresForTest(opts: { devModeEnabled?: boolean } = {}): void {
  useSettingsStore.setState({
    tapMode: false,
    devModeEnabled: opts.devModeEnabled ?? false,
    backendUrlOverride: null,
  });
  useDevLogStore.setState({ entries: [], nextSeq: 1 });
  usePipelineStore.setState({
    ...usePipelineStore.getState(),
    ...initialPipelineState,
    lastJobState: null,
  });
}

describe('DevPanelSheet — wired behavior (T089)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStoresForTest();
  });

  test('dev-mode switch flips settings-store.devModeEnabled', () => {
    const tree = render(<DevPanelSheet />);
    expect(useSettingsStore.getState().devModeEnabled).toBe(false);

    const toggle = tree.getByTestId('DevPanelSheet.devModeSwitch');
    fireEvent(toggle, 'valueChange', true);

    expect(useSettingsStore.getState().devModeEnabled).toBe(true);

    fireEvent(toggle, 'valueChange', false);
    expect(useSettingsStore.getState().devModeEnabled).toBe(false);
  });

  test('backend URL input: valid URL persists to settings-store via Save', () => {
    resetStoresForTest({ devModeEnabled: true });
    const tree = render(<DevPanelSheet />);
    const input = tree.getByTestId('DevPanelSheet.backendUrlInput');
    fireEvent.changeText(input, 'https://bff.staging.example.com');

    const save = tree.getByTestId('DevPanelSheet.backendUrlSave');
    fireEvent.press(save);

    expect(useSettingsStore.getState().backendUrlOverride).toBe(
      'https://bff.staging.example.com',
    );
  });

  test('backend URL input: invalid URL shows inline error and does not persist', () => {
    resetStoresForTest({ devModeEnabled: true });
    const tree = render(<DevPanelSheet />);
    const input = tree.getByTestId('DevPanelSheet.backendUrlInput');
    fireEvent.changeText(input, 'not a url');

    const save = tree.getByTestId('DevPanelSheet.backendUrlSave');
    fireEvent.press(save);

    expect(useSettingsStore.getState().backendUrlOverride).toBe(null);
    expect(tree.getByTestId('DevPanelSheet.backendUrlError')).toBeTruthy();
  });

  test('backend URL input: empty string clears the override', () => {
    resetStoresForTest({ devModeEnabled: true });
    useSettingsStore.setState({ backendUrlOverride: 'https://old.example.com' });
    const tree = render(<DevPanelSheet />);
    const input = tree.getByTestId('DevPanelSheet.backendUrlInput');
    fireEvent.changeText(input, '');

    const save = tree.getByTestId('DevPanelSheet.backendUrlSave');
    fireEvent.press(save);

    expect(useSettingsStore.getState().backendUrlOverride).toBe(null);
  });

  test('Clear button empties dev-log-store.entries', () => {
    resetStoresForTest({ devModeEnabled: true });
    useDevLogStore.getState().append({ level: 'info', tag: 't', message: 'one' });
    useDevLogStore.getState().append({ level: 'info', tag: 't', message: 'two' });
    expect(useDevLogStore.getState().entries).toHaveLength(2);

    const tree = render(<DevPanelSheet />);
    const clearBtn = tree.getByTestId('DevPanelSheet.eventLogClear');
    fireEvent.press(clearBtn);

    expect(useDevLogStore.getState().entries).toHaveLength(0);
  });

  test('file-picker trigger calls expo-document-picker.getDocumentAsync', async () => {
    resetStoresForTest({ devModeEnabled: true });
    const spy = jest
      .mocked(DocumentPicker.getDocumentAsync)
      .mockResolvedValueOnce({ canceled: true, assets: null } as never);

    const tree = render(<DevPanelSheet />);
    const trigger = tree.getByTestId('DevPanelSheet.filePickerTrigger');

    // The handler is async and dispatches log-store writes — wrap in act so
    // test-renderer observes the resulting updates in one frame.
    // (001-wolof-translate-mobile:T089)
    await act(async () => {
      fireEvent.press(trigger);
      await Promise.resolve();
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0]![0];
    expect(args).toMatchObject({ type: expect.any(Array) });
  });

  test('gated panels hidden when devModeEnabled is false (FR-014)', () => {
    resetStoresForTest({ devModeEnabled: false });
    const tree = render(<DevPanelSheet />);
    // Switch is always rendered; all gated controls MUST NOT render.
    expect(tree.getByTestId('DevPanelSheet.devModeSwitch')).toBeTruthy();
    expect(tree.queryByTestId('DevPanelSheet.backendUrlInput')).toBeNull();
    expect(tree.queryByTestId('DevPanelSheet.filePickerTrigger')).toBeNull();
    expect(tree.queryByTestId('DevPanelSheet.eventLogList')).toBeNull();
    expect(tree.queryByTestId('DevPanelSheet.rawResponseText')).toBeNull();
  });

  test('FR-015a: Preview disabled when no capture', () => {
    resetStoresForTest({ devModeEnabled: true });
    // capturedAudioUri starts null via initialPipelineState; confirm the
    // trigger renders but is disabled and does not spin up an audio player.
    // (001-wolof-translate-mobile:T089)
    expect(usePipelineStore.getState().capturedAudioUri).toBeNull();
    const tree = render(<DevPanelSheet />);
    const trigger = tree.getByTestId('DevPanelSheet.previewTrigger');
    expect(trigger).toBeTruthy();
    expect(trigger.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(trigger);
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
    expect(mockPlay).not.toHaveBeenCalled();
  });

  test('FR-015a: Preview press invokes createAudioPlayer and play() when capturedAudioUri set', () => {
    resetStoresForTest({ devModeEnabled: true });
    const uri = 'file:///cache/audio/captured-abc.m4a';
    usePipelineStore.setState({
      ...usePipelineStore.getState(),
      capturedAudioUri: uri,
    });
    const tree = render(<DevPanelSheet />);
    const trigger = tree.getByTestId('DevPanelSheet.previewTrigger');
    expect(trigger.props.accessibilityState?.disabled).toBe(false);

    fireEvent.press(trigger);

    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockCreateAudioPlayer).toHaveBeenCalledWith(uri);
    expect(mockPlay).toHaveBeenCalledTimes(1);
  });

  test('FR-015c: raw-response surface shows empty placeholder when lastJobState is null', () => {
    resetStoresForTest({ devModeEnabled: true });
    expect(usePipelineStore.getState().lastJobState).toBeNull();
    const tree = render(<DevPanelSheet />);
    // Copy pulled verbatim from messages.ts 'devPanel.rawResponse.empty'.
    // (001-wolof-translate-mobile:T089)
    expect(tree.getByText('No response yet.')).toBeTruthy();
  });

  test('FR-015c: raw-response surface renders JSON-stringified lastJobState fixture', () => {
    resetStoresForTest({ devModeEnabled: true });
    const fixture: JobState = {
      requestId: 'devpanel-fixture-req-42',
      status: 'completed',
      stage: 'completed',
      stageDetail: null,
      direction: 'english_to_wolof',
      targetLanguage: 'wolof',
      result: {
        direction: 'english_to_wolof',
        targetLanguage: 'wolof',
        transcribedText: 'Good morning',
        translatedText: 'Jamm nga fanaan',
        outputMode: 'wolof_audio',
        audioUrl: '/api/requests/devpanel-fixture-req-42/audio',
      },
      error: null,
      pollAfterMs: 500,
      completedAtMs: 1_700_000_000_000,
    };
    usePipelineStore.setState({
      ...usePipelineStore.getState(),
      lastJobState: fixture,
    });

    const tree = render(<DevPanelSheet />);
    const rawText = tree.getByTestId('DevPanelSheet.rawResponseText');
    // The component emits JSON.stringify(state, null, 2); assert on a
    // distinctive substring so we do not over-pin to whitespace ordering.
    // (001-wolof-translate-mobile:T089)
    expect(rawText.props.children).toEqual(expect.stringContaining('devpanel-fixture-req-42'));
    expect(rawText.props.children).toEqual(expect.stringContaining('"status": "completed"'));
    expect(rawText.props.children).toEqual(expect.stringContaining('"direction": "english_to_wolof"'));
  });
});
