import { create } from 'zustand';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DevLogEntry {
  seq: number;
  atMs: number;
  level: LogLevel;
  tag: string;
  message: string;
  meta?: Record<string, unknown>;
}

interface DevLogState {
  entries: DevLogEntry[];
  nextSeq: number;
  append: (entry: Omit<DevLogEntry, 'seq' | 'atMs'> & { atMs?: number }) => void;
  clear: () => void;
}

const CAPACITY = 500;

export const useDevLogStore = create<DevLogState>((set) => ({
  entries: [],
  nextSeq: 1,
  append: (entry) =>
    set((state) => {
      const full: DevLogEntry = {
        seq: state.nextSeq,
        atMs: entry.atMs ?? Date.now(),
        level: entry.level,
        tag: entry.tag,
        message: entry.message,
        meta: entry.meta,
      };
      const next = state.entries.length >= CAPACITY
        ? [...state.entries.slice(1), full]
        : [...state.entries, full];
      return { entries: next, nextSeq: state.nextSeq + 1 };
    }),
  clear: () => set({ entries: [], nextSeq: 1 }),
}));
