<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: Initial ratification — template was unfilled placeholder; this is
the first concrete adoption of project principles, so MAJOR baseline (1.0.0).

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Test-Driven Development (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Research, Design & Reuse First (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. Coding Minimalism & Official-Client Preference (NON-NEGOTIABLE)
  - [PRINCIPLE_4_NAME] → IV. API & Data Contract Standards (NON-NEGOTIABLE)
  - [PRINCIPLE_5_NAME] → V. Database Schema Authority (RED ALERT, NON-NEGOTIABLE)

Added principles (beyond template default of 5):
  - VI. Comments Discipline (NON-NEGOTIABLE)
  - VII. Documentation Consistency (NON-NEGOTIABLE)
  - VIII. UI Mockup-First (NON-NEGOTIABLE for graphical surfaces)
  - IX. Python Conventions (NON-NEGOTIABLE for Python code)
  - X. Constitution Hierarchy in Multi-Repo Projects (NON-NEGOTIABLE)

Added sections:
  - Additional Constraints (Technology Stack & Configuration Standards)
  - Development Workflow (Git Worktree, Commit Discipline, Spec Session Continuity)

Removed sections: none (template placeholders fully replaced).

Templates requiring updates:
  - ✅ .specify/memory/constitution.md (this file — populated)
  - ⚠ .specify/templates/plan-template.md — "Constitution Check" placeholder still
       reads "[Gates determined based on constitution file]"; recommend wiring
       per-principle gates in a follow-up.
  - ⚠ .specify/templates/spec-template.md — no constitution-driven mandatory
       sections to add at this time; alignment OK.
  - ⚠ .specify/templates/tasks-template.md — Phase N "Polish" wording does not
       yet reference Documentation-Consistency or UI-Mockup-First task types;
       recommend adding canonical task examples in a follow-up.
  - ✅ .specify/extensions.yml — git hooks already align with Commit Discipline.

Sources merged into this version (from
/Users/m849876/workspace/FinTech-Genie-Doc/fintech-archi/vibe_coding_constitutions/):
  - constitution_amendment.md
  - constitution_amendment_architecture.md
  - constitution_amendment_backend.md
  - constitution_amendment_python.md
  - constitution_amendment_UI.md

Amendments NOT merged (out of scope for current project):
  - constitution_amendment_RE.md (Infrastructure / Terraform) — no IaC present
       in this repo. Re-run /speckit-constitution if Terraform/AWS infra is
       added; expect a MINOR bump.

Deferred items / TODOs:
  - TODO(plan-template-gates): Encode per-principle Constitution-Check gates
       in plan-template.md "Constitution Check" section.
  - TODO(tasks-template-types): Add canonical task entries for
       "Update OpenAPI/README docs" and "UI mock + manual approval" to
       tasks-template.md.
-->

# Wolof Translate Constitution

This constitution governs the **Wolof Translate** project (root:
`offline-translate/`), an architecture-style repository hosting a React
Native/Expo mobile app, a browser webapp, and Python translation/TTS services.
It binds all sub-projects unless a more specific local constitution overrides
it (see Principle X).

## Core Principles

### I. Test-Driven Development (NON-NEGOTIABLE)

Integration tests MUST be written **before** the implementation they cover.
The Red → Green → Refactor cycle is mandatory for all new endpoints, services,
and user-visible behaviors.

**Rules**:

- Integration tests MUST be authored first for new API endpoints, then the
  implementation written to satisfy them.
- Tests MUST cover: valid inputs, invalid inputs, missing/expired auth,
  boundary conditions, and storage/persistence error paths.
- Python API tests MUST use async `pytest` with `httpx.AsyncClient`.
- Tests MUST validate HTTP status codes, response schemas, persisted state
  changes, and audit fields where applicable.
- External dependencies (S3, third-party APIs, model servers) MUST be mocked
  in integration tests so the suite is fast and deterministic.
- Test fixtures MUST provide realistic sample data — not empty stubs.
- ALL tests MUST pass before code is committed (see Commit Discipline).
- Coverage target: **>80%** for API routes and service layers.
- When repairing a failing suite, fix **one test at a time** to conserve LLM
  tokens and reviewer attention.

**Rationale**: Translation pipelines and audio I/O are easy to break silently.
Integration tests pin behavior end-to-end (transport + validation + storage)
and prevent regressions when models, dependencies, or contracts shift.

### II. Research, Design & Reuse First (NON-NEGOTIABLE)

Before adding new code, look for existing platform components, libraries, or
prior patterns to reuse. Authentication is **secure by default**.

**Rules**:

- New features MUST first survey the existing codebase for reusable modules,
  utilities, or components, and follow established patterns.
- Code changes MUST be the minimum needed to deliver the feature while
  preserving readability.
- Authentication: routes are authenticated by default. A route is public ONLY
  if explicitly marked public; the absence of a marker means auth required.
- Use **camelCase** in all API JSON request and response bodies, path
  variables, and query parameters.

**Rationale**: Reuse keeps the codebase coherent and reduces drift.
Secure-by-default eliminates whole classes of accidental exposure. Consistent
JSON casing avoids client-side translation layers.

### III. Coding Minimalism & Official-Client Preference (NON-NEGOTIABLE)

Less code is better code. Prefer official integrations over hand-rolled ones.

**Rules**:

- Minimize the number of variables and intermediate state. If two suffice,
  do not introduce a third.
- When integrating an external service or library, refrain from building
  custom wrappers. Prefer the official client and follow the official guide.
  Use the official MCP server if one is available.
- Service-client implementation MUST follow this order:
  1. Use an official or well-maintained third-party client library.
  2. If the service publishes `openapi.json`, generate the client (e.g.,
     `openapi-python-client` for Python).
  3. Only if (1) and (2) fail, hand-write a client. When doing so, consult
     `context7` MCP or the official MCP for current API documentation.
- For codegen-derived clients, add a `Makefile` target (or npm script) to
  re-generate them, e.g. `make generate-asset-svc-client` or
  `npm run generate:asset-svc-client`.
- Codegen-derived clients MUST NOT contain business logic; regeneration would
  erase it.
- **Configuration separation**:
  - Non-secret configuration MUST live in YAML config files
    (e.g., `default.yaml`, with values like `VITE_AUTH0_AUDIENCE`).
  - Secret configuration MUST be read from environment variables
    (e.g., `OPEN_AI_API_KEY`).

**Rationale**: Official clients absorb upstream changes for free; codegen
keeps contracts honest; clear config separation prevents both secret leakage
and silent prod misconfiguration.

### IV. API & Data Contract Standards (NON-NEGOTIABLE)

REST APIs follow Google's API design guide. Database schemas use consistent
conventions.

**Rules — REST API**:

- Follow the Google API Design Guide and Google Cloud REST best-practices
  references.
- Custom (non-CRUD) operations use the **`{resource}:{verb}`** form,
  e.g. `POST /events:search` (not `POST /search/events`).
- Endpoint paths use the **plural** noun, e.g. `/companies`, not `/company`.
- Use **camelCase** in path variables, query parameters, and request/response
  bodies (reinforces Principle II).

**Rules — Database**:

- Table names use the **singular** form, e.g. `company_event`, not
  `company_events`.
- Do NOT add `CHECK` constraints on columns unless explicitly instructed.
  Validation belongs at the application layer.
- When analyzing a schema, read **all** Flyway (or equivalent) migration
  scripts before drawing conclusions — schemas evolve across migrations.

**Rationale**: Predictable URL structure and JSON casing reduce client
friction. Centralizing validation in the application keeps it testable and
versionable, instead of scattered across DB constraints that are hard to
evolve.

### V. Database Schema Authority — RED ALERT (NON-NEGOTIABLE)

**Application code MUST NOT change database schema.** Any DDL operation
(`CREATE`/`ALTER`/`DROP TABLE`, `CREATE INDEX`, etc.) is prohibited from
application runtime paths.

**Rules**:

- Schema changes MUST flow through a dedicated migration tool (Flyway or
  equivalent), version-controlled and reviewed.
- ORM `create_all()`, ad-hoc `ALTER TABLE` strings, or "auto-migrate on boot"
  features are forbidden in application code.
- Violating this rule requires **explicit, recorded user permission** before
  the change is made.

**Rationale**: Application-driven DDL turns deploys into irreversible data
events, breaks parallel environments, and bypasses peer review. Migration
tools provide ordered, idempotent, auditable schema evolution.

### VI. Comments Discipline (NON-NEGOTIABLE)

Inline comments MUST be traceable to the spec session that introduced them.

**Rules**:

- Every comment in source code MUST be suffixed with the spec name and task
  ID, in the form: `<comment text> ({spec-name}:{task-name})`.
- Example: `# replace LLM claude with cursor (001-change-llm:T001)`.
- This applies to all languages. Use the language's normal comment syntax;
  the suffix format is identical.

**Rationale**: The suffix lets any reader trace a line of code back to the
specification that motivated it, without searching git history or chat logs.

### VII. Documentation Consistency (NON-NEGOTIABLE)

Documentation MUST stay in sync with the code it documents.

**Rules**:

- When wrapping up a feature, add an explicit task to update affected
  documentation: OpenAPI/Swagger specs, READMEs, runbooks, and feature docs.
- For features planned via Spec Kit, the documentation-update task MUST be
  recorded in `tasks.md` (typically in the "Polish & Cross-Cutting Concerns"
  phase).

**Rationale**: Stale docs erode trust faster than missing docs. Treating
doc updates as explicit tasks ensures they ship with the code, not after.

### VIII. UI Mockup-First (NON-NEGOTIABLE for graphical surfaces)

For any feature with a UI, the visual layout MUST be implemented and approved
**before** business logic is wired up.

**Rules**:

- During task planning (`tasks.md`), include a UI-mock task that builds the
  screen with **mock data only** — no API calls, no real state.
- Add a **manual approval task** for the user to review and sign off the
  mock before implementation tasks proceed.
- This applies to both `mobile-app/` (Expo / React Native) and `webapp/`
  surfaces.

**Rationale**: UI is the cheapest layer to iterate on. Aligning visuals
before logic prevents expensive rework and keeps UX decisions out of the
critical path.

### IX. Python Conventions (NON-NEGOTIABLE for Python code)

Python code MUST follow PEP 8 and the project's dependency conventions.

**Rules — Naming**:

- Variables, functions, and module names: `snake_case`.
- Classes: `PascalCase`.
- Constants: `UPPER_SNAKE_CASE`.
- Strictly follow other PEP 8 conventions for line length, imports, and
  whitespace.

**Rules — Dependency Management**:

- Install Python packages via `pip install -r requirements.txt` (or the
  project's `pyproject.toml` toolchain), not one at a time.
- When individual `pip install` is unavoidable, **always quote** version
  specifiers, e.g. `pip install "resend>=2.0.0"`, to prevent the shell from
  interpreting `>=` as output redirection.

**Rationale**: PEP 8 compliance eases onboarding and code review. Quoted
specifiers prevent the most common shell-redirection foot-gun that silently
truncates dependency intent.

### X. Constitution Hierarchy in Multi-Repo Projects (NON-NEGOTIABLE)

This repository is an architecture project: child sub-projects (e.g.,
`mobile-app/`, `webapp/`, future service repos) MAY have their own
constitutions.

**Rules**:

- The constitution in the root (this file) is the **parent constitution**.
- A constitution inside a sub-project is a **child constitution**.
- A constitution inside the working directory is the **local constitution**.
- When working in a child repo, comply with its **local** constitution. Do
  NOT import rules from sibling repos.
- When a child constitution contradicts the parent, the **child** wins.
- When a local constitution contradicts a sibling, the **local** wins.
- Sibling constitutions MUST NOT be used to guide development in another
  sub-project.

**Rationale**: Sub-projects evolve at different paces and may have
domain-specific needs (e.g., the mobile-app's offline-first constraints
differ from a backend service's deployment constraints). The hierarchy keeps
guidance unambiguous when constitutions diverge.

## Additional Constraints — Technology Stack & Configuration Standards

This section captures cross-cutting standards that bind all sub-projects.

**Repository layout**:

- Architecture root: `offline-translate/` — owns this constitution, the
  Python translation/TTS servers, and orchestration scripts.
- Sub-projects: `mobile-app/` (Expo SDK 55 / React Native 0.76+),
  `webapp/` (browser UI), plus on-disk model assets and generated audio.

**Configuration standards** (reinforce Principle III):

- Non-secret values: YAML configuration files checked into the repo.
- Secret values: environment variables only — never committed, never written
  to config files.

**Tooling preferences** (reinforce Principle III):

- For library docs, configuration, and code generation: use the `context7`
  MCP server. If unavailable, warn and request explicit user permission to
  proceed without it.
- For code search inside this codebase: use the `serena` MCP server before
  falling back to `grep`/`find`.

**External integrations**: Always prefer official MCP servers and official
client SDKs. Codegen from `openapi.json` is preferred over hand-written
clients (Principle III).

## Development Workflow

### Git Worktree Workflow (NON-NEGOTIABLE)

Feature work MUST occur in a dedicated git worktree, not on the main project
checkout.

- ALL feature branches MUST be cut from the `dev` branch (project default).
- Create a worktree branch matching the spec name format, e.g.
  `007-log-in-page` (or a user-provided name).
- The remote branch name MUST match the spec name exactly.
- If sub-repos under the working directory will be changed in this spec
  session, cut a branch with the same name in each affected sub-repo.
- Removing a worktree before its branch is merged to `dev` is prohibited.

**Rationale**: Worktrees enable true parallel development, prevent
cross-contamination, and ensure work is always tracked on the correct branch.
Cutting matching branches in sub-repos keeps multi-repo features atomic.

### Commit Discipline (NON-NEGOTIABLE)

All work decomposes into reviewable, testable commits.

- Upon completion of each phase, new code or documents MUST be committed
  immediately.
- The agent MUST request explicit user approval before running `git commit`.
- Commit messages MUST be prefixed with the spec session name and phase, in
  the form: `{SPEC_NAME}:{PHASE_NAME}: {concise description}` —
  e.g. `005-build-a-bff:Phase1: add user authentication service`.
- Each commit MUST be a complete working unit (tests pass, code compiles).
- Commits MUST NOT bundle unrelated changes from different subtasks.
- Work-in-progress commits are prohibited; only commit completed subtasks.

**Rationale**: Small, focused commits enable thorough review, simplify
`git bisect`, and keep rollbacks granular. The spec/phase prefix turns
`git log` into a project audit trail.

### Spec Session Continuity (NON-NEGOTIABLE)

When chat history is cleared to save tokens, the agent MUST recover spec
context automatically — never spawn a duplicate spec.

- Before executing `/speckit.specify`, `/speckit.plan`, `/speckit.tasks`,
  `/speckit.implement`, or any spec command, if the current spec session
  cannot be identified from chat history, perform automatic context
  recovery.
- Recovery procedure:
  1. Read the current git branch name.
  2. If it matches a known spec name, RESUME that spec — do NOT create a
     new one.
  3. If it does not match, fall back to the normal numbering logic from the
     Git Worktree Workflow.
- Recovery MUST be silent (no user prompt for the lookup itself).
- Commands MUST log which spec session is being resumed, e.g.
  `Resuming spec session: 008-fix-signin-page`.

**Rationale**: Token-based context loss is routine. Without auto-recovery,
the agent re-creates specs and produces duplicate worktrees, polluting the
branch graph and confusing reviewers.

## Governance

This constitution supersedes all ad-hoc team practices, individual
preferences, and prior informal guidance.

**Compliance**:

- Every PR / spec gate MUST verify compliance with applicable principles.
- Plans (`plan.md`) MUST include a "Constitution Check" gate before Phase 0
  research and re-check after Phase 1 design (see plan-template.md).
- Violations MUST be documented in the plan's "Complexity Tracking" table
  with explicit justification, or the plan MUST be revised to comply.

**Amendments**:

- Amendments are made via the `/speckit-constitution` skill.
- The skill propagates changes to dependent templates (plan, spec, tasks)
  and emits a Sync Impact Report at the top of this file.
- Amendment sources for this project live at
  `/Users/m849876/workspace/FinTech-Genie-Doc/fintech-archi/vibe_coding_constitutions/`.

**Versioning policy** (semantic):

- **MAJOR**: Backward-incompatible governance or principle removal /
  redefinition.
- **MINOR**: New principle or section added; materially expanded guidance.
- **PATCH**: Clarifications, wording fixes, non-semantic refinements.

**Runtime guidance**: Day-to-day development guidance lives in the project's
`CLAUDE.md` files (root and sub-projects). Those files are operational
companions to this constitution; if they conflict, the constitution wins
unless a child constitution explicitly overrides it (Principle X).

**Version**: 1.0.0 | **Ratified**: 2026-04-17 | **Last Amended**: 2026-04-17
