import type { ExpoConfig, ConfigContext } from 'expo/config';

const isDev = process.env.EAS_BUILD_PROFILE === 'development';

const devInfoPlist = {
  NSAppTransportSecurity: {
    NSExceptionDomains: {
      localhost: {
        NSExceptionAllowsInsecureHTTPLoads: true,
      },
      local: {
        NSIncludesSubdomains: true,
        NSExceptionAllowsInsecureHTTPLoads: true,
      },
    },
  },
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Wolof Translate',
  slug: config.slug ?? 'wolof-translate',
  ios: {
    ...config.ios,
    infoPlist: {
      ...(config.ios?.infoPlist ?? {}),
      ...(isDev ? devInfoPlist : {}),
    },
  },
});
