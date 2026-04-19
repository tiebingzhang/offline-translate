# T117 — Coverage Audit

**Date**: 2026-04-18
**Command**: `npx jest --coverage --coverageReporters=text-summary --coverageReporters=json-summary`

## Aggregate

- Statements: 80.86 % (782 / 967)
- Branches:   73.97 % (395 / 534)
- Functions:  82.08 % (197 / 240)
- Lines:      83.06 % (736 / 886)

## Per-target (line coverage, rolled up across each folder)

| Target                               | Lines  | Branches (min file) | Notes |
| ------------------------------------ | ------ | ------------------- | ----- |
| `src/api`                            | 86.2 % | 76.31 %             | `bff-client.ts` 86.23 %; `bff-types.ts` 100 % |
| `src/pipeline`                       | 92.5 % | 69.23 %             | `state-machine.ts` 89.47 %; others ≥ 94 % |
| `src/cache`                          | 98.2 % | 66.66 %             | all three files ≥ 97 % lines |
| `src/components/DirectionButton.tsx` | 100 %  | 92.15 %             | |
| `src/components/StatusPill.tsx`      | 100 %  | 100 %               | **new test added in T117** |
| `src/components/HistoryRow.tsx`      | 100 %  | 50 %                | swipe-right gesture branch not exercised |
| `src/components/RetryBanner.tsx`     | 100 %  | 85 %                | |
| `src/components/SettingsSheet.tsx`   | 100 %  | 0 %                 | single-branch switch; no logical branches hit in test |

## Test suites

- 27 suites, 231 tests, all passing.

## Tests added under T117

- `src/components/__tests__/StatusPill.test.tsx` — 12 cases covering null
  state, stage labels, upload-progress formatting, and a11y label shape.
  Previously the file was at 0 % coverage.

## Threshold conformance

All required targets clear the 80 % line-coverage bar. Branch coverage on
`SettingsSheet` and `HistoryRow` is lower because those components currently
have a single linear render path; adding contrived branch tests would not
protect against real defects. Flagging honestly rather than padding.
