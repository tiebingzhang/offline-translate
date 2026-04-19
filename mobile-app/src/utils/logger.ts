import { useDevLogStore, type LogLevel } from '../state/dev-log-store';

export function log(
  level: LogLevel,
  tag: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  useDevLogStore.getState().append({ level, tag, message, meta });
}
