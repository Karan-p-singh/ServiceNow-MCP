# ServiceNow MCP Server v2 — Implementation Plan (Epics & Stories)

Last Updated: 2026-02-28 20:03 PST
Planning Horizon: MVP → v1 → v1.1 (Enterprise Hardening) → Optional ITSM Edition
Status Model: `Backlog | Ready | In Progress | Blocked | Done`

Current Execution Snapshot (source of live truth: `BUILD_STATUS_BOARD.md`):

- EPIC-A is complete (`Done`)
- EPIC-B is complete (`Done`)
- Completed in EPIC-A: `A1 — Server bootstrap + tool registry`, `A2 — Standard response envelope`, `A3 — Tier enforcement middleware`, `A4 — Policy engine (scope/global/break-glass)`, `A5 — Structured audit logging`, `A6 — HTTP/SSE transport endpoint + URL-first MCP runtime`
- Completed in EPIC-B: `B1 — Auth + client abstraction`, `B2 — Retry/pagination/error normalization`, `B3 — Instance capability discovery`, `B4 — README-aligned structure adoption`
- Next queued cross-epic focus: `E1`, `D1`, `D2`, `D3`

---

## 1) Planning Conventions

- **Epic ID format:** `EPIC-A` … `EPIC-H`
- **Story ID format:** `A1`, `A2`, `B1`, etc.
- **Task ID format:** `A1-T1`, `A1-T2`, etc.
- **Effort scale:** S (0.5–1d), M (1–3d), L (3–5d), XL (5+d)
- **Priority scale:** P0 (critical), P1 (high), P2 (normal)
- **Definition of Done (global for every story):**
  1. Tier declared and enforced
  2. Policy checks wired
  3. Validation integrated (summary on read, gating on write)
  4. Structured audit logging in place
  5. Tests added/updated
  6. Docs and tracking files updated

---

## 2) Delivery Phases & Epic Mapping

| Phase   | Weeks | Focus                                                  | Epics                  |
| ------- | ----: | ------------------------------------------------------ | ---------------------- |
| Phase 1 |   1–2 | Core skeleton + first vertical slice                   | EPIC-A, EPIC-B, EPIC-E |
| Phase 2 |   3–5 | Validation MVP + script tooling                        | EPIC-D, EPIC-E         |
| Phase 3 |   6–8 | Companion app + ACL authoritative mode                 | EPIC-C, EPIC-A         |
| Phase 4 |  9–12 | Update set reads + gaps + capture verify               | EPIC-F                 |
| Phase 5 | 13–16 | Commit preview + controlled commit + rollback planning | EPIC-F                 |
| Phase 6 | 17–20 | Flow/workflow parity                                   | EPIC-E, EPIC-D         |
| Phase 7 | 21–24 | Enterprise hardening + release readiness               | EPIC-G, EPIC-H         |

---

## 3) Epic Breakdown (Stories, Dependencies, Acceptance)

## EPIC-A — Core MCP Framework

Goal: Establish safe request lifecycle, standardized envelope, tier/policy enforcement, and auditability.

### Story A1 — Server bootstrap + tool registry

- **Priority:** P0 | **Effort:** L | **Depends on:** None
- **User Story:** As a platform engineer, I need a stable MCP runtime and tool registry so all tools behave consistently.
- **Tasks:**
  - A1-T1 Build server entrypoint and lifecycle hooks
  - A1-T2 Implement tool registration abstraction with tier metadata
  - A1-T3 Add request context (request_id/correlation_id)
- **Acceptance Criteria:**
  - Server boots and exposes registered tools
  - Every tool invocation includes deterministic request metadata

### Story A2 — Standard response envelope

- **Priority:** P0 | **Effort:** M | **Depends on:** A1
- **User Story:** As a tool consumer, I need a uniform response envelope to automate downstream handling.
- **Tasks:**
  - A2-T1 Define shared schema `{request_id, instance, tool, tier, policy, validation_summary, data, errors}`
  - A2-T2 Apply schema middleware to all tools
- **Acceptance Criteria:**
  - 100% tool responses conform to envelope contract

### Story A3 — Tier enforcement middleware

- **Priority:** P0 | **Effort:** M | **Depends on:** A1
- **User Story:** As a security lead, I want hard tier limits so dangerous operations cannot execute by mistake.
- **Tasks:**
  - A3-T1 Enforce `tier_max` preflight check
  - A3-T2 Enforce T3 contract (`confirm=true`, non-empty `reason`)
- **Acceptance Criteria:**
  - Calls above tier max are blocked before ServiceNow call
  - T3 refusal paths logged with explicit reason

### Story A4 — Policy engine (scope/global/break-glass)

- **Priority:** P0 | **Effort:** L | **Depends on:** A3
- **User Story:** As an architect, I need configurable governance policy so writes follow enterprise rules.
- **Tasks:**
  - A4-T1 Allowed scopes enforcement
  - A4-T2 `deny_global_writes` and `enforce_changeset_scope`
  - A4-T3 Exception allowlist + break-glass contract
