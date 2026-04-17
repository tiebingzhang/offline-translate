import { deleteAsync, getInfoAsync } from 'expo-file-system/legacy';

import type { Direction } from '@/api/bff-client';

import { getDb, type Database } from './db';

export const AUDIO_DIR_URI = 'file:///document/audio/';
export const HISTORY_MAX_ROWS = 20;
export const HISTORY_MAX_BYTES = 50 * 1024 * 1024;

export interface HistoryEntry {
  id: number;
  requestId: string;
  direction: Direction;
  transcribedText: string;
  translatedText: string;
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
INSERT OR REPLACE INTO history (
  request_id, direction, transcribed_text, translated_text,
  audio_path, audio_byte_size, created_at_ms
) VALUES (?, ?, ?, ?, ?, ?, ?)
`.trim();

const SELECT_ASC_SQL = `SELECT * FROM history ORDER BY created_at_ms ASC`;
const SELECT_DESC_SQL = `SELECT * FROM history ORDER BY created_at_ms DESC`;
const DELETE_BY_ID_SQL = `DELETE FROM history WHERE id = ?`;
const SELECT_BY_ID_SQL = `SELECT * FROM history WHERE id = ?`;

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

async function unlinkAudio(audioPath: string): Promise<void> {
  try {
    await deleteAsync(audioFileUri(audioPath), { idempotent: true });
  } catch {
    // best-effort (001-wolof-translate-mobile:T069)
  }
}

async function collectOverflowEvictions(db: Database): Promise<string[]> {
  const rows = (await db.getAllAsync(SELECT_ASC_SQL)) as HistoryRow[];
  let count = rows.length;
  let totalBytes = rows.reduce((sum, r) => sum + r.audio_byte_size, 0);
  const evicted: string[] = [];
  for (const row of rows) {
    if (count <= HISTORY_MAX_ROWS && totalBytes <= HISTORY_MAX_BYTES) break;
    await db.runAsync(DELETE_BY_ID_SQL, [row.id]);
    evicted.push(row.audio_path);
    count -= 1;
    totalBytes -= row.audio_byte_size;
  }
  return evicted;
}

export const historyRepo = {
  async insert(entry: HistoryEntryInsert): Promise<void> {
    const db = await getDb();
    await db.runAsync(INSERT_SQL, [
      entry.requestId,
      entry.direction,
      entry.transcribedText,
      entry.translatedText,
      entry.audioPath,
      entry.audioByteSize,
      entry.createdAtMs,
    ]);
    const evictedPaths = await collectOverflowEvictions(db);
    for (const path of evictedPaths) {
      await unlinkAudio(path);
    }
  },

  async delete(id: number): Promise<void> {
    const db = await getDb();
    const row = (await db.getFirstAsync(SELECT_BY_ID_SQL, [id])) as HistoryRow | null;
    if (!row) return;
    await db.runAsync(DELETE_BY_ID_SQL, [id]);
    await unlinkAudio(row.audio_path);
  },

  async list(): Promise<HistoryEntry[]> {
    const db = await getDb();
    const rows = (await db.getAllAsync(SELECT_DESC_SQL)) as HistoryRow[];
    const alive: HistoryEntry[] = [];
    const corruptIds: number[] = [];
    for (const row of rows) {
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
