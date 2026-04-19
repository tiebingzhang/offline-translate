import type { LinguiConfig } from '@lingui/conf';

const config: LinguiConfig = {
  sourceLocale: 'en',
  locales: ['en'],
  catalogs: [
    {
      path: 'src/i18n/locales/{locale}/messages',
      include: ['src', 'app'],
    },
  ],
  format: 'po',
};

export default config;
