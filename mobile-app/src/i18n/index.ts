import { i18n } from '@lingui/core';
import { getLocales } from 'expo-localization';

import { messages as enMessages } from './locales/en/messages';

export const SUPPORTED_LOCALES = ['en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

i18n.load({ en: enMessages });

export function resolveDeviceLocale(): SupportedLocale {
  const locales = getLocales();
  for (const loc of locales) {
    const code = (loc.languageCode ?? '').toLowerCase();
    if ((SUPPORTED_LOCALES as readonly string[]).includes(code)) {
      return code as SupportedLocale;
    }
  }
  return DEFAULT_LOCALE;
}

export function activateLocale(locale: SupportedLocale = resolveDeviceLocale()): void {
  i18n.activate(locale);
}

activateLocale();

export { i18n };
