# ServiceNow MCP Server v2 — Build Status Board

Last Updated: 2026-03-01 03:37 PST
Legend: `Backlog | Ready | In Progress | Blocked | Done`

---

## 1) Phase Progress Snapshot

| Phase | Name                               | Status  | Progress | Notes                                                                                                                           |
| ----- | ---------------------------------- | ------- | -------: | ------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Foundation + First Vertical Slice  | Done    |     100% | Gate G1 passed: E1 minimal (`sn.script.get` + validation summary) and first vertical-slice demo evidence captured               |
| 2     | Validation MVP + Script Tooling    | Done    |     100% | Gate G2 passed: validation runtime/rulepack, script tooling E2E, and unit coverage completed                                    |
| 3     | Optional Companion Authority Pilot | Done    |     100% | Phase B optional capability: companion health/version contract + authoritative ACL path + dual-mode degraded behavior validated |
| 4     | Update Set MVP                     | Done    |     100% | Gate G4 passed: F1/F2/F3 complete and non-prod integration validation completed (`npm run test:g4:live`)                        |
| 5     | Commit + Rollback Planning         | Done    |     100% | Gate G5 passed: controlled T3 commit + rollback plan generator delivered with validation evidence (`npm run test:g5`)           |
| 6     | Flows + Workflows Coverage         | Done    |     100% | Gate G6 passed: flow/workflow tooling parity + rulepack-backed validation coverage (`npm run test:g6`)                          |
| 7     | Enterprise Hardening               | Backlog |       0% | Final hardening and release prep                                                                                                |

---

## 2) Epic Board

| Epic ID | Epic Name                           | Owner   | Status      | Start      | Target End | Progress | Blocking Dependencies     |
| ------- | ----------------------------------- | ------- | ----------- | ---------- | ---------- | -------: | ------------------------- |
| EPIC-A  | Core MCP Framework                  | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | None                      |
| EPIC-B  | ServiceNow Client & Connectivity    | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | EPIC-A (A1 baseline)      |
| EPIC-C  | Optional Companion Authority        | SN Dev  | Done        | 2026-03-01 | 2026-03-01 |     100% | EPIC-B                    |
| EPIC-D  | Validation Engine & Rulepacks       | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | EPIC-A, EPIC-B            |
| EPIC-E  | Developer Artifact Tooling          | Eng     | Done        | 2026-02-28 | 2026-03-01 |     100% | EPIC-B, EPIC-D            |
| EPIC-F  | Update Set & Commit Operations      | Eng     | Done        | 2026-03-01 | 2026-03-01 |     100% | EPIC-E (baseline), EPIC-C |
| EPIC-G  | Quality Engineering & Test Strategy | Eng/QA  | In Progress | 2026-02-28 | TBD        |      10% | Core feature completeness |
| EPIC-H  | Enterprise Hardening                | Eng/Sec | Backlog     | TBD        | TBD        |       0% | EPIC-A..G maturity        |

---

## 3) Story Kanban

## In Progress

- G2 — Integration tests against dev instance

## Ready

- G4 — CI quality gates

## Backlog

- C3 — Scope/capture helper endpoints
- D4 — Rulepack and gating governance
- G1, G3, G4 — quality/testing
- H1, H2, H3, H4 — enterprise hardening

## Blocked

- Optional companion scope ownership hardening — deployment script remains strict scope-bootstrap + scoped-update only (no global create path) for teams that choose Phase B pilot.

## Done

