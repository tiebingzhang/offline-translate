// FR-036 locale-aware formatters — unit tests.
// (001-wolof-translate-mobile:T119a)
import * as Localization from 'expo-localization';

import {
  formatDate,
  formatDuration,
  formatNumber,
  resetFormatterLocaleForTest,
} from '../formatters';

const getLocalesMock = Localization.getLocales as unknown as jest.Mock;

function setLocale(tag: string | null, languageCode: string | null = null): void {
  if (tag == null) {
    getLocalesMock.mockReturnValueOnce([]);
  } else {
    getLocalesMock.mockReturnValueOnce([
      { languageTag: tag, languageCode: languageCode ?? tag.split('-')[0], regionCode: tag.split('-')[1] ?? null },
    ]);
  }
  resetFormatterLocaleForTest();
}

describe('formatters — en-US (default)', () => {
  beforeEach(() => {
    setLocale('en-US', 'en');
  });

  test('formatDuration renders seconds with "s" suffix', () => {
    expect(formatDuration(1)).toMatch(/1(\.0)?\s?s/);
    expect(formatDuration(12.5)).toMatch(/12\.5\s?s/);
  });

  test('formatDate returns a non-empty string for a valid ms timestamp', () => {
    const out = formatDate(new Date('2026-04-18T12:34:00Z').getTime());
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  test('formatNumber groups thousands', () => {
    const out = formatNumber(16000);
    expect(out).toMatch(/16[\s,.\u00A0\u202F]000/);
  });
});

describe('formatters — fr-FR', () => {
  beforeEach(() => {
    setLocale('fr-FR', 'fr');
  });

  test('formatDuration does not crash and emits a string', () => {
    const out = formatDuration(3.5);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  test('formatDate does not crash and emits a string', () => {
    const out = formatDate(new Date('2026-04-18T12:34:00Z').getTime());
    expect(typeof out).toBe('string');
  });

  test('formatNumber does not crash and emits a string', () => {
    const out = formatNumber(16000);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('formatters — wo-SN (unsupported locale, must fall back without crashing)', () => {
  beforeEach(() => {
    setLocale('wo-SN', 'wo');
  });

  test('formatDuration returns a string even when Intl lacks data', () => {
    const out = formatDuration(5);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  test('formatDate returns a string even when Intl lacks data', () => {
    const out = formatDate(Date.now());
    expect(typeof out).toBe('string');
  });

  test('formatNumber returns a string even when Intl lacks data', () => {
    const out = formatNumber(42);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('formatters — no locales at all (FR-037 fallback)', () => {
  beforeEach(() => {
    setLocale(null);
  });

  test('formatNumber still returns a string when getLocales() is empty', () => {
    expect(typeof formatNumber(7)).toBe('string');
  });

  test('formatDuration still returns a string when getLocales() is empty', () => {
    expect(typeof formatDuration(7)).toBe('string');
  });

  test('formatDate still returns a string when getLocales() is empty', () => {
    expect(typeof formatDate(Date.now())).toBe('string');
  });
});
