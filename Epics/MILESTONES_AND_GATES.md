# ServiceNow MCP Server v2 — Milestones & Gate Criteria

Last Updated: 2026-03-03 22:00 PST
Gate Status Values: `Not Started | In Progress | At Risk | Passed | Failed`

---

## 1) Milestone Map

| Milestone ID | Name                                             | Target Window | Status | Owner                  |
| ------------ | ------------------------------------------------ | ------------- | ------ | ---------------------- |
| M1           | Phase 1 Exit — Foundation Slice                  | Week 2        | Passed | Engineering            |
| M2           | Phase 2 Exit — Validation MVP + Script E2E       | Week 5        | Passed | Engineering            |
| M3           | Phase 3 Exit — Optional Companion ACL Authority  | Week 8        | Passed | Engineering + SN Dev   |
| M4           | Phase 4 Exit — Update Set MVP                    | Week 12       | Passed | Engineering            |
| M5           | Phase 5 Exit — Controlled Commit + Rollback Plan | Week 16       | Passed | Engineering            |
| M6           | Phase 6 Exit — Flow/Workflow Coverage            | Week 20       | Passed | Engineering            |
| M7           | Phase 7 Exit — Enterprise Readiness              | Week 24       | Passed | Engineering + Security |

---

## 2) Gate Checklists

## Gate G1 — Foundation Slice (M1)

Status: `Passed`

- [x] A1 complete: server bootstrap + tool registry
- [x] A2 complete: response envelope implemented for all tools
- [x] A3 complete: tier enforcement + T3 confirm/reason contract
- [x] A5 complete: structured logs with redaction + correlation IDs
- [x] A6 complete: HTTP/SSE MCP endpoint exposed with URL-first default transport
- [x] B1 complete: auth abstraction (OAuth first)
- [x] B4 complete: README-aligned structure adoption documented and applied for new Epic B assets
- [x] B2 baseline complete: retries/pagination/error normalization
- [x] B3 complete: `sn.instance.info`
- [x] E1 minimal complete: `sn.script.get` + validation summary attachment
- [x] Demo evidence captured for end-to-end first vertical slice

Exit Rule: G1 passes only when all checklist items are complete and demonstrated.

### G1 Connectivity Evidence Checklist (Expanded)

- [x] Basic auth handshake validated (`sys_user` probe)
- [x] REST stats endpoint validated (`/api/now/stats/sys_user`)
- [x] Metadata table readability validated (`sys_db_object`)
- [x] Script include read path validated (`sys_script_include`)
- [x] MCP transport validated (`GET /mcp`, JSON-RPC `initialize`, `tools/list`, `tools/call`)
- [x] Failure classification output captured (401/403/429/5xx buckets)
- [x] JSON-RPC negative-path checks validated (`-32700`, `-32600`, `-32601`, `-32602`, `-32000`)
- [x] Tool-call envelope contracts validated for baseline tools (`sn.instance.info`, `sn.script.update`, `sn.changeset.commit`)

Operational note: diagnostics now probe plugin tables with `v_plugin` preferred and `sys_plugins` fallback. If both are restricted while other probes pass, `npm run test:live` classifies this as a limited-access profile warning and keeps connectivity gating focused on core transport/auth contracts.

## Gate G2 — Validation MVP + Script E2E (M2)

Status: `Passed`

- [x] D1 complete: validation engine framework
- [x] D2 complete: script rulepack v1 baseline
- [x] D3 complete: read summary + write gating
- [x] E1 full complete: list/search/get
- [x] E2 complete: refs/deps evidence outputs
- [x] E3 complete: script create/update with gating and audit
- [x] Unit test coverage for validation runtime and script tooling

Exit Rule: G2 passes when script lifecycle (read → validate → write) is safe, test-covered, and auditable.

## Gate G3 — Optional Companion Authority (M3)

Status: `Passed`

- [x] C1 complete: scoped app package + version contract
- [x] C2 complete: ACL authoritative endpoint
- [x] C4 complete: dual-mode acl.trace behavior
- [x] A4 complete: policy scope/global controls + exception handling
- [x] Explicit degraded mode behavior validated when Companion absent/outdated

## Gate G4 — Update Set MVP (M4)

Status: `Passed`

- [x] F1 complete: list/get/contents/export
- [x] F2 complete: confidence-tier gap detection with evidence
- [x] F3 complete: capture verification with deterministic reason codes
- [x] Integration tests for core update set flows in non-prod instance

## Gate G5 — Commit/Rollback Planning (M5)

Status: `Passed`

- [x] F4 complete: dry-run commit preview
- [x] F5 complete: T3 controlled commit with confirm/reason + snapshot matrix
- [x] F6 complete: rollback plan generator with non-restorable declarations
- [x] High-risk operation audit trace validated

## Gate G6 — Artifact Parity (M6)

Status: `Passed`

