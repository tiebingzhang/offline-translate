import { deleteAsync, getInfoAsync, makeDirectoryAsync } from 'expo-file-system/legacy';

import { getDb, resetDbForTests } from '../db';
import {
  AUDIO_DIR_URI,
  HISTORY_MAX_BYTES,
  HISTORY_MAX_ROWS,
  historyRepo,
  resetAudioDirForTests,
  type HistoryEntryInsert,
} from '../history-repo';

interface DbMock {
  runAsync: jest.Mock;
  getAllAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  withTransactionAsync: jest.Mock;
  execAsync: jest.Mock;
}

async function getMockedDb(): Promise<DbMock> {
  const db = await getDb();
  return db as unknown as DbMock;
}

function row(overrides: Partial<{
  id: number;
  request_id: string;
  direction: string;
  transcribed_text: string;
  translated_text: string;
  audio_path: string;
  audio_byte_size: number;
  created_at_ms: number;
}> = {}) {
  return {
    id: 1,
    request_id: 'req-1',
    direction: 'english_to_wolof',
    transcribed_text: 'hello',
    translated_text: 'asalaa maalekum',
    audio_path: 'req-1.m4a',
    audio_byte_size: 100_000,
    created_at_ms: 1_000_000,
    ...overrides,
  };
}

const sampleInsert: HistoryEntryInsert = {
  requestId: 'req-new',
  direction: 'english_to_wolof',
  transcribedText: 'hello world',
  translatedText: 'asalaa maalekum',
  audioPath: 'req-new.m4a',
  audioByteSize: 120_000,
  createdAtMs: 2_000_000,
};

