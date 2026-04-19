export const POLL_BACKOFF_MS = [1_000, 3_000, 9_000] as const;
export const MAX_POLL_ATTEMPTS = POLL_BACKOFF_MS.length;

export function nextDelayMs(attempt: number): number {
  if (attempt < 1 || attempt > POLL_BACKOFF_MS.length) {
    throw new RangeError(`attempt ${attempt} out of bounds [1, ${POLL_BACKOFF_MS.length}]`);
  }
  return POLL_BACKOFF_MS[attempt - 1];
}

export function shouldGiveUp(attempt: number): boolean {
  return attempt >= MAX_POLL_ATTEMPTS;
}