- [x] E4 complete: flow list/get/validate
- [x] E5 complete: workflow list/get/validate
- [x] D coverage expanded for flow/workflow rulepacks

## Gate G7 — Enterprise Readiness (M7)

Status: `Passed`

- [x] G1–G4 quality/testing epics complete
- [x] H1 SIEM/webhook export complete
- [x] H2 tool bundles and deploy profiles complete
- [x] H3 security docs complete
- [x] H4 admin/runbook docs complete
- [x] Release package reviewed against PRD acceptance criteria

## Gate G8 — Catalog Claim Integrity (Post-G7, 101-Tool Program)

Status: `In Progress`

- [x] R0 artifact exists: `docs/MCP_TOOL_CATALOG_101_MATRIX.md`
- [x] Runtime implemented baseline documented (`101` tools)
- [x] Runtime and matrix counts reconciled on every release-candidate cut
- [x] R1/D5 `sn.validate.*` family moved from planned to implemented with runtime evidence
- [x] R2 parity clusters completed with runtime registration evidence
- [x] R3 `sn.atf.coverage_signals` implemented with non-overclaim contract language
- [x] R4 rollback snapshot family implemented (`sn.rollback.snapshot.create` and related tools)
- [x] R5 ITSM/Admin edition separation validated for catalog claims
- [ ] R6 docs/runtime drift checks integrated into release gate automation (process-only remaining criterion; owner: Release Engineering; target: 2026-03-08)

Exit Rule: G8 passes only when any public/internal “100+ tools enabled” claim is backed by runtime registration output, synchronized matrix + governance trackers, and release-cadence evidence records for R6 automation checks.

Operational cadence for release-claim integrity:

1. Run `npm run smoke:summary`, `npm run test:g4:ci`, `npm run test:g7` at each release-candidate cut.
2. Reconcile runtime implemented count with `docs/MCP_TOOL_CATALOG_101_MATRIX.md` before claim publication.
3. Synchronize README, status board, runbook, and release checklist atomically.

---

## 3) Gate Decision Log

