<!--
Sync Impact Report
==================
Version change: (uninitialized template) → 1.0.0
Rationale: Initial ratification from the consolidated vibe_coding_constitutions amendment set
          (main + UI amendments). MAJOR bump is appropriate because this establishes the
          baseline governance for the project (no prior ratified principles existed).

Principles defined (new):
  I.   Code Minimalism & Schema Safety (NON-NEGOTIABLE)
  II.  Test-Driven Development (NON-NEGOTIABLE)
  III. Research & Design Discipline (NON-NEGOTIABLE)
  IV.  Comment Traceability (NON-NEGOTIABLE)
  V.   Git Worktree Workflow (NON-NEGOTIABLE)
  VI.  Commit Discipline (NON-NEGOTIABLE)
  VII. Spec Session Continuity (NON-NEGOTIABLE)
  VIII.UI Mock-First Delivery (NON-NEGOTIABLE)

Added sections:
  - Core Principles (I–VIII)
  - Additional Constraints & Red Alerts
  - Development Workflow & Quality Gates
  - Governance

Removed sections: none (template placeholders replaced).

Amendments intentionally NOT applied (preconditions not met for this project):
  - constitution_amendment_architecture.md (this is a child mobile-app repo, not an
    architecture parent repo)
  - constitution_amendment_backend.md (this repo is a mobile client, not a backend system)
  - constitution_amendment_python.md (stack is React Native + Expo + TypeScript)
  - constitution_amendment_RE.md (no cloud IaC in this repo)

Templates requiring updates:
  ✅ .specify/memory/constitution.md (this file)
  ✅ .specify/templates/plan-template.md (Constitution Check gate concretized)
  ✅ .specify/templates/tasks-template.md (UI mock-first + commit-per-phase guidance added)
  ⚠ .specify/templates/spec-template.md (no structural change required — scope/requirements
    sections already compatible; re-verify on next amendment)
  ⚠ .specify/templates/agent-file-template.md (no references to specific principles — no
    update needed unless principles change)

Follow-up TODOs: none.
-->

# Wolof Translate Mobile Client Constitution

## Core Principles

### I. Code Minimalism & Schema Safety (NON-NEGOTIABLE)

Less is more. Every change MUST minimize net complexity and variables introduced.

**Rules**:

- Minimize the number of variables. If the same logic can be achieved by two
  variables, do NOT use three.
- When integrating with an external service or library, refrain from building custom
  components. Use the official client, follow the official guide, and use the official
  MCP server if available.
- When implementing a client to an external service, follow these steps in order:
  1. Look for an official client library (or a well-maintained 3rd-party client).
  2. If the service provides `openapi.json`, use a CLI/library to generate the client
     from it (e.g., `openapi-python-client` for Python, `openapi-typescript-codegen` or
     `openapi-generator` for TypeScript).
  3. If neither #1 nor #2 works, implement a client manually. Consult Context7 or the
     official MCP for the latest developer guide and API documentation.
- If a service client is auto-generated from `openapi.json`, create a Makefile target
  (or `npm run` script) to re-generate the client in the future
  (e.g., `make generate-asset-svc-client`, `npm run generate:asset-svc-client`).
- Auto-generated clients MUST NOT contain business logic. Business logic added there
  will be wiped out when the client is re-generated. Place logic in a wrapping layer.
- Non-secret configurations MUST be stored in YAML config files (e.g., `default.yaml`
  for the TypeScript project; mirrors such as `VITE_AUTH0_AUDIENCE`). Secret
  configurations MUST be retrieved from environment variables only (e.g.,
  `OPEN_AI_API_KEY`).
- **Red Alert — Database schema**: Application code MUST NOT change database schema.
  Add/drop/alter table, index, and similar operations at the application level are
  prohibited. Schema changes MUST go through dedicated migration tooling (e.g.,
  Flyway). Violating this rule requires explicit, in-session user permission.

**Rationale**: Minimalism reduces cognitive load, defect surface, and maintenance
cost. Relying on official/generated clients avoids divergence from upstream contracts.
Keeping schema mutations out of application code prevents uncoordinated production
drift and data loss.

### II. Test-Driven Development (NON-NEGOTIABLE)

Integration tests MUST be written before implementing API endpoints or equivalent
feature surfaces. All endpoints/surfaces MUST have comprehensive test coverage
validating happy paths, edge cases, and error conditions. When fixing test failures,
fix one test at a time to save time and LLM tokens.

**Rules**:

- Integration tests MUST be written FIRST for new endpoints (or the mobile-client
  equivalent: contract tests against the BFF, end-to-end screen flows), THEN the
  implementation.
- Tests MUST cover: valid inputs, invalid inputs, missing/expired auth, boundary
  conditions, and backend/database errors (as surfaced to the client).
- For Python backend code in scope of this project, tests MUST use async `pytest` with
  `httpx.AsyncClient`. For TypeScript/React Native code, use `jest` + `@testing-library/react-native`
  (or the equivalent Expo-supported runner) and mock transport at the HTTP boundary.
