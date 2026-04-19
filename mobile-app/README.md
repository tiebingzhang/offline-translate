# Wolof Translate — Mobile (iOS)

An iOS Expo/React Native client for the offline-translate BFF. A user holds a
direction button, speaks a short phrase (up to 60 seconds), and the app
uploads the recording, shows the pipeline progress in plain language, and
plays the translated audio while displaying the source + target text.
v1 is English-only UI with full i18n scaffolding for later Wolof/French
localizations; Android is explicitly out of scope for v1.

Full feature specification lives in
[`specs/001-wolof-translate-mobile/spec.md`](specs/001-wolof-translate-mobile/spec.md).
Implementation plan + research sit beside it:
[`plan.md`](specs/001-wolof-translate-mobile/plan.md),
[`research.md`](specs/001-wolof-translate-mobile/research.md).

## Requirements

- Node.js 20 LTS + npm 10
- Xcode 15+ with an iOS 17 simulator, or a physical iPhone for device testing
- A running BFF (see the sibling `../` directory — the `offline-translate`
  Python service) accessible from the simulator/device
- Optional: [`eas-cli`](https://docs.expo.dev/eas/) for TestFlight builds

## Quickstart

```sh
npm install
npm start           # Expo Metro on port 9080
npm run ios         # build + launch in the iOS simulator
```

Run the unit suite at any time:

```sh
npm test
npm run typecheck
sh scripts/check-i18n.sh    # FR-035 literal-string guard
```

## Pointing at the BFF

The app reads the default backend URL at build time from
`EXPO_PUBLIC_BFF_BASE_URL` (falls back to `http://localhost:8090`). For ad-hoc
testing against a non-default server, enable Developer Mode in-app (gear icon
→ Settings → toggle) and set the override via the Developer Panel — no rebuild
required. See FR-022 in `spec.md`.

```sh
EXPO_PUBLIC_BFF_BASE_URL="https://your-bff.example.com" npm start
```

A local development BFF (HTTP on `localhost`) is automatically allowed by ATS
when the EAS profile is `development`; release builds reject plain HTTP.

## Device manual-test checklist

The end-to-end manual acceptance protocol (cold-start, offline replay,
Dynamic Type, network audit) is in
[`specs/001-wolof-translate-mobile/quickstart.md`](specs/001-wolof-translate-mobile/quickstart.md).
Run it on a physical iPhone before promoting a TestFlight build.

## TestFlight build

```sh
eas build --profile production --platform ios
```

This produces an uploadable `.ipa`. The build must validate with **no ATS
exceptions** and must pass the smoke tests in `quickstart.md` on an enrolled
tester device before distribution.

## Project layout

```text
app/             expo-router screens
src/
  api/           BFF client + wire types
  audio/         recording + playback helpers
  cache/         expo-sqlite schema, history + pending-jobs repos
  components/    presentational UI (DirectionButton, StatusPill, …)
  design/        color/typography/spacing tokens
  hooks/         useReduceMotion, etc.
  i18n/          Lingui catalog (hand-maintained; English only in v1)
  pipeline/      upload/poll state machine, retry, timeout, step labels
  state/         zustand stores (pipeline, settings)
  utils/         formatters, logger, casing
scripts/
  check-i18n.sh  FR-035 literal-string scan (exit 1 on hit)
specs/           feature specs (authoritative source of truth)
```

## Telemetry / crash posture

No third-party analytics or crash SDK is bundled. Crash data flows only
through Apple's first-party TestFlight + OS-native pipeline, per FR-034 /
SC-011. See `specs/001-wolof-translate-mobile/audit-t116-sdk-scan.md`.