| Date       | Gate | Decision    | Notes                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ---- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02-28 | G1   | In Progress | Planning/tracking initialized; implementation started at EPIC-A                                                                                                                                                                                                                                                                                                                  |
| 2026-02-28 | G1   | In Progress | A1 marked complete; continuing with A2/A3/A5 and B1/B2/B3 for M1 exit                                                                                                                                                                                                                                                                                                            |
| 2026-02-28 | G1   | In Progress | A2 marked complete; next focus is A3 tier enforcement middleware                                                                                                                                                                                                                                                                                                                 |
| 2026-02-28 | G1   | In Progress | A3 and A5 marked complete; remaining G1 dependencies are B1/B2/B3/E1 and demo evidence                                                                                                                                                                                                                                                                                           |
| 2026-02-28 | G1   | In Progress | Added B4 structure-alignment checkpoint; remaining dependencies are B1/B4/B2/B3/E1 and demo evidence                                                                                                                                                                                                                                                                             |
| 2026-02-28 | G1   | In Progress | B1/B2/B3/B4 completed in code and smoke-validated; remaining G1 items are E1 minimal and demo evidence                                                                                                                                                                                                                                                                           |
| 2026-02-28 | G1   | In Progress | A6 completed: URL-first HTTP/SSE MCP endpoint added (`http://localhost:3001/mcp`) with stdio fallback                                                                                                                                                                                                                                                                            |
| 2026-02-28 | G1   | Passed      | E1 minimal (`sn.script.get` + validation summary) implemented and smoke evidence captured for first vertical slice                                                                                                                                                                                                                                                               |
| 2026-02-28 | G1   | Passed      | Expanded live connectivity diagnostics introduced (`npm run test:live`, `npm run test:live:mcp`); evidence now includes handshake/stats/metadata/script-read/transport plus classified failures                                                                                                                                                                                  |
| 2026-02-28 | G1   | Passed      | Secure env publishing baseline completed (`.env.example` + `.gitignore` + README setup notes) for GitHub-safe onboarding without credential exposure                                                                                                                                                                                                                             |
| 2026-02-28 | G1   | At Risk     | Endpoint-specific authorization gap remains on `sys_plugins` (403) while other probes pass; track under connectivity remediation without reopening transport baseline                                                                                                                                                                                                            |
| 2026-02-28 | G1   | Passed      | Transport and tool-call diagnostics upgraded to assertion-based contract tests (positive + negative JSON-RPC paths) with deterministic failure behavior for CI-style gating                                                                                                                                                                                                      |
| 2026-02-28 | G1   | Passed      | Re-run confirmed `test:live:mcp` full pass and `test:live` stabilization; `sys_plugins` 403 is now treated as restricted-access warning rather than full connectivity failure                                                                                                                                                                                                    |
| 2026-02-28 | G1   | Passed      | Plugin probe strategy updated to `v_plugin` preferred with `sys_plugins` fallback; live diagnostics and gate interpretation now reflect table-level policy variance without masking failures                                                                                                                                                                                     |
| 2026-02-28 | G2   | Passed      | Implemented validation runtime + script rulepack v1, full script lifecycle tooling (`get/list/search/refs/deps/create/update`), CRITICAL/HIGH write gating, audit metadata, and unit test coverage                                                                                                                                                                               |
| 2026-02-28 | G3   | Not Started | A4 implementation completed early; Gate G3 remains pending companion deliverables                                                                                                                                                                                                                                                                                                |
| 2026-03-01 | G3   | Passed      | Completed C1/C2/C4 as optional companion authority pilot: health/version contract, authoritative `sn.acl.trace`, and dual-mode degraded behavior with deterministic reason codes validated via `npm test`                                                                                                                                                                        |
| 2026-03-01 | G3   | Passed      | Live deployment verification completed on Zurich target instance; companion endpoint base URI auto-discovered (`/api/240215/v1`) and verified via `npm run test:companion:live`                                                                                                                                                                                                  |
| 2026-03-01 | G3   | At Risk     | Strict scope-governance hardening now shows companion artifacts remain `sys_scope=global` when deployed via Table API path; functional endpoints pass but true scoped ownership requires Studio/scoped install path                                                                                                                                                              |
| 2026-03-01 | G3   | At Risk     | Deployment automation now enforces scope-bootstrap + scoped-update only (no global artifact create path). Current state is blocked on recreating companion role/includes/REST records in true `x_mcp_companion` scope.                                                                                                                                                           |
| 2026-03-01 | G4   | In Progress | F1 changeset read tooling completed (`sn.changeset.list/get/contents/export`) with pagination-aware client support, smoke registration evidence, and unit test coverage; moving to F2/F3 for Gate G4 exit.                                                                                                                                                                       |
| 2026-03-01 | G4   | In Progress | F2/F3 delivered: `sn.changeset.gaps` and `sn.updateset.capture.verify` added with deterministic confidence/reason contracts, validated by `npm test`, smoke, and `npm run test:g4`; remaining exit criterion is non-prod integration flow validation.                                                                                                                            |
| 2026-03-01 | G4   | Passed      | Added and executed non-prod live integration validation (`npm run test:g4:live`) with passing evidence artifact `artifacts/g4-integration-summary.json`; all Gate G4 checklist criteria now complete.                                                                                                                                                                            |
| 2026-03-01 | G5   | In Progress | F4 commit preview dry-run delivered via `sn.changeset.commit.preview` with read-only/no-side-effect contract, scope impact reporting, potential conflict candidates, and mitigation guidance; Gate G5 advanced while F5/F6 remain pending.                                                                                                                                       |
| 2026-03-01 | G5   | Passed      | Completed F5/F6 with `sn.changeset.commit` controlled contract (T3 confirm/reason + snapshot matrix + high-risk audit trace) and `sn.rollback.plan.generate`; validation evidence captured via `npm run test:g5` and `artifacts/g5-validation-summary.json`.                                                                                                                     |
| 2026-03-01 | G6   | Passed      | Delivered flow/workflow parity (`sn.flow.*`, `sn.workflow.*`) plus rulepack-backed validation coverage (`flows-v1`, `workflows-v1`); evidence captured via `npm run test:g6` and `artifacts/g6-validation-summary.json`.                                                                                                                                                         |
| 2026-03-01 | G7   | Passed      | Completed enterprise readiness scope: EPIC-G quality harnesses (`test:g2:integration`, `test:g3:fixtures`, `test:g4:ci`) + EPIC-H hardening (`audit webhook`, `tool bundles/profiles`) + docs pack (`SECURITY_MODEL_AND_GOVERNANCE`, `ADMIN_RUNBOOK`, `RELEASE_READINESS_G7_CHECKLIST`); gate evidence captured via `npm run test:g7` and `artifacts/g7-readiness-summary.json`. |
| 2026-03-01 | G7   | Passed      | Documentation integrity pass completed (H5): governance and operations Markdown now consistently enforce non-overclaim contract language, implemented-vs-planned tool boundaries, and companion-as-optional pilot positioning aligned with Architecture v2 + Validation Addendum.                                                                                                |
| 2026-03-01 | G8   | In Progress | Completed R1/D5 implementation evidence sync: full `sn.validate.*` family now runtime-registered, matrix status moved to implemented, and runtime/matrix counts reconciled to `101/101` via `npm run smoke:summary`.                                                                                                                                                             |
| 2026-03-03 | G8   | In Progress | Runtime implementation criteria for R2/R3/R4/R5 were revalidated against `npm run smoke:summary` (101/101). Remaining scope is process-only R6 release-cadence evidence automation, owned by Release Engineering, target checkpoint 2026-03-08.                                                                                                                                  |