- Tests MUST validate: HTTP status codes, response schemas, state changes, and audit
  fields (where they exist in the client state).
- Mock external dependencies (S3, external APIs, native modules where feasible) to
  keep tests fast and reliable.
- Test fixtures MUST provide realistic sample data.
- ALL tests MUST pass before code is committed.
- Test coverage target: >80% for API routes, client services, and critical UI flows.
- Fix one test at a time to save time and LLM tokens.

**Rationale**: Translation-pipeline correctness and user-perceived reliability depend
on verifiable contracts at the BFF/client boundary. TDD prevents regressions and
enables confident refactoring as the mobile client evolves on top of a stable BFF API.

### III. Research & Design Discipline (NON-NEGOTIABLE)

Design decisions MUST minimize change, maximize reuse, and be secure by default.

**Rules**:

- When designing app authentication, follow the "secure by default" approach: if a
  route is NOT explicitly marked public, it requires authentication.
- When scoping and planning a new feature, always look to reuse existing platform,
  library, or source code. Follow the existing pattern if one exists. Minimize code
  change while keeping the code readable.
- Use `camelCase` in ALL API JSON request and response bodies (including query
  parameters and path variables where the client produces them).

**Rationale**: Secure-by-default prevents accidental exposure of new routes. Reusing
existing patterns keeps the codebase navigable and shrinks review scope. A single
casing convention avoids friction at the BFF boundary.

### IV. Comment Traceability (NON-NEGOTIABLE)

Every in-code comment MUST be traceable to the spec and task that introduced it.

**Rules**:

- All comments MUST be suffixed with the spec and task names in the format:
  `# this is my comment ({spec-name}:{task-name})`
- Example: `# replace LLM claude with cursor (001-change-llm:T001)`
- The suffix convention applies regardless of language (adapt comment syntax
  accordingly: `//`, `<!-- -->`, etc.).

**Rationale**: Traceable comments let the user follow any in-code explanation back
to its originating specification and task, which preserves institutional memory as
specs merge into `dev` and chat history is cleared.

### V. Git Worktree Workflow (NON-NEGOTIABLE)

Before starting any spec session or feature development, a dedicated git worktree
MUST be created to isolate work and enable parallel development. Direct feature work
on the main project directory is prohibited.

**Rules**:

- ALL feature branches MUST be cut from the `dev` branch (the default branch for
  feature development in this project).
- Create a git worktree branch matching the spec-name format (e.g.,
  `007-log-in-page`, or the user-provided name).
- The remote branch name MUST match the spec name exactly (e.g., `007-log-in-page`).
- If child repos exist under the current working directory, cut a git branch with the
  same name for each child repo that will be changed in this spec session.

**Rationale**: Worktrees enable true parallel development of multiple features,
prevent accidental cross-contamination between features, simplify context switching
without stashing, and reduce risk of committing work-in-progress to the wrong
branch. Sequential numbering across worktrees and merged specs on `dev` prevents
spec-number conflicts and maintains a clear project history even with parallel work.
User-provided names override automatic numbering for special cases. Requiring merge
to `dev` before worktree removal ensures completed work is never lost.

### VI. Commit Discipline (NON-NEGOTIABLE)

All work MUST be decomposed into reviewable, testable units with frequent commits.

**Rules**:

- Upon completion of each phase, new code or documents MUST be committed immediately.
- User approval MUST be obtained before performing the git commit.
- ALL commit messages MUST be prefixed with the spec session name and phase name
  (e.g., `005-build-a-bff:Phase1: add user authentication service`).
- Commit message format: `{SPEC_NAME}:{PHASE_NAME}: {concise description of change}`.
- Each commit MUST represent a complete, working unit (tests pass, code compiles).
- Commits MUST NOT bundle unrelated changes from different subtasks.
- Work-in-progress commits are prohibited; only commit completed subtasks.

**Rationale**: Small, focused tasks enable thorough review, reduce cognitive load,
and minimize merge conflicts. Consistent prefixes create clear audit trails,
simplify `git bisect`, and enable granular rollbacks. Phase-sized units keep review
quality and velocity high.

### VII. Spec Session Continuity (NON-NEGOTIABLE)

When chat history is cleared to save tokens, the system MUST NOT lose track of the
current spec session. Context recovery MUST be automatic to prevent accidental
creation of duplicate spec sessions.

**Rules**:

- BEFORE executing `/specify`, `/plan`, `/tasks`, `/implement`, or any spec-related
  command, if the current spec session cannot be identified from chat history,
  perform automatic context recovery.
- Context recovery procedure:
  1. Check the current git branch name against known spec names.
  2. If a match is found, RESUME the matched spec session (do NOT create a new one).
  3. If no match is found, proceed with normal spec session creation per
     Principle V (Git Worktree Workflow).
- Context recovery MUST be performed silently without user intervention.
- Commands MUST log which spec session is being resumed (e.g.,
  `Resuming spec session: 008-fix-signin-page`).
