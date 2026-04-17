export const TIMEOUT_BASE_MS = 30_000;
export const TIMEOUT_PER_AUDIO_SEC_MS = 1_000;

export function computeTimeoutAtMs(startedAtMs: number, recordedDurationSec: number): number {
  const safeDuration = Math.max(0, recordedDurationSec);
  return startedAtMs + TIMEOUT_BASE_MS + safeDuration * TIMEOUT_PER_AUDIO_SEC_MS;
}

export function isTimedOut(nowMs: number, timeoutAtMs: number): boolean {
  return nowMs >= timeoutAtMs;
}
