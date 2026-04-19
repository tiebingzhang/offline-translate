// https://docs.expo.dev/guides/using-eslint/
// Flat config migrated from legacy .eslintrc.json (extends: "expo").
// Rules are preserved verbatim via eslint-config-expo/flat — no added or
// relaxed rules. node_modules is ignored by ESLint by default; dist/ and
// .expo/ carry over from ignorePatterns. (001-wolof-translate-mobile:T084-FollowUp)
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
]);
