# ServiceNow MCP Server v2 — Build Status Board

Last Updated: 2026-03-03 22:00 PST
Legend: `Backlog | Ready | In Progress | Blocked | Done`

---

## 1) Phase Progress Snapshot

| Phase | Name                               | Status | Progress | Notes                                                                                                                           |
| ----- | ---------------------------------- | ------ | -------: | ------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Foundation + First Vertical Slice  | Done   |     100% | Gate G1 passed: E1 minimal (`sn.script.get` + validation summary) and first vertical-slice demo evidence captured               |
| 2     | Validation MVP + Script Tooling    | Done   |     100% | Gate G2 passed: validation runtime/rulepack, script tooling E2E, and unit coverage completed                                    |
| 3     | Optional Companion Authority Pilot | Done   |     100% | Phase B optional capability: companion health/version contract + authoritative ACL path + dual-mode degraded behavior validated |
| 4     | Update Set MVP                     | Done   |     100% | Gate G4 passed: F1/F2/F3 complete and non-prod integration validation completed (`npm run test:g4:live`)                        |
| 5     | Commit + Rollback Planning         | Done   |     100% | Gate G5 passed: controlled T3 commit + rollback plan generator delivered with validation evidence (`npm run test:g5`)           |
| 6     | Flows + Workflows Coverage         | Done   |     100% | Gate G6 passed: flow/workflow tooling parity + rulepack-backed validation coverage (`npm run test:g6`)                          |
| 7     | Enterprise Hardening               | Done   |     100% | Gate G7 passed: EPIC-G quality automation + EPIC-H hardening/docs complete (`npm run test:g7`)                                  |

---

## 2) Epic Board

| Epic ID | Epic Name                           | Owner   | Status | Start      | Target End | Progress | Blocking Dependencies     |
| ------- | ----------------------------------- | ------- | ------ | ---------- | ---------- | -------: | ------------------------- |
| EPIC-A  | Core MCP Framework                  | Eng     | Done   | 2026-02-28 | 2026-02-28 |     100% | None                      |
| EPIC-B  | ServiceNow Client & Connectivity    | Eng     | Done   | 2026-02-28 | 2026-02-28 |     100% | EPIC-A (A1 baseline)      |
| EPIC-C  | Optional Companion Authority        | SN Dev  | Done   | 2026-03-01 | 2026-03-01 |     100% | EPIC-B                    |
| EPIC-D  | Validation Engine & Rulepacks       | Eng     | Done   | 2026-02-28 | 2026-02-28 |     100% | EPIC-A, EPIC-B            |
| EPIC-E  | Developer Artifact Tooling          | Eng     | Done   | 2026-02-28 | 2026-03-01 |     100% | EPIC-B, EPIC-D            |
| EPIC-F  | Update Set & Commit Operations      | Eng     | Done   | 2026-03-01 | 2026-03-01 |     100% | EPIC-E (baseline), EPIC-C |
| EPIC-G  | Quality Engineering & Test Strategy | Eng/QA  | Done   | 2026-02-28 | 2026-03-01 |     100% | Core feature completeness |
| EPIC-H  | Enterprise Hardening                | Eng/Sec | Done   | 2026-03-01 | 2026-03-01 |     100% | EPIC-A..G maturity        |

---

## 2.1) 101-Tool Catalog Enablement Progress (Authoritative Program View)

Source of truth: `docs/MCP_TOOL_CATALOG_101_MATRIX.md`

| Metric                             |       Value |
| ---------------------------------- | ----------: |
| Runtime implemented tools          |         101 |
| v2 target catalog                  |         101 |
| Remaining tools                    |           0 |
| Catalog lock artifact (R0)         |        Done |
| Validation addendum family (R1/D5) |        Done |
| Dev parity clusters (R2)           |        Done |
| ATF signal track (R3)              |        Done |
| Rollback snapshot maturity (R4)    |        Done |
| ITSM/Admin edition track (R5)      |        Done |
| Drift guards + claim checks (R6)   | In Progress |

Operational integrity cadence (required for release claims):

1. Run `npm run smoke:summary`, `npm run test:g4:ci`, `npm run test:g7` on release-candidate cuts.
2. Reconcile runtime implemented count against matrix (`docs/MCP_TOOL_CATALOG_101_MATRIX.md`).
3. Synchronize README + epics + runbook/release checklist before external/internal “100+ tools” statements.

---

