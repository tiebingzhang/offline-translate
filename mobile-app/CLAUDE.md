# mobile-app Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-18

## Active Technologies
- TypeScript 5.x (strict), Expo SDK 55, React Native 0.76+ + `expo`, `expo-router` (navigation), `expo-audio` (recording + playback), `expo-file-system` (legacy import for background upload; next-gen for audio file IO), `expo-speech` (English on-device TTS), `expo-haptics`, `expo-localization`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `zustand` v5, `@lingui/core` + `@lingui/react` + `@lingui/metro-transformer/expo` — pinned specifically in `research.md` §§1–7. **FR-003a adds no new dependency.** (001-wolof-translate-mobile)
- `expo-sqlite` (`history.db` with `history` + `pending_jobs` tables, client-owned — see `data-model.md` §3), `expo-file-system` `Paths.document/audio/` for audio blobs, `AsyncStorage` for `wt.*` prefs. **FR-003a adds no persisted state.** (001-wolof-translate-mobile)

- TypeScript 5.x (strict), Expo SDK 55, React Native 0.76+ + `expo`, `expo-router` (navigation), `expo-audio` (recording + playback), `expo-file-system` (legacy import for background upload; next-gen for audio file IO), `expo-speech` (English on-device TTS), `expo-haptics`, `expo-localization`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `zustand` v5, `@lingui/core` + `@lingui/react` + `@lingui/metro-transformer/expo` — pinned specifically in `research.md` §§1–7 (001-wolof-translate-mobile)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x (strict), Expo SDK 55, React Native 0.76+: Follow standard conventions

## Recent Changes
- 001-wolof-translate-mobile: Added TypeScript 5.x (strict), Expo SDK 55, React Native 0.76+ + `expo`, `expo-router` (navigation), `expo-audio` (recording + playback), `expo-file-system` (legacy import for background upload; next-gen for audio file IO), `expo-speech` (English on-device TTS), `expo-haptics`, `expo-localization`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `zustand` v5, `@lingui/core` + `@lingui/react` + `@lingui/metro-transformer/expo` — pinned specifically in `research.md` §§1–7. **FR-003a adds no new dependency.**

- 001-wolof-translate-mobile: Added TypeScript 5.x (strict), Expo SDK 55, React Native 0.76+ + `expo`, `expo-router` (navigation), `expo-audio` (recording + playback), `expo-file-system` (legacy import for background upload; next-gen for audio file IO), `expo-speech` (English on-device TTS), `expo-haptics`, `expo-localization`, `expo-sqlite`, `@react-native-async-storage/async-storage`, `zustand` v5, `@lingui/core` + `@lingui/react` + `@lingui/metro-transformer/expo` — pinned specifically in `research.md` §§1–7

- 001-wolof-translate-mobile (Phase 7 US5): `SettingsSheet` + `BackgroundPattern` components, FR-028 tap-mode toggle, full accessibility labels + hints on every interactive surface (FR-025), `useReduceMotion` hook wiring `AccessibilityInfo.isReduceMotionEnabled` into Reanimated, WCAG AA contrast test for `design/tokens.ts` palette.

- 001-wolof-translate-mobile (Phase 8 Polish): `src/utils/formatters.ts` (FR-036 `formatDuration` / `formatDate` / `formatNumber` via `Intl` seeded from `expo-localization.getLocales()`), locale-aware call-site sweep in `MetadataGrid`, `HistoryRow`, `PipelineStatusBar`, `scripts/check-i18n.sh` (FR-035 literal-string scan), third-party-SDK audit confirming FR-034 / SC-011 hold.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
