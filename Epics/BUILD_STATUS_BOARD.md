# ServiceNow MCP Server v2 — Build Status Board

Last Updated: 2026-02-28 22:32 PST
Legend: `Backlog | Ready | In Progress | Blocked | Done`

---

## 1) Phase Progress Snapshot

| Phase | Name                              | Status  | Progress | Notes                                                                                                             |
| ----- | --------------------------------- | ------- | -------: | ----------------------------------------------------------------------------------------------------------------- |
| 1     | Foundation + First Vertical Slice | Done    |     100% | Gate G1 passed: E1 minimal (`sn.script.get` + validation summary) and first vertical-slice demo evidence captured |
| 2     | Validation MVP + Script Tooling   | Done    |     100% | Gate G2 passed: validation runtime/rulepack, script tooling E2E, and unit coverage completed                      |
| 3     | Companion App + ACL Authoritative | Backlog |       0% | Dependent on Phase 2 exits                                                                                        |
| 4     | Update Set MVP                    | Backlog |       0% | Dependent on Phase 3 readiness                                                                                    |
| 5     | Commit + Rollback Planning        | Backlog |       0% | Dependent on Phase 4 readiness                                                                                    |
| 6     | Flows + Workflows Coverage        | Backlog |       0% | Dependent on core validation maturity                                                                             |
| 7     | Enterprise Hardening              | Backlog |       0% | Final hardening and release prep                                                                                  |

---

## 2) Epic Board

| Epic ID | Epic Name                           | Owner   | Status      | Start      | Target End | Progress | Blocking Dependencies     |
| ------- | ----------------------------------- | ------- | ----------- | ---------- | ---------- | -------: | ------------------------- |
| EPIC-A  | Core MCP Framework                  | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | None                      |
| EPIC-B  | ServiceNow Client & Connectivity    | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | EPIC-A (A1 baseline)      |
| EPIC-C  | Companion App                       | SN Dev  | Backlog     | TBD        | TBD        |       0% | EPIC-B                    |
| EPIC-D  | Validation Engine & Rulepacks       | Eng     | Done        | 2026-02-28 | 2026-02-28 |     100% | EPIC-A, EPIC-B            |
| EPIC-E  | Developer Artifact Tooling          | Eng     | In Progress | 2026-02-28 | TBD        |      55% | EPIC-B, EPIC-D            |
| EPIC-F  | Update Set & Commit Operations      | Eng     | Backlog     | TBD        | TBD        |       0% | EPIC-E (baseline), EPIC-C |
| EPIC-G  | Quality Engineering & Test Strategy | Eng/QA  | In Progress | 2026-02-28 | TBD        |      10% | Core feature completeness |
| EPIC-H  | Enterprise Hardening                | Eng/Sec | Backlog     | TBD        | TBD        |       0% | EPIC-A..G maturity        |

---

## 3) Story Kanban

## In Progress

- E4 — Flow list/get/validate

## Ready

- C1 — Scoped app packaging + version contract

## Backlog

- C1, C2, C3, C4 — Companion app and ACL dual-mode
- D4 — Rulepack and gating governance
- E4, E5 — flows, workflows
- F1, F2, F3, F4, F5, F6 — changesets, commit, rollback plan
- G1, G2, G3, G4 — quality/testing
- H1, H2, H3, H4 — enterprise hardening

## Blocked

- None currently

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

---

## 4) Immediate Next 10 Stories (Execution Queue)

1. C1 — Scoped app packaging + version contract
2. C2 — ACL authoritative endpoint
3. C4 — Dual-mode `sn.acl.trace`
4. F1 — Changeset read tools
5. F2 — Gap detection with confidence tiers
6. F3 — Capture verify deterministic reasons
7. E4 — Flow list/get/validate parity
8. E5 — Workflow list/get/validate parity
9. G2 — Integration tests against dev instance
10. G4 — CI quality gates
