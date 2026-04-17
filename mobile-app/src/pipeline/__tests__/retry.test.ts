import { MAX_POLL_ATTEMPTS, nextDelayMs, shouldGiveUp } from '../retry';

describe('poll retry backoff', () => {
  it('uses 1s → 3s → 9s for attempts 1–3', () => {
    expect(nextDelayMs(1)).toBe(1_000);
    expect(nextDelayMs(2)).toBe(3_000);
    expect(nextDelayMs(3)).toBe(9_000);
  });

  it('rejects attempts outside [1, 3]', () => {
    expect(() => nextDelayMs(0)).toThrow(RangeError);
    expect(() => nextDelayMs(4)).toThrow(RangeError);
  });

  it('gives up only after attempt 3', () => {
    expect(shouldGiveUp(1)).toBe(false);
    expect(shouldGiveUp(2)).toBe(false);
    expect(shouldGiveUp(3)).toBe(true);
    expect(shouldGiveUp(4)).toBe(true);
  });

  it('exposes MAX_POLL_ATTEMPTS as 3', () => {
    expect(MAX_POLL_ATTEMPTS).toBe(3);
  });
});
