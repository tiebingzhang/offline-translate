# Quickstart: Wolof Translate Mobile Client

**Spec**: [`spec.md`](./spec.md) · **Plan**: [`plan.md`](./plan.md)
**Audience**: developer setting up the repo for local iteration.

---

## Prerequisites

- **macOS** 14+ (required for Xcode + iOS Simulator).
- **Xcode** 16+ with iOS Simulator runtimes for iOS 16.0.
- **Node.js** 20.x LTS (or the version pinned in `.nvmrc` once it exists).
- **Watchman** (recommended): `brew install watchman`.
- **Apple Developer** enrollment (required for physical device testing and TestFlight — M3+).
- **Maestro CLI**: `curl -Ls https://get.maestro.mobile.dev | bash`.
- **BFF running locally**: see the parent `offline-translate/` repo's `web_server.py` on port 8090. Validate with `curl http://localhost:8090/api/health` → `{"status":"ok"}`.

---

## One-time setup

```bash
# from the mobile-app repo root
npm install

# generate the iOS native project (CNG)
npx expo prebuild --platform ios --clean    # only if you need the ios/ folder; normally skip

# install Lingui catalog tooling (if not already in devDependencies)
npm install -D @lingui/cli @lingui/macro @lingui/metro-transformer
```

Copy the build-time defaults:

```bash
cp .env.example .env.development
```

Set `BFF_BASE_URL_DEV` to your Mac's LAN IP so a physical iPhone on the same network can reach the BFF (e.g., `http://192.168.1.42:8090`). Simulator can use `http://localhost:8090`.

---

## Run locally on iOS Simulator

```bash
# terminal 1 — run the BFF (in the parent offline-translate repo)
cd ../
python web_server.py

# terminal 2 — start Expo dev server
cd mobile-app
npx expo start --dev-client

# in the Expo UI: press i to open on iOS Simulator
```

The first launch on a fresh simulator triggers the `NSMicrophoneUsageDescription` prompt — accept it. Record a 3-second phrase, release, and watch the status pill progress through `queued → normalizing → transcribing → translating → generating_speech → completed`. The translated audio plays automatically.

---

## Run locally on a physical iPhone

Prerequisite: Apple Developer enrollment + your Team ID configured in `app.config.ts`.

```bash
# build a dev-client for your device (one-time)
eas build --profile development --platform ios --local
# install the resulting .ipa to the device (drag into Xcode Devices & Simulators)

# then, for each coding session
npx expo start --dev-client
# scan the QR code from the iPhone's Expo Go-equivalent dev-client
```

---

## Tests

### Unit + component + contract (jest + MSW)

```bash
npm test              # runs once
npm test -- --watch   # watch mode during development
npm test -- -u        # update snapshots
```

MSW handlers for the BFF contract live in `src/api/__tests__/msw-handlers.ts` and are loaded by `jest.setup.ts`. Writing a new BFF-consuming call? Add the matching handler BEFORE the implementation (Constitution II).

Coverage target: >80% on `src/api`, `src/pipeline`, `src/cache`, and critical components (`DirectionButton`, `StatusPill`, `HistoryRow`).

### E2E (Maestro)

```bash
# simulator must already be booted
maestro test maestro/flows/us1-happy-path.yaml
```

Core flows:

| File | Story | Pass criteria |
|---|---|---|
| `maestro/flows/us1-happy-path.yaml` | US1 round-trip | translated text visible, audio plays |
| `maestro/flows/us1-timeout.yaml` | FR-020 timeout | retry banner appears within 90 s for a 60 s clip |
| `maestro/flows/us2-offline-history.yaml` | US2 offline replay | one prior translation replays with airplane mode on |
| `maestro/flows/us4-background-upload.yaml` | FR-006a background | app backgrounded → foregrounded, result appears |

---

## Common troubleshooting

| Symptom | Fix |
|---|---|
| Upload hangs on Simulator pointed at `localhost` | Simulator can reach host `localhost`; physical device cannot — switch to your Mac's LAN IP in `.env.development`. |
| "App Transport Security blocked cleartext" in release builds | Intended — release ships TLS-only. Use the dev profile for HTTP dev endpoints (see `app.config.ts` branching on `EAS_BUILD_PROFILE`). |
| `expo-audio` throws `NSMicrophoneUsageDescription` missing | The `expo-audio` config plugin wasn't picked up; run `npx expo prebuild --clean` and rebuild. |
| History list empty after rebuilding the app | `Paths.document/audio/` survives reinstall only if the app's bundle ID is unchanged; changing bundle ID wipes the sandbox. |
| Maestro flows flake on "record" step | Record step relies on push-and-hold timing; raise `longPressDelay` in the flow or toggle Settings → Tap mode ON for deterministic tap-to-start/stop (FR-028). |

---

## TestFlight build (M3)

```bash
# validate
npm test && maestro test maestro/flows

# build + submit
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

TestFlight distribution caps at 10,000 testers (internal + external). Public App Store is out of v1 scope (`spec.md` §Assumptions).