## 3) Story Kanban

## In Progress

- EPIC-I / TERP Phase T1 — token-efficiency transport hardening (compact text mode + tools/list detail profiles + low-token defaults + transport contract tests)

## Ready

- (none)

## Backlog

- C3 — Scope/capture helper endpoints
- D4 — Rulepack and gating governance

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
- D5 — Validation addendum expansion completed: `sn.validate.script_include`, `sn.validate.business_rule`, `sn.validate.client_script`, `sn.validate.ui_script`, `sn.validate.flow`, `sn.validate.workflow`, `sn.validate.catalog_policy`, `sn.validate.fix`
- R1 catalog reconciliation completed: runtime and matrix aligned and preserved through subsequent release-cadence checks
- R2 increment (diagnostics/metadata/script parity batch) completed: `sn.health.check`, `sn.config.get`, `sn.policy.test`, `sn.audit.ping`, `sn.instance.capabilities.get`, `sn.instance.plugins.list`, `sn.table.get`, `sn.table.count`, `sn.script.history`, `sn.script.diff`
- R2 catalog reconciliation completed: runtime and matrix now aligned at `101/101` after `npm run smoke:summary`
- G5 validation harness added: `scripts/test-g5-validation.js` + `npm run test:g5` and `artifacts/g5-validation-summary.json`
- G6 validation harness added: `scripts/test-g6-validation.js` + `npm run test:g6` and `artifacts/g6-validation-summary.json`
- G4 validation harness added: `scripts/test-g4-validation.js` + `npm run test:g4` and `artifacts/g4-validation-summary.json`
- G4 non-prod integration validation completed: `scripts/test-g4-integration-live.js` + `npm run test:g4:live` and `artifacts/g4-integration-summary.json`
- G2 integration harness completed: `scripts/test-g2-integration.js` + `npm run test:g2:integration` and `artifacts/g2-integration-summary.json`
- G3 golden fixture harness completed: `scripts/test-g3-fixtures.js` + `npm run test:g3:fixtures` and `artifacts/g3-fixtures-summary.json`
- G4 CI quality gate aggregator completed: `scripts/test-g4-ci-quality-gates.js` + `npm run test:g4:ci` and `artifacts/g4-ci-quality-summary.json`
- H1 completed: non-fatal audit webhook sink (`src/server/audit-webhook.js`) with filter modes (`writes|high_risk|all`) and timeout controls
- H2 completed: deploy profiles/tool bundles policy (`src/server/tool-bundles.js`) with deterministic bundle-block code `TOOL_DISABLED_BY_BUNDLE`
- H3 completed: security docs pack (`docs/SECURITY_MODEL_AND_GOVERNANCE.md`, `docs/OPERATIONS_AND_RELEASE.md`, `docs/PRODUCT_AND_DELIVERY_MASTER.md`)
- H4 completed: operations/release runbook consolidation (`docs/OPERATIONS_AND_RELEASE.md`)
- G7 readiness automation completed: `scripts/test-g7-readiness.js` + `npm run test:g7` and `artifacts/g7-readiness-summary.json`
- Gate G7 passed: enterprise readiness checks (`G4-CI`, `G7-DOCS`, `DOCS-PACK`) all green
- Docs v2 contract alignment pass completed: README tool catalog now distinguishes implemented vs planned tools; PRD/timeline updated to revised high-risk tool contracts and validation addendum semantics
- H5 completed: documentation contract integrity and non-overclaim governance are now tracked as completed program work across README/PRD/timeline/epics/ops docs

---

## 4) Immediate Next 10 Stories (Execution Queue)

1. EPIC-I I1/I2/I3: complete token-efficiency Phase T1 and capture before/after payload metrics.
2. EPIC-I I4: integrate compact transport regression checks into release test cadence.
3. G8 process cadence: run and archive release evidence bundle (`smoke:summary`, `test:g4:ci`, `test:g7`) on each release candidate.
4. R6 hardening: add CI assertion that checks docs/runtime tool-count parity before release tag.
5. D4 governance: add explicit rulepack suppression policy docs and audit expectations.
6. C3 optional companion helpers: close remaining optional scope/capture helper backlog.
7. Expand structure publish tags to include owner mapping from matrix.
8. Add structure-publish check into CI quality gate suite.
9. Refresh docs timestamp + last-verified fields as part of release checklist.
10. Continue policy review for edition-boundary protections in ITSM/Admin tools.
