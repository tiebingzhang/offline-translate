// FR-036 locale-aware formatters. Reads the device language tag once at module
// load via expo-localization and memoizes it; falls back to "en-US" per FR-037
// when no locale is exposed. Each formatter also catches Intl errors so an
// unsupported locale (e.g. wo-SN on older JSC builds) never crashes the UI.
// (001-wolof-translate-mobile:T119a)
import { getLocales } from 'expo-localization';

const FALLBACK_TAG = 'en-US';

let cachedTag: string | null = null;

function resolveLanguageTag(): string {
  try {
    const locales = getLocales();
    const tag = locales?.[0]?.languageTag;
    if (typeof tag === 'string' && tag.length > 0) {
      return tag;
    }
  } catch {
    // expo-localization failure falls through to the default tag.
  }
  return FALLBACK_TAG;
}

function getLanguageTag(): string {
  if (cachedTag == null) {
    cachedTag = resolveLanguageTag();
  }
  return cachedTag;
}

/**
 * Reset the memoized language tag. Intended for unit tests that need to switch
 * locales per-case. Production code should never call this.
 * (001-wolof-translate-mobile:T119a)
 */
export function resetFormatterLocaleForTest(): void {
  cachedTag = null;
}

/**
 * Render a duration in seconds using a locale-aware number format plus an
 * "s" unit suffix. Falls back to `${sec}s` when Intl.NumberFormat is unavailable
 * or throws for the current tag.
 */
export function formatDuration(sec: number): string {
  const tag = getLanguageTag();
  try {
    const rounded = Math.round(sec * 10) / 10;
    const nf = new Intl.NumberFormat(tag, {
      minimumFractionDigits: Number.isInteger(rounded) ? 0 : 1,
      maximumFractionDigits: 1,
    });
    return `${nf.format(rounded)}s`;
  } catch {
    return `${sec}s`;
  }
}

/**
 * Render a millisecond-precision timestamp using the device locale's medium
 * date + short time style. Falls back to `new Date(ms).toLocaleString()` if the
 * Intl.DateTimeFormat call fails.
 */
export function formatDate(ms: number): string {
  const tag = getLanguageTag();
  try {
    const dtf = new Intl.DateTimeFormat(tag, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return dtf.format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

/**
 * Render an integer or decimal using the device locale's default grouping +
 * decimal separators. Falls back to `String(n)` if Intl.NumberFormat fails.
 */
export function formatNumber(n: number): string {
  const tag = getLanguageTag();
  try {
    return new Intl.NumberFormat(tag).format(n);
  } catch {
    return String(n);
  }
}