describe('historyRepo', () => {
  beforeEach(async () => {
    await resetDbForTests();
    resetAudioDirForTests();
    const db = await getMockedDb();
    db.runAsync.mockClear();
    db.getAllAsync.mockReset();
    db.getFirstAsync.mockReset();
    db.getFirstAsync.mockResolvedValue(null);
    db.withTransactionAsync.mockClear();
    (deleteAsync as jest.Mock).mockClear();
    (getInfoAsync as jest.Mock).mockReset();
    (makeDirectoryAsync as jest.Mock).mockClear();
  });

  describe('insert', () => {
    test('writes a row in a single transaction using camelCase → snake_case columns', async () => {
      const db = await getMockedDb();
      db.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
      db.getAllAsync.mockResolvedValueOnce([]);

      await historyRepo.insert(sampleInsert);

      expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
      const insertCall = db.runAsync.mock.calls.find(([sql]) =>
        String(sql).toLowerCase().startsWith('insert'),
      );
      expect(insertCall).toBeDefined();
      const [, params] = insertCall!;
      expect(params).toEqual([
        'req-new',
        'english_to_wolof',
        'hello world',
        'asalaa maalekum',
        'req-new.m4a',
        120_000,
        2_000_000,
      ]);
    });

    test('creates the audio directory before writing', async () => {
      const db = await getMockedDb();
      db.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
      db.getAllAsync.mockResolvedValueOnce([]);

      await historyRepo.insert(sampleInsert);

      expect(makeDirectoryAsync).toHaveBeenCalledWith(
        AUDIO_DIR_URI,
        expect.objectContaining({ intermediates: true }),
      );
    });

    test('20-row cap trims oldest (FR-012)', async () => {
      const db = await getMockedDb();
      // Post-insert table has 21 rows (1 new + 20 existing), oldest-first
      const rows = Array.from({ length: 21 }, (_, i) =>
        row({
          id: i + 1,
          request_id: `req-${i + 1}`,
          audio_path: `req-${i + 1}.m4a`,
          audio_byte_size: 10_000,
          created_at_ms: 1_000_000 + i,
        }),
      );
      db.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
      db.getAllAsync.mockResolvedValueOnce(rows);

      await historyRepo.insert(sampleInsert);

      const deleteCalls = db.runAsync.mock.calls.filter(([sql]) =>
        String(sql).toLowerCase().startsWith('delete'),
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][1]).toEqual([1]);
      expect(deleteAsync).toHaveBeenCalledTimes(1);
      const [unlinkUri] = (deleteAsync as jest.Mock).mock.calls[0];
      expect(unlinkUri).toContain('req-1.m4a');
    });

    test('50 MB cap trims oldest (FR-012)', async () => {
      const db = await getMockedDb();
      const bigSize = Math.floor(HISTORY_MAX_BYTES / 4); // 4 rows fit, 5 overflow
      const rows = Array.from({ length: 5 }, (_, i) =>
        row({
          id: i + 1,
          request_id: `big-${i + 1}`,
          audio_path: `big-${i + 1}.m4a`,
          audio_byte_size: bigSize,
          created_at_ms: 1_000_000 + i,
        }),
      );
      db.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
      db.getAllAsync.mockResolvedValueOnce(rows);

      await historyRepo.insert(sampleInsert);

      const deleteCalls = db.runAsync.mock.calls.filter(([sql]) =>
        String(sql).toLowerCase().startsWith('delete'),
      );
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
      expect(deleteCalls[0][1]).toEqual([1]);
    });

    test('no eviction when within both caps', async () => {
      const db = await getMockedDb();
      const rows = Array.from({ length: 3 }, (_, i) =>
        row({ id: i + 1, audio_byte_size: 1_000, created_at_ms: 1_000_000 + i }),
      );
      db.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
      db.getAllAsync.mockResolvedValueOnce(rows);

      await historyRepo.insert(sampleInsert);

      const deleteCalls = db.runAsync.mock.calls.filter(([sql]) =>
        String(sql).toLowerCase().startsWith('delete'),
      );
      expect(deleteCalls).toHaveLength(0);
      expect(deleteAsync).not.toHaveBeenCalled();
    });

    test('replacing an entry with the same request_id unlinks the prior audio file', async () => {
      const db = await getMockedDb();
      db.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
      // Prior row exists for the same request_id with a different audio path
      db.getFirstAsync.mockResolvedValueOnce(
        row({ id: 7, request_id: 'req-new', audio_path: 'req-new-old.m4a' }),
      );
      db.getAllAsync.mockResolvedValueOnce([]);

      await historyRepo.insert(sampleInsert);

      expect(deleteAsync).toHaveBeenCalledTimes(1);
      const [unlinkUri] = (deleteAsync as jest.Mock).mock.calls[0];
      expect(unlinkUri).toContain('req-new-old.m4a');
      // The DELETE by request_id happened inside the transaction
      const deleteCalls = db.runAsync.mock.calls.filter(([sql]) =>
        String(sql).toLowerCase().startsWith('delete'),
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][1]).toEqual(['req-new']);
    });

    test('TTS-only entry (empty audio_path) is stored without touching the filesystem', async () => {
      const db = await getMockedDb();
      db.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
      db.getAllAsync.mockResolvedValueOnce([]);

      await historyRepo.insert({
        ...sampleInsert,
        audioPath: '',
        audioByteSize: 0,
      });

      expect(deleteAsync).not.toHaveBeenCalled();
      const insertCall = db.runAsync.mock.calls.find(([sql]) =>
        String(sql).toLowerCase().startsWith('insert'),
      );
      expect(insertCall![1]).toEqual([
        'req-new',
        'english_to_wolof',
        'hello world',
        'asalaa maalekum',
        '',
        0,
        2_000_000,
      ]);
    });
  });

  describe('delete (FR-013c)', () => {
    test('removes row AND unlinks audio file in a single transaction', async () => {
      const db = await getMockedDb();
      db.getFirstAsync.mockResolvedValueOnce(row({ id: 42, audio_path: 'req-42.m4a' }));
      db.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      await historyRepo.delete(42);

      expect(db.withTransactionAsync).toHaveBeenCalledTimes(1);
      const deleteCalls = db.runAsync.mock.calls.filter(([sql]) =>
        String(sql).toLowerCase().startsWith('delete'),
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][1]).toEqual([42]);
      expect(deleteAsync).toHaveBeenCalledTimes(1);
      const [unlinkUri] = (deleteAsync as jest.Mock).mock.calls[0];
      expect(unlinkUri).toContain('req-42.m4a');
    });

    test('skips the filesystem unlink for TTS-only entries (empty audio_path)', async () => {
      const db = await getMockedDb();
      db.getFirstAsync.mockResolvedValueOnce(row({ id: 43, audio_path: '' }));
      db.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      await historyRepo.delete(43);

      expect(deleteAsync).not.toHaveBeenCalled();
      const deleteCalls = db.runAsync.mock.calls.filter(([sql]) =>
        String(sql).toLowerCase().startsWith('delete'),
      );
      expect(deleteCalls).toHaveLength(1);
    });

    test('is a no-op when the row does not exist', async () => {
      const db = await getMockedDb();
      db.getFirstAsync.mockResolvedValueOnce(null);
      db.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 0 });

      await historyRepo.delete(999);

      expect(deleteAsync).not.toHaveBeenCalled();
    });
  });

  describe('list (FR-013a)', () => {
    test('returns rows newest-first', async () => {
      const db = await getMockedDb();
      const rows = [
        row({ id: 3, request_id: 'newest', created_at_ms: 3_000_000 }),
        row({ id: 2, request_id: 'middle', created_at_ms: 2_000_000 }),
        row({ id: 1, request_id: 'oldest', created_at_ms: 1_000_000 }),
      ];
      db.getAllAsync.mockResolvedValueOnce(rows);
      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 100 });

      const entries = await historyRepo.list();

      expect(entries.map((e) => e.requestId)).toEqual(['newest', 'middle', 'oldest']);
      const [sql] = db.getAllAsync.mock.calls[0];
      expect(String(sql).toLowerCase()).toContain('order by created_at_ms desc');
    });

    test('prunes corrupt rows whose audio file is missing on disk', async () => {
      const db = await getMockedDb();
      const rows = [
        row({ id: 1, request_id: 'alive', audio_path: 'alive.m4a', created_at_ms: 3 }),
        row({ id: 2, request_id: 'corrupt', audio_path: 'corrupt.m4a', created_at_ms: 2 }),
        row({ id: 3, request_id: 'alive-too', audio_path: 'alive2.m4a', created_at_ms: 1 }),
      ];
      db.getAllAsync.mockResolvedValueOnce(rows);
      (getInfoAsync as jest.Mock).mockImplementation(async (uri: string) => {
        if (uri.includes('corrupt.m4a')) return { exists: false };
        return { exists: true, size: 100 };
      });
      db.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      const entries = await historyRepo.list();

      expect(entries.map((e) => e.requestId)).toEqual(['alive', 'alive-too']);
      const deleteCalls = db.runAsync.mock.calls.filter(([sql]) =>
        String(sql).toLowerCase().startsWith('delete'),
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][1]).toEqual([2]);
    });

    test('keeps TTS-only entries without checking the filesystem', async () => {
      const db = await getMockedDb();
      const rows = [
        row({ id: 5, request_id: 'tts', audio_path: '', audio_byte_size: 0 }),
      ];
      db.getAllAsync.mockResolvedValueOnce(rows);

      const entries = await historyRepo.list();

      expect(entries.map((e) => e.requestId)).toEqual(['tts']);
      expect(getInfoAsync).not.toHaveBeenCalled();
    });
  });

  test('HISTORY_MAX_ROWS and HISTORY_MAX_BYTES match FR-012', () => {
    expect(HISTORY_MAX_ROWS).toBe(20);
    expect(HISTORY_MAX_BYTES).toBe(50 * 1024 * 1024);
  });
});
