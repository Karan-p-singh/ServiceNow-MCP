# ServiceNow MCP Server v2 — Build Status Board

Last Updated: 2026-03-01 02:28 PST
Legend: `Backlog | Ready | In Progress | Blocked | Done`

---

## 1) Phase Progress Snapshot

| Phase | Name                               | Status      | Progress | Notes                                                                                                                           |
| ----- | ---------------------------------- | ----------- | -------: | ------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Foundation + First Vertical Slice  | Done        |     100% | Gate G1 passed: E1 minimal (`sn.script.get` + validation summary) and first vertical-slice demo evidence captured               |
| 2     | Validation MVP + Script Tooling    | Done        |     100% | Gate G2 passed: validation runtime/rulepack, script tooling E2E, and unit coverage completed                                    |
| 3     | Optional Companion Authority Pilot | Done        |     100% | Phase B optional capability: companion health/version contract + authoritative ACL path + dual-mode degraded behavior validated |
| 4     | Update Set MVP                     | In Progress |      70% | F1/F2/F3 complete with unit+smoke+Gate G4 validation evidence; remaining exit item is non-prod integration flow validation      |
| 5     | Commit + Rollback Planning         | Backlog     |       0% | Dependent on Phase 4 readiness                                                                                                  |
| 6     | Flows + Workflows Coverage         | Backlog     |       0% | Dependent on core validation maturity                                                                                           |
| 7     | Enterprise Hardening               | Backlog     |       0% | Final hardening and release prep                                                                                                |

---

## 2) Epic Board

| Epic ID | Epic Name                           | Owner   | Status      | Start      | Target End | Progress | Blocking Dependencies     |
| ------- | ----------------------------------- | ------- | ----------- | ---------- | ---------- | -------: | ------------------------- |
| EPIC-A  | Core MCP Framework                  | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | None                      |
| EPIC-B  | ServiceNow Client & Connectivity    | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | EPIC-A (A1 baseline)      |
| EPIC-C  | Optional Companion Authority        | SN Dev  | Done        | 2026-03-01 | 2026-03-01 |     100% | EPIC-B                    |
| EPIC-D  | Validation Engine & Rulepacks       | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | EPIC-A, EPIC-B            |
| EPIC-E  | Developer Artifact Tooling          | Eng     | In Progress | 2026-02-28 | TBD        |      55% | EPIC-B, EPIC-D            |
| EPIC-F  | Update Set & Commit Operations      | Eng     | In Progress | 2026-03-01 | TBD        |      55% | EPIC-E (baseline), EPIC-C |
| EPIC-G  | Quality Engineering & Test Strategy | Eng/QA  | In Progress | 2026-02-28 | TBD        |      10% | Core feature completeness |
| EPIC-H  | Enterprise Hardening                | Eng/Sec | Backlog     | TBD        | TBD        |       0% | EPIC-A..G maturity        |

---

## 3) Story Kanban

## In Progress

- E4 — Flow list/get/validate

## Ready

- F4 — Commit preview dry-run

## Backlog

- C3 — Scope/capture helper endpoints
- D4 — Rulepack and gating governance
- E4, E5 — flows, workflows
- F4, F5, F6 — changesets, commit, rollback plan
- G1, G2, G3, G4 — quality/testing
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
- G4 validation harness added: `scripts/test-g4-validation.js` + `npm run test:g4` and `artifacts/g4-validation-summary.json`

---

## 4) Immediate Next 10 Stories (Execution Queue)

1. E4 — Flow list/get/validate parity
2. E5 — Workflow list/get/validate parity
3. G2 — Integration tests against dev instance
4. G4 — CI quality gates
5. C3 — Scope/capture helper endpoints
6. D4 — Rulepack and gating governance
7. F4 — Commit preview dry-run
8. H1 — SIEM/webhook export
9. F5 — Controlled commit (T3)
10. F6 — Rollback plan generator
