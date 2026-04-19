import * as SQLite from 'expo-sqlite';

export type Database = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;

const DB_NAME = 'history.db';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id      TEXT    NOT NULL UNIQUE,
  direction       TEXT    NOT NULL CHECK (direction IN ('english_to_wolof','wolof_to_english')),
  transcribed_text TEXT   NOT NULL,
  translated_text TEXT    NOT NULL,
  audio_path      TEXT    NOT NULL,
  audio_byte_size INTEGER NOT NULL,
  created_at_ms   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_created_at_desc
  ON history (created_at_ms DESC);

CREATE TABLE IF NOT EXISTS pending_jobs (
  request_id            TEXT    PRIMARY KEY,
  direction             TEXT    NOT NULL,
  captured_audio_path   TEXT    NOT NULL,
  recorded_duration_sec REAL    NOT NULL,
  started_at_ms         INTEGER NOT NULL,
  timeout_at_ms         INTEGER NOT NULL
);
`.trim();

let dbPromise: Promise<Database> | null = null;

async function openAndInit(): Promise<Database> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync(SCHEMA_SQL);
  return db;
}

export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = openAndInit();
  }
  return dbPromise;
}

export async function resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
  }
  dbPromise = null;
}
