import { getDb, resetDbForTests } from '../db';
import { pendingJobsRepo } from '../pending-jobs-repo';
import type { PendingJob } from '../pending-jobs-repo';

const sampleJob: PendingJob = {
  requestId: 'a1b2c3d4',
  direction: 'english_to_wolof',
  capturedAudioPath: 'file:///cache/in-flight/local-1.m4a',
  recordedDurationSec: 3.2,
  startedAtMs: 1_000_000,
  timeoutAtMs: 1_000_000 + 33_200,
};

async function getMockedDb() {
  const db = await getDb();
  return db as unknown as {
    runAsync: jest.Mock;
    getAllAsync: jest.Mock;
    withTransactionAsync: jest.Mock;
    execAsync: jest.Mock;
  };
}

describe('pendingJobsRepo', () => {
  beforeEach(async () => {
    await resetDbForTests();
    const db = await getMockedDb();
    db.runAsync.mockClear();
    db.getAllAsync.mockClear();
    db.withTransactionAsync.mockClear();
  });

  describe('insert', () => {
    test('writes a row using camelCase → snake_case column names', async () => {
      const db = await getMockedDb();
      db.runAsync.mockResolvedValueOnce({ lastInsertRowId: 0, changes: 1 });

      await pendingJobsRepo.insert(sampleJob);

      expect(db.runAsync).toHaveBeenCalledTimes(1);
      const [sql, params] = db.runAsync.mock.calls[0];
      expect(String(sql).toLowerCase()).toContain('insert');
      expect(String(sql)).toContain('pending_jobs');
      expect(params).toEqual([
        'a1b2c3d4',
        'english_to_wolof',
        'file:///cache/in-flight/local-1.m4a',
        3.2,
        1_000_000,
        1_000_000 + 33_200,
      ]);
    });
  });

  describe('delete', () => {
    test('deletes by requestId', async () => {
      const db = await getMockedDb();
      db.runAsync.mockResolvedValueOnce({ lastInsertRowId: 0, changes: 1 });

      await pendingJobsRepo.delete('a1b2c3d4');

      expect(db.runAsync).toHaveBeenCalledTimes(1);
      const [sql, params] = db.runAsync.mock.calls[0];
      expect(String(sql).toLowerCase()).toContain('delete');
      expect(String(sql)).toContain('pending_jobs');
      expect(params).toEqual(['a1b2c3d4']);
    });
  });

  describe('resumeAll', () => {
    test('returns rows whose timeout_at_ms > now as live, and surfaces expired rows separately', async () => {
      const now = 2_000_000;
      const liveRow = {
        request_id: 'live-1',
        direction: 'english_to_wolof',
        captured_audio_path: 'file:///cache/live.m4a',
        recorded_duration_sec: 5,
        started_at_ms: 1_990_000,
        timeout_at_ms: 2_050_000,
      };
      const expiredRow = {
        request_id: 'expired-1',
        direction: 'wolof_to_english',
        captured_audio_path: 'file:///cache/expired.m4a',
        recorded_duration_sec: 2,
        started_at_ms: 1_900_000,
        timeout_at_ms: 1_950_000,
      };

      const db = await getMockedDb();
      db.getAllAsync.mockResolvedValueOnce([liveRow, expiredRow]);
      db.runAsync.mockResolvedValueOnce({ lastInsertRowId: 0, changes: 1 });

      const result = await pendingJobsRepo.resumeAll(now);

      expect(result.live).toEqual([
        {
          requestId: 'live-1',
          direction: 'english_to_wolof',
          capturedAudioPath: 'file:///cache/live.m4a',
          recordedDurationSec: 5,
          startedAtMs: 1_990_000,
          timeoutAtMs: 2_050_000,
        },
      ]);
      expect(result.expired).toEqual([
        {
          requestId: 'expired-1',
          direction: 'wolof_to_english',
          capturedAudioPath: 'file:///cache/expired.m4a',
          recordedDurationSec: 2,
          startedAtMs: 1_900_000,
          timeoutAtMs: 1_950_000,
        },
      ]);
    });

    test('deletes expired rows during resumeAll (cleanup pass)', async () => {
      const now = 2_000_000;
      const expiredRow = {
        request_id: 'expired-1',
        direction: 'wolof_to_english',
        captured_audio_path: 'file:///cache/expired.m4a',
        recorded_duration_sec: 2,
        started_at_ms: 1_900_000,
        timeout_at_ms: 1_950_000,
      };

      const db = await getMockedDb();
      db.getAllAsync.mockResolvedValueOnce([expiredRow]);
      db.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 1 });

      await pendingJobsRepo.resumeAll(now);

      const deleteCalls = db.runAsync.mock.calls.filter(([sql]) =>
        String(sql).toLowerCase().includes('delete'),
      );
      expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
      expect(deleteCalls[0][1]).toEqual(['expired-1']);
    });

    test('returns empty result when no rows exist', async () => {
      const db = await getMockedDb();
      db.getAllAsync.mockResolvedValueOnce([]);

      const result = await pendingJobsRepo.resumeAll(2_000_000);

      expect(result.live).toEqual([]);
      expect(result.expired).toEqual([]);
    });
  });
});