- If context recovery fails (current git branch does not match any spec), fall back
  to normal spec numbering logic.

**Rationale**: Chat-history clearing is a necessary optimization to manage token
usage, but it must not disrupt the developer's workflow. Losing track of the
current spec session leads to duplicate work and merge conflicts. Automatically
deriving context from the file system (git worktree + current directory) ensures
continuity even when chat history is lost — critical for long-running sessions
developing multiple features in parallel. This principle complements Principle V
by keeping worktree-based isolation effective after context loss.

### VIII. UI Mock-First Delivery (NON-NEGOTIABLE)

Every feature with a graphical user interface MUST ship a reviewable UI mock before
any business logic is wired into it.

**Rules**:

- While laying out tasks in `tasks.md`, the FIRST UI-bearing task for each feature
  MUST implement a mock version of the UI, populated with mock data, before any
  business logic is implemented.
- A manual task MUST be assigned for the user to review and approve the mock UI
  before downstream (business-logic) tasks begin.
- Subsequent business-logic tasks MUST NOT start until the user has approved the
  mock UI for the associated screen/flow.

**Rationale**: Locking visual and interaction design before wiring logic prevents
expensive rework, surfaces product decisions early, and aligns the solo developer
with end-user expectations before investing in integration code.

## Additional Constraints & Red Alerts

- **Database schema changes** (Principle I) are a hard red alert. No application
  code path — including migrations bundled into app build steps — may ALTER
  database schema. Schema evolution goes through Flyway (or the equivalent
  migration tool agreed for the target service), in a separate, auditable change.
- **Secrets handling** (Principle I): secret values are NEVER committed, NEVER
  stored in YAML config, and NEVER inlined into tests or fixtures. Load from
  environment variables at runtime and from the developer's secret store locally.
- **API contract stability**: the mobile client consumes the existing BFF HTTP
  contract. Breaking changes to that contract are out of scope for the mobile repo
  and require coordinated changes in the BFF spec session.
- **Platform scope**: iOS-first (iOS 16+); Android is secondary and MUST NOT
  require parallel feature development. Do NOT introduce platform-specific code
  paths that diverge the two targets without an approved spec.

## Development Workflow & Quality Gates

- **Before `/specify`**: a feature branch and worktree MUST exist per Principle V
  (enforced via the `speckit.git.feature` before-hook).
- **Before `/plan`, `/tasks`, `/implement`**: outstanding changes SHOULD be
  committed per Principle VI (auto-commit hooks are enabled as optional in
  `.specify/extensions.yml`).
- **Constitution Check gate (in `plan.md`)**: plans MUST explicitly evaluate each
  applicable principle (I–VIII) and either show compliance or record a justified
  deviation in the Complexity Tracking section.
- **Pre-commit quality gate**: all tests pass (Principle II), linter/formatter is
  clean, and commit message follows the `{SPEC_NAME}:{PHASE_NAME}: ...` prefix
  (Principle VI).
- **UI review gate**: for any UI-bearing feature, user approval of the mock
  (Principle VIII) MUST be recorded before business-logic tasks start.

## Governance

- **Supremacy**: this constitution supersedes ad-hoc conventions, prior informal
  practices, and any agent "memory" rules that conflict with it.
- **Amendment procedure**:
  1. Propose the amendment by updating the source amendment files under
     `~/workspace/FinTech-Genie-Doc/fintech-archi/vibe_coding_constitutions/`.
  2. Run `/speckit-constitution` to regenerate this file.
  3. Update dependent templates flagged in the Sync Impact Report.
  4. Request user approval; commit with a `docs: amend constitution to vX.Y.Z …`
     message (per Principle VI naming).
- **Versioning policy** (semantic):
  - MAJOR — backward-incompatible removal or redefinition of a principle, or any
    change that invalidates previously-accepted plans.
  - MINOR — a new principle or materially expanded guidance.
  - PATCH — wording/typo/clarification only; no semantic change.
- **Compliance review**: each `/speckit-plan` run MUST evaluate the Constitution
  Check gate (see `.specify/templates/plan-template.md`). Each `/speckit-analyze`
  MUST flag drift between `spec.md`, `plan.md`, `tasks.md`, and this constitution.
- **Runtime guidance**: agent-specific guidance (e.g., `CLAUDE.md`, the
  `.specify/templates/agent-file-template.md` artifact) MAY be used for day-to-day
  developer ergonomics, but MUST NOT contradict principles defined here. If a
  contradiction is discovered, the constitution wins and the guidance MUST be
  updated.
- **Child vs. parent constitutions**: this repo's constitution is the local
  constitution for the mobile client. If/when this repo is nested under an
  architecture parent, rules in this local file take precedence over any sibling
  repo's rules; a parent architecture constitution (if present) is consulted only
  where this local file is silent.

**Version**: 1.0.0 | **Ratified**: 2026-04-16 | **Last Amended**: 2026-04-16
