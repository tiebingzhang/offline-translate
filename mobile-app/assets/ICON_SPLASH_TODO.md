# App icon + splash — TODO (T102, FR-031)

This task (T102 in `specs/001-wolof-translate-mobile/tasks.md`) cannot be
completed by code alone. FR-029 forbids AI-generated imagery and FR-031
requires a Senegalese-contextual visual identity for icon + splash —
**not** the Senegalese national flag and **not** an Africa-continent
silhouette. The assets must be authored (hand-designed, vector-built,
or photographed) by a human designer before the TestFlight build (T123).

## Current placeholder assets

The existing PNGs at

- `mobile-app/assets/icon.png`
- `mobile-app/assets/adaptive-icon.png`
- `mobile-app/assets/splash-icon.png`
- `mobile-app/assets/favicon.png`

are the untouched Expo template files. `mobile-app/app.json` references
them as-is. Do not delete them until replacements are in place.

## Required sizes

| Asset             | File                              | Size             | Notes                                                                 |
| ----------------- | --------------------------------- | ---------------- | --------------------------------------------------------------------- |
| iOS app icon      | `assets/icon.png`                 | 1024 × 1024 px   | Flat square, no alpha, no rounded corners — iOS masks automatically.  |
| Android adaptive  | `assets/adaptive-icon.png`        | 1024 × 1024 px   | Foreground only. Content must fit inside a **432 px centered safe zone** (Android masks with circle / squircle / rounded-rect shapes). |
| Splash            | `assets/splash-icon.png`          | 1242 × 2688 px   | Or export from a vector source sized at `resizeMode: "contain"` defaults. Centered motif on solid background tuned to `tokens.lightPalette.base` (#f4efe6). |
| Web favicon       | `assets/favicon.png`              | 48 × 48 px       | Small enough that detail vanishes — use a single motif shape.         |

## Motif direction (suggested)

Build on the same Kente / mudcloth geometry used by
`assets/patterns/kente.tsx` (T099): repeating stripes, weave crosses,
and a diamond accent in the secondary palette
(`secondaryIndigo`, `secondaryOchre`, `secondaryTerracotta`). The icon
should read as a compact woven emblem — not a flag, not a map, not a
photograph. Earth-tone backgrounds (`lightPalette.base` / warm sand)
keep parity with the in-app aesthetic.

## Process once assets exist

1. Replace the four PNGs above (keep filenames and paths identical).
2. Run `npx expo-doctor` to confirm icon dimensions validate.
3. No `app.json` edit is required — paths are unchanged.
4. Tick T102 in `specs/001-wolof-translate-mobile/tasks.md`.

Until then, T102 remains open in `tasks.md` and Phase 7 Part B (T107+)
can proceed on top of the placeholder assets.