- Planning package setup completed (tracking + implementation plan files)
- A1 — Server bootstrap + tool registry
- A2 — Standard response envelope
- A3 — Tier enforcement middleware
- A4 — Policy engine (scope/global/break-glass)
- A5 — Structured audit logging
- A6 — HTTP/SSE transport endpoint + URL-first MCP runtime
- B1 — Auth + client abstraction
- B2 — Retry/pagination/error normalization
- B3 — Instance capability discovery (`sn.instance.info`)
- B4 — README-aligned structure adoption (incremental, migration-safe)
- E1 (minimal) — `sn.script.get` read path + validation summary attachment
- D1 — Validation runtime framework
- D2 — Script rulepack v1 baseline
- D3 — Read summary + write gating integration
- E1 (full) — `sn.script.list` + `sn.script.search` + upgraded `sn.script.get`
- E2 — `sn.script.refs` + `sn.script.deps` evidence outputs
- E3 — `sn.script.create` + real `sn.script.update` with validation gating and audit metadata
- G1 (partial) — Unit tests for validation runtime and script tooling (`npm test`)
- G1 demo evidence — first vertical slice smoke evidence captured
- G1 connectivity diagnostics baseline — `npm run test:live` and `npm run test:live:mcp` scripts added and validated
- G1 connectivity diagnostics hardening — assertion-driven protocol/tool contract tests added (including JSON-RPC negative-path checks) and validated
- Secure env publishing baseline — `.env.example` template + `.gitignore` protection + README setup guidance
- G1 connectivity diagnostics stabilization — plugin probe now uses `v_plugin` preferred with `sys_plugins` fallback, and ACL-restricted paths are classified as limited-access warnings in `test:live` while preserving overall connectivity pass criteria
- G1 transport output clarity — `test:live:mcp` now includes an explicit interpretation summary so expected guardrail warnings (`POLICY_BLOCKED`, `T3_CONFIRMATION_REQUIRED`) are not confused with test failures
- C1 — Optional companion integration contract: config (`SN_COMPANION_*`), health/version detection via companion client, and `sn.instance.info` companion capability output
- C2 — Optional authoritative ACL integration for `sn.acl.trace` via companion endpoint contract
- C4 — Dual-mode `sn.acl.trace` with deterministic degraded reason codes and explicit discovery limitations
- G3 evidence — companion + ACL trace behavior validated by unit tests (`tests/companion.client.test.js`, `tests/acl.trace.test.js`) and passing `npm test`
- EPIC-C — Optional companion authority pilot (C1/C2/C4) complete; Gate G3 exit achieved
- EPIC-C live deployment verification — companion endpoints validated in target Zurich instance via discovered base URI (`/api/240215/v1`) using `npm run test:companion:live`
- F1 — Changeset read tooling delivered: `sn.changeset.list`, `sn.changeset.get`, `sn.changeset.contents`, `sn.changeset.export` with pagination-aware client support and tests (`npm test`, `node src/index.js --smoke`)
- F2 — Gap detection delivered: `sn.changeset.gaps` with confidence-tier outputs (`hard_dependencies`, `soft_dependencies`, `heuristic_candidates`) and evidence-backed reason codes
- F3 — Capture verification delivered: `sn.updateset.capture.verify` with deterministic reason codes (`CAPTURED_IN_TARGET_SET`, `CAPTURED_IN_DIFFERENT_SET`, `NOT_CAPTURED`)
- F4 — Commit preview dry-run delivered: `sn.changeset.commit.preview` with read-only no-side-effect contract, scope impact summary, potential conflict candidates, and mitigation guidance
- F5 — Controlled commit delivered: `sn.changeset.commit` with T3 confirm/reason contract, snapshot coverage matrix, and explicit high-risk audit trace metadata
- F6 — Rollback plan generator delivered: `sn.rollback.plan.generate` with restorable/non-restorable split, manual steps, risk level, and non-restorable declarations
- E4 — Flow tooling parity delivered: `sn.flow.list`, `sn.flow.get`, `sn.flow.validate`
- E5 — Workflow tooling parity delivered: `sn.workflow.list`, `sn.workflow.get`, `sn.workflow.validate`
- D coverage expanded: added flow/workflow rulepack-backed validation summaries (`flows-v1`, `workflows-v1`)
- G5 validation harness added: `scripts/test-g5-validation.js` + `npm run test:g5` and `artifacts/g5-validation-summary.json`
- G6 validation harness added: `scripts/test-g6-validation.js` + `npm run test:g6` and `artifacts/g6-validation-summary.json`
- G4 validation harness added: `scripts/test-g4-validation.js` + `npm run test:g4` and `artifacts/g4-validation-summary.json`
- G4 non-prod integration validation completed: `scripts/test-g4-integration-live.js` + `npm run test:g4:live` and `artifacts/g4-integration-summary.json`

---

## 4) Immediate Next 10 Stories (Execution Queue)

1. G2 — Integration tests against dev instance
2. G4 — CI quality gates
3. C3 — Scope/capture helper endpoints
4. D4 — Rulepack and gating governance
5. H1 — SIEM/webhook export
6. H2 — Tool bundles + deploy profiles
7. H3 — security docs pack
8. H4 — admin/runbook docs
9. G3 — Golden fixtures and regression snapshots
10. Release readiness packaging + PRD acceptance audit