- **Acceptance Criteria:**
  - Cross-scope and disallowed writes blocked with explainable policy output

### Story A5 — Structured audit logging

- **Priority:** P0 | **Effort:** M | **Depends on:** A2
- **User Story:** As compliance, I need redacted, structured logs to audit tool behavior and risky actions.
- **Tasks:**
  - A5-T1 JSON log schema and redaction guard
  - A5-T2 Include policy/validation decisions and write metadata
- **Acceptance Criteria:**
  - All calls logged with redaction and correlation IDs

### Story A6 — HTTP/SSE transport endpoint + URL-first MCP runtime

- **Priority:** P0 | **Effort:** M | **Depends on:** A1, A2
- **User Story:** As an LLM platform integrator, I need a true MCP URL endpoint so clients can connect over HTTP/SSE without local stdio command wiring.
- **Tasks:**
  - A6-T1 Add MCP transport configuration (`http-sse` default, `stdio` fallback)
  - A6-T2 Implement HTTP endpoint (`/mcp`) + SSE stream (`/mcp/sse`) with JSON-RPC handling
  - A6-T3 Update startup output and documentation for URL-first integration
- **Acceptance Criteria:**
  - Default startup exposes `http://localhost:3001/mcp`
  - `tools/list` and `tools/call` available via MCP JSON-RPC over HTTP
  - `stdio` remains available as explicit override for legacy clients

---

## EPIC-B — ServiceNow Client & Connectivity

Goal: Reliable, secure, and release-tolerant ServiceNow API foundation.

### Story B1 — Auth + client abstraction

- **Priority:** P0 | **Effort:** L | **Depends on:** A1
- **Tasks:** OAuth first, basic optional, per-instance config isolation
- **Acceptance Criteria:** No credentials in outputs/logs; auth mode selectable per instance

### Story B2 — Retry, pagination, and error normalization

- **Priority:** P0 | **Effort:** M | **Depends on:** B1
- **Tasks:** Backoff, Table API pagination, map 401/403/404/429/5xx
- **Acceptance Criteria:** Robust behavior under transient errors and rate limits

### Story B3 — Instance capability discovery (`sn.instance.info`)

- **Priority:** P0 | **Effort:** M | **Depends on:** B2
- **Tasks:** instance metadata + plugin/release/capability summary
- **Acceptance Criteria:** Capability response supports conditional rule/tool behavior

### Story B4 — README-aligned structure adoption (incremental, migration-safe)

- **Priority:** P1 | **Effort:** M | **Depends on:** B1
- **User Story:** As a platform engineer, I need implementation work to follow the README target layout (`src/server`, `src/servicenow`, `src/validation`) so Epic B+ delivery stays predictable while preserving current runtime stability.
- **Tasks:**
  - B4-T1 Define and document target folder ownership boundaries for server, ServiceNow client, and validation layers
  - B4-T2 Route new Epic B artifacts into README-aligned paths by default
  - B4-T3 Document temporary deviations with rationale and migration notes toward TS/v2 target
- **Acceptance Criteria:**
  - New/updated Epic B assets follow README-recommended structure by default
  - Any temporary deviation is tracked with explicit rationale and migration intent
  - Existing JS runtime remains stable while incremental alignment is applied

---

## EPIC-C — Companion App (Authoritative Checks)

Goal: Provide platform-native truth where external APIs are insufficient.

### Story C1 — Scoped app packaging + version contract

- **Priority:** P0 | **Effort:** L | **Depends on:** B3
- **Acceptance:** MCP detects installed version; missing/outdated state is explicit

### Story C2 — ACL authoritative endpoint

- **Priority:** P0 | **Effort:** L | **Depends on:** C1
- **Acceptance:** endpoint returns allow/deny + evaluated ACL context summary

### Story C3 — Scope/capture helper endpoints

- **Priority:** P1 | **Effort:** M | **Depends on:** C1
- **Acceptance:** scope guard and capture verification helper APIs available

### Story C4 — Dual-mode `sn.acl.trace`

- **Priority:** P0 | **Effort:** M | **Depends on:** C2
- **Acceptance:** discovery + authoritative modes with confidence/limitations contract

---

## EPIC-D — Validation Engine & Rulepack Governance

Goal: Deterministic, low-latency validation and strict write gating.

### Story D1 — Validation runtime framework

- **Priority:** P0 | **Effort:** L | **Depends on:** A2, B3
- **Acceptance:** same input/config yields same result; reusable for all artifact types

### Story D2 — Script rulepack v1

- **Priority:** P0 | **Effort:** XL | **Depends on:** D1
- **Acceptance:** 20–40 rules; minimum 10 CRITICAL/HIGH; metadata + version included in reports

### Story D3 — Read summary + write gating integration

