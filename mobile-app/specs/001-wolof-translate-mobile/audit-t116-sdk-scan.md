# T116 — Third-Party SDK Audit (FR-034 / SC-011)

**Date**: 2026-04-18
**Auditor**: automated scan

## Goal

Confirm the `mobile-app` ships **no** analytics, crash-reporting, or telemetry
SDKs. Per FR-034 / SC-011, the only network egress allowed is (a) the
configured BFF and (b) Apple's first-party pipeline (TestFlight / OS-native
crash reports).

## Scan targets

Grep the full dependency manifest and source tree for any of the following
vendor strings (case-insensitive):

```
sentry, firebase, amplitude, mixpanel, datadog, bugsnag, crashlytics,
segment, posthog, google-analytics, new-relic, rollbar, appcenter, instabug
```

## Commands run

```sh
# Direct + transitive dependency manifest
grep -Eci 'sentry|firebase|amplitude|mixpanel|datadog|bugsnag|crashlytics|\
segment|posthog|google-analytics|new-relic|rollbar|appcenter|instabug' \
  package.json package-lock.json

# Source imports
grep -REci 'sentry|firebase|amplitude|mixpanel|datadog|bugsnag|crashlytics|\
segment|posthog|google-analytics|new-relic|rollbar|appcenter|instabug' \
  src/ app/
```

## Result

**None found.**

- `package.json`: 0 matches
- `package-lock.json`: 0 matches (covers transitive deps)
- `src/` + `app/`: 0 matches

FR-034 / SC-011 hold at the build-manifest level. Device-side confirmation
that only BFF + Apple endpoints appear in network traffic remains a
user-action item (T115 network audit, performed on a physical iPhone).
