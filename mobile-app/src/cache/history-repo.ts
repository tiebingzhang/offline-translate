import {
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
} from 'expo-file-system/legacy';

import type { Direction } from '@/api/bff-client';

import { getDb, type Database } from './db';

// Real on-device Documents directory; fallback preserves behavior in web/SSR
// environments where documentDirectory may be null (001-wolof-translate-mobile:T075a)
const DOC_DIR = documentDirectory ?? 'file:///document/';
export const AUDIO_DIR_URI = `${DOC_DIR}audio/`;
export const HISTORY_MAX_ROWS = 20;
export const HISTORY_MAX_BYTES = 50 * 1024 * 1024;

export interface HistoryEntry {
  id: number;
  requestId: string;
  direction: Direction;
  transcribedText: string;
  translatedText: string;
  // Empty string when the entry replays via on-device TTS (FR-004
  // wolof_to_english path); see data-model.md §1.3 (001-wolof-translate-mobile:T075c)
  audioPath: string;
  audioByteSize: number;
  createdAtMs: number;
}

export interface HistoryEntryInsert {
  requestId: string;
  direction: Direction;
  transcribedText: string;
  translatedText: string;
  audioPath: string;
  audioByteSize: number;
  createdAtMs: number;
}

interface HistoryRow {
  id: number;
  request_id: string;
  direction: string;
  transcribed_text: string;
  translated_text: string;
  audio_path: string;
  audio_byte_size: number;
  created_at_ms: number;
}

const INSERT_SQL = `
INSERT INTO history (
  request_id, direction, transcribed_text, translated_text,
  audio_path, audio_byte_size, created_at_ms
) VALUES (?, ?, ?, ?, ?, ?, ?)
`.trim();

const SELECT_ASC_SQL = `SELECT * FROM history ORDER BY created_at_ms ASC`;
const SELECT_DESC_SQL = `SELECT * FROM history ORDER BY created_at_ms DESC`;
const SELECT_BY_REQUEST_ID_SQL = `SELECT * FROM history WHERE request_id = ?`;
const SELECT_BY_ID_SQL = `SELECT * FROM history WHERE id = ?`;
const DELETE_BY_ID_SQL = `DELETE FROM history WHERE id = ?`;
const DELETE_BY_REQUEST_ID_SQL = `DELETE FROM history WHERE request_id = ?`;

function rowToEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    requestId: row.request_id,
    direction: row.direction as Direction,
    transcribedText: row.transcribed_text,
    translatedText: row.translated_text,
    audioPath: row.audio_path,
    audioByteSize: row.audio_byte_size,
    createdAtMs: row.created_at_ms,
  };
}

function audioFileUri(audioPath: string): string {
  return `${AUDIO_DIR_URI}${audioPath}`;
}

let audioDirReady: Promise<void> | null = null;
async function ensureAudioDir(): Promise<void> {
  if (!audioDirReady) {
    audioDirReady = makeDirectoryAsync(AUDIO_DIR_URI, { intermediates: true }).catch(
      () => undefined,
    );
  }
  return audioDirReady;
}

export function resetAudioDirForTests(): void {
  audioDirReady = null;
}

async function unlinkAudio(audioPath: string): Promise<void> {
  if (!audioPath) return;
  try {
    await deleteAsync(audioFileUri(audioPath), { idempotent: true });
  } catch {
    // best-effort; the row is already gone (001-wolof-translate-mobile:T075b)
  }
}

async function collectOverflowEvictions(db: Database): Promise<{
  evictedIds: number[];
  evictedPaths: string[];
}> {
  const rows = (await db.getAllAsync(SELECT_ASC_SQL)) as HistoryRow[];
  let count = rows.length;
  let totalBytes = rows.reduce((sum, r) => sum + r.audio_byte_size, 0);
  const evictedIds: number[] = [];
  const evictedPaths: string[] = [];
  for (const row of rows) {
    if (count <= HISTORY_MAX_ROWS && totalBytes <= HISTORY_MAX_BYTES) break;
    await db.runAsync(DELETE_BY_ID_SQL, [row.id]);
    evictedIds.push(row.id);
    if (row.audio_path) evictedPaths.push(row.audio_path);
    count -= 1;
    totalBytes -= row.audio_byte_size;
  }
  return { evictedIds, evictedPaths };
}

export const historyRepo = {
  async insert(entry: HistoryEntryInsert): Promise<void> {
    await ensureAudioDir();
    const db = await getDb();
    const pathsToUnlink: string[] = [];

    // SQL work happens in a single transaction so COUNT/SUM invariants hold
    // across crashes; file unlinks run AFTER commit because the filesystem
    // can't roll back with the DB (001-wolof-translate-mobile:T075b)
    await db.withTransactionAsync(async () => {
      const prior = (await db.getFirstAsync(SELECT_BY_REQUEST_ID_SQL, [
        entry.requestId,
      ])) as HistoryRow | null;
      if (prior) {
        await db.runAsync(DELETE_BY_REQUEST_ID_SQL, [entry.requestId]);
        if (prior.audio_path && prior.audio_path !== entry.audioPath) {
          pathsToUnlink.push(prior.audio_path);
        }
      }
      await db.runAsync(INSERT_SQL, [
        entry.requestId,
        entry.direction,
        entry.transcribedText,
        entry.translatedText,
        entry.audioPath,
        entry.audioByteSize,
        entry.createdAtMs,
      ]);
      const { evictedPaths } = await collectOverflowEvictions(db);
      for (const p of evictedPaths) pathsToUnlink.push(p);
    });

    for (const path of pathsToUnlink) {
      await unlinkAudio(path);
    }
  },

  async delete(id: number): Promise<void> {
    const db = await getDb();
    let audioPath = '';
    await db.withTransactionAsync(async () => {
      const row = (await db.getFirstAsync(SELECT_BY_ID_SQL, [id])) as HistoryRow | null;
      if (!row) return;
      audioPath = row.audio_path;
      await db.runAsync(DELETE_BY_ID_SQL, [id]);
    });
    if (audioPath) {
      await unlinkAudio(audioPath);
    }
  },

  async list(): Promise<HistoryEntry[]> {
    const db = await getDb();
    const rows = (await db.getAllAsync(SELECT_DESC_SQL)) as HistoryRow[];
    const alive: HistoryEntry[] = [];
    const corruptIds: number[] = [];
    for (const row of rows) {
      // TTS-only entries have no audio file; skip existence check (FR-004
      // wolof_to_english, FR-011) (001-wolof-translate-mobile:T075c)
      if (!row.audio_path) {
        alive.push(rowToEntry(row));
        continue;
      }
      let exists = false;
      try {
        const info = await getInfoAsync(audioFileUri(row.audio_path));
        exists = !!info.exists;
      } catch {
        exists = false;
      }
      if (exists) {
        alive.push(rowToEntry(row));
      } else {
        corruptIds.push(row.id);
      }
    }
    for (const id of corruptIds) {
      await db.runAsync(DELETE_BY_ID_SQL, [id]);
    }
    return alive;
  },
};