- **Priority:** P0 | **Effort:** M | **Depends on:** D1, D2
- **Acceptance:** every read returns summary; CRITICAL blocks writes; HIGH requires acknowledgments

### Story D4 — Rulepack governance and suppression controls

- **Priority:** P1 | **Effort:** M | **Depends on:** D2
- **Acceptance:** per-rule suppression config + change notes + governance record

---

## EPIC-E — Developer Artifact Tooling (Scripts, Flows, Workflows)

Goal: High-value engineering tools with validation and evidence-backed references.

### Story E1 — Script read/list/search tools

- **Priority:** P0 | **Effort:** L | **Depends on:** B2, D3
- **Acceptance:** paginated search/list, validation summaries attached

### Story E2 — Script refs/deps with evidence

- **Priority:** P0 | **Effort:** L | **Depends on:** E1
- **Acceptance:** hard/soft/heuristic evidence arrays with confidence

### Story E3 — Script create/update (tiered)

- **Priority:** P0 | **Effort:** M | **Depends on:** D3, A4
- **Acceptance:** validation gates enforced; before/after metadata logged

### Story E4 — Flow list/get/validate

- **Priority:** P1 | **Effort:** L | **Depends on:** B3, D1
- **Acceptance:** release-aware adapters + meaningful findings

### Story E5 — Workflow list/get/validate

- **Priority:** P1 | **Effort:** L | **Depends on:** E4
- **Acceptance:** parity with flow contract where feasible

---

## EPIC-F — Update Set, Commit, and Rollback Planning

Goal: Honest deployment intelligence and controlled high-risk operations.

### Story F1 — Changeset read tools

- **Priority:** P0 | **Effort:** M | **Depends on:** B2
- **Acceptance:** list/get/contents/export complete with pagination

### Story F2 — Gap detection with confidence tiers

- **Priority:** P0 | **Effort:** XL | **Depends on:** F1
- **Acceptance:** hard/soft/heuristic output with evidence; no completeness claims

### Story F3 — Capture verify with deterministic reasons

- **Priority:** P0 | **Effort:** L | **Depends on:** F1, C3
- **Acceptance:** consistent reason codes for common not-captured scenarios

### Story F4 — Commit preview dry-run

- **Priority:** P0 | **Effort:** M | **Depends on:** F1
- **Acceptance:** conflict + scope impact report; no write side effects

### Story F5 — Controlled commit (T3)

- **Priority:** P0 | **Effort:** L | **Depends on:** F4, A3, A4
- **Acceptance:** no commit without confirm/reason; snapshot coverage matrix emitted

### Story F6 — Rollback plan generator

- **Priority:** P1 | **Effort:** L | **Depends on:** F5
- **Acceptance:** explicit restorable/non-restorable split, manual steps, risk level

---

## EPIC-G — Quality Engineering & Test Strategy

Goal: Deterministic confidence with release-safe behavior.

### Story G1 — Unit tests for core + validation

- **Priority:** P0 | **Effort:** L | **Depends on:** A/D work

### Story G2 — Integration tests against dev instance

- **Priority:** P0 | **Effort:** XL | **Depends on:** B/E/F/C work

### Story G3 — Golden fixtures and regression snapshots

- **Priority:** P1 | **Effort:** M | **Depends on:** D/E/F

### Story G4 — CI quality gates

- **Priority:** P0 | **Effort:** M | **Depends on:** G1, G2

---

## EPIC-H — Enterprise Hardening & Release Readiness

Goal: Security/governance readiness for enterprise adoption.

### Story H1 — SIEM/Webhook export

- **Priority:** P1 | **Effort:** M | **Depends on:** A5

### Story H2 — Tool bundles + deploy profiles

- **Priority:** P1 | **Effort:** M | **Depends on:** A4

### Story H3 — Security documentation pack

- **Priority:** P0 | **Effort:** M | **Depends on:** C/A/H1

### Story H4 — Operational runbook/admin guide

- **Priority:** P1 | **Effort:** M | **Depends on:** all major epics

---

## 4) Initial Sequenced Story Queue (Execution Order)

1. A1 → A2 → A3 → A5
2. B1 → B4 → B2 → B3
3. E1 (minimal script.get) + D1 (engine skeleton)
4. D2 → D3
5. E1 full + E2 + E3
6. C1 → C2 → C4 + A4
7. F1 → F2 → F3
8. F4 → F5 → F6
9. E4 → E5
10. G1 → G2 → G3 → G4
11. H1 → H2 → H3 → H4

---

## 5) Story Lifecycle Rules (Tracking Discipline)

When a story status changes, update all of:

1. `BUILD_STATUS_BOARD.md`
2. `BUILD_ACTIVITY_LOG.md`
3. `MILESTONES_AND_GATES.md` (if gate impact)
4. `RISKS_AND_DECISIONS.md` (if risk/decision impact)

Required metadata on each transition:

- Timestamp
- From → To status
- Owner
- Why changed
- Next validation step
