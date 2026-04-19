const expoBabelConfig = require.resolve('expo/internal/babel-preset.js');

module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.ts'],
  transform: {
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$': require.resolve(
      'react-native/jest/assetFileTransformer.js',
    ),
    '\\.(m?[jt]sx?)$': [
      'babel-jest',
      {
        caller: { name: 'metro', bundler: 'metro', platform: 'ios' },
        configFile: expoBabelConfig,
      },
    ],
    '^.+\\.(bmp|gif|jpg|jpeg|png|psd|svg|webp|xml|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|yaml|yml|otf|ttf|zip|heic|avif|db)$':
      require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/', '/.expo/'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@lingui/.*|zustand|msw|@mswjs/.*|@bundled-es-modules/.*|@open-draft/.*|@inquirer/.*|strict-event-emitter|rettime|until-async|path-to-regexp|graphql|headers-polyfill|cookie|outvariant|is-node-process|type-fest|statuses))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^msw/node$': '<rootDir>/node_modules/msw/lib/node/index.js',
    '^msw$': '<rootDir>/node_modules/msw/lib/core/index.js',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
  ],
};
