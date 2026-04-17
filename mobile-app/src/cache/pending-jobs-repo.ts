import type { Direction } from '@/api/bff-client';

import { getDb } from './db';

export interface PendingJob {
  requestId: string;
  direction: Direction;
  capturedAudioPath: string;
  recordedDurationSec: number;
  startedAtMs: number;
  timeoutAtMs: number;
}

export interface ResumeResult {
  live: PendingJob[];
  expired: PendingJob[];
}

interface PendingJobRow {
  request_id: string;
  direction: string;
  captured_audio_path: string;
  recorded_duration_sec: number;
  started_at_ms: number;
  timeout_at_ms: number;
}

function rowToJob(row: PendingJobRow): PendingJob {
  return {
    requestId: row.request_id,
    direction: row.direction as Direction,
    capturedAudioPath: row.captured_audio_path,
    recordedDurationSec: row.recorded_duration_sec,
    startedAtMs: row.started_at_ms,
    timeoutAtMs: row.timeout_at_ms,
  };
}

const INSERT_SQL = `
INSERT OR REPLACE INTO pending_jobs (
  request_id, direction, captured_audio_path,
  recorded_duration_sec, started_at_ms, timeout_at_ms
) VALUES (?, ?, ?, ?, ?, ?)
`.trim();

const DELETE_SQL = `DELETE FROM pending_jobs WHERE request_id = ?`;
const SELECT_ALL_SQL = `SELECT * FROM pending_jobs`;

export const pendingJobsRepo = {
  async insert(job: PendingJob): Promise<void> {
    const db = await getDb();
    await db.runAsync(INSERT_SQL, [
      job.requestId,
      job.direction,
      job.capturedAudioPath,
      job.recordedDurationSec,
      job.startedAtMs,
      job.timeoutAtMs,
    ]);
  },

  async delete(requestId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(DELETE_SQL, [requestId]);
  },

  async resumeAll(nowMs: number = Date.now()): Promise<ResumeResult> {
    const db = await getDb();
    const rows = (await db.getAllAsync(SELECT_ALL_SQL)) as PendingJobRow[];
    const live: PendingJob[] = [];
    const expired: PendingJob[] = [];
    for (const row of rows) {
      const job = rowToJob(row);
      if (job.timeoutAtMs > nowMs) {
        live.push(job);
      } else {
        expired.push(job);
      }
    }
    for (const job of expired) {
      await db.runAsync(DELETE_SQL, [job.requestId]);
    }
    return { live, expired };
  },
};
