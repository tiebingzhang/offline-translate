import 'react-native-url-polyfill/auto';
import 'fast-text-encoding';

jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(),
  useAudioPlayer: jest.fn(),
  setAudioModeAsync: jest.fn(async () => {}),
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingOptionsPresets: {
    HIGH_QUALITY: {},
  },
  IOSOutputFormat: {
    MPEG4AAC: 'aac',
  },
  AudioQuality: {
    MEDIUM: 'medium',
  },
}));

jest.mock('expo-file-system', () => ({
  Paths: {
    document: { uri: 'file:///document/' },
    cache: { uri: 'file:///cache/' },
  },
  File: jest.fn(),
  Directory: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => {
  const uploadAsync = jest.fn(async () => ({ status: 202, body: '{}' }));
  // createUploadTask wraps the same uploadAsync mock so existing tests that
  // override uploadAsync continue to drive both code paths
  // (001-wolof-translate-mobile:T083)
  const createUploadTask = jest.fn(
    (
      _url: string,
      _fileUri: string,
      _options: unknown,
      _callback?: (data: { totalBytesSent: number; totalBytesExpectedToSend: number }) => void,
    ) => ({
      uploadAsync: () => uploadAsync(),
      cancelAsync: jest.fn(async () => {}),
    }),
  );
  return {
    uploadAsync,
    createUploadTask,
    downloadAsync: jest.fn(async () => ({ status: 200, uri: 'file:///document/audio/test.m4a' })),
    getInfoAsync: jest.fn(async () => ({ exists: false })),
    makeDirectoryAsync: jest.fn(async () => {}),
    deleteAsync: jest.fn(async () => {}),
    documentDirectory: 'file:///document/',
    cacheDirectory: 'file:///cache/',
    FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
    FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  };
});

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(async () => false),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-sqlite', () => {
  const execAsync = jest.fn(async () => {});
  const runAsync = jest.fn(async () => ({ lastInsertRowId: 1, changes: 1 }));
  const getAllAsync = jest.fn(async () => []);
  const getFirstAsync = jest.fn(async () => null);
  const closeAsync = jest.fn(async () => {});
  const withTransactionAsync = jest.fn(async (fn: () => Promise<void>) => fn());
  return {
    openDatabaseAsync: jest.fn(async () => ({
      execAsync,
      runAsync,
      getAllAsync,
      getFirstAsync,
      closeAsync,
      withTransactionAsync,
    })),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: jest.fn(async (k: string) => {
        store.delete(k);
      }),
      clear: jest.fn(async () => {
        store.clear();
      }),
      getAllKeys: jest.fn(async () => Array.from(store.keys())),
      multiGet: jest.fn(async (keys: string[]) => keys.map((k) => [k, store.get(k) ?? null])),
      multiSet: jest.fn(async (pairs: [string, string][]) => {
        pairs.forEach(([k, v]) => store.set(k, v));
      }),
    },
  };
});

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-linking', () => ({
  openSettings: jest.fn(async () => {}),
  openURL: jest.fn(async () => {}),
  createURL: jest.fn((path: string) => `wolof-translate://${path}`),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }]),
}));
