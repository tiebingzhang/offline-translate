import { computeTimeoutAtMs, isTimedOut } from '../timeout';

describe('computeTimeoutAtMs', () => {
  const started = 1_000_000;

  it('adds 30 s for a zero-length recording', () => {
    expect(computeTimeoutAtMs(started, 0)).toBe(started + 30_000);
  });

  it('adds 33 s for a 3-second recording', () => {
    expect(computeTimeoutAtMs(started, 3)).toBe(started + 33_000);
  });

  it('adds 90 s for a 60-second recording', () => {
    expect(computeTimeoutAtMs(started, 60)).toBe(started + 90_000);
  });

  it('clamps negative durations to zero', () => {
    expect(computeTimeoutAtMs(started, -5)).toBe(started + 30_000);
  });
});

describe('isTimedOut', () => {
  it('is false strictly before timeoutAtMs', () => {
    expect(isTimedOut(999, 1000)).toBe(false);
  });

  it('is true exactly at timeoutAtMs', () => {
    expect(isTimedOut(1000, 1000)).toBe(true);
  });

  it('is true after timeoutAtMs', () => {
    expect(isTimedOut(1001, 1000)).toBe(true);
  });
});
