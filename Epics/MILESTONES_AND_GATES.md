# ServiceNow MCP Server v2 — Milestones & Gate Criteria

Last Updated: 2026-02-28 20:26 PST
Gate Status Values: `Not Started | In Progress | At Risk | Passed | Failed`

---

## 1) Milestone Map

| Milestone ID | Name                                             | Target Window | Status      | Owner                  |
| ------------ | ------------------------------------------------ | ------------- | ----------- | ---------------------- |
| M1           | Phase 1 Exit — Foundation Slice                  | Week 2        | Passed      | Engineering            |
| M2           | Phase 2 Exit — Validation MVP + Script E2E       | Week 5        | Not Started | Engineering            |
| M3           | Phase 3 Exit — Companion + ACL Authority         | Week 8        | Not Started | Engineering + SN Dev   |
| M4           | Phase 4 Exit — Update Set MVP                    | Week 12       | Not Started | Engineering            |
| M5           | Phase 5 Exit — Controlled Commit + Rollback Plan | Week 16       | Not Started | Engineering            |
| M6           | Phase 6 Exit — Flow/Workflow Coverage            | Week 20       | Not Started | Engineering            |
| M7           | Phase 7 Exit — Enterprise Readiness              | Week 24       | Not Started | Engineering + Security |

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

Operational note: current instance shows endpoint-specific authorization failure for `sys_plugins` while other probes pass; this is captured by `npm run test:live` diagnostics and does not indicate transport failure.

## Gate G2 — Validation MVP + Script E2E (M2)

Status: `Not Started`

- [ ] D1 complete: validation engine framework
- [ ] D2 complete: script rulepack v1 baseline
- [ ] D3 complete: read summary + write gating
- [ ] E1 full complete: list/search/get
- [ ] E2 complete: refs/deps evidence outputs
- [ ] E3 complete: script create/update with gating and audit
- [ ] Unit test coverage for validation runtime and script tooling

Exit Rule: G2 passes when script lifecycle (read → validate → write) is safe, test-covered, and auditable.

## Gate G3 — Companion Authority (M3)

Status: `Not Started`

- [ ] C1 complete: scoped app package + version contract
- [ ] C2 complete: ACL authoritative endpoint
- [ ] C4 complete: dual-mode acl.trace behavior
- [x] A4 complete: policy scope/global controls + exception handling
- [ ] Explicit degraded mode behavior validated when Companion absent/outdated

## Gate G4 — Update Set MVP (M4)

Status: `Not Started`

- [ ] F1 complete: list/get/contents/export
- [ ] F2 complete: confidence-tier gap detection with evidence
- [ ] F3 complete: capture verification with deterministic reason codes
- [ ] Integration tests for core update set flows in non-prod instance

## Gate G5 — Commit/Rollback Planning (M5)

Status: `Not Started`

- [ ] F4 complete: dry-run commit preview
- [ ] F5 complete: T3 controlled commit with confirm/reason + snapshot matrix
- [ ] F6 complete: rollback plan generator with non-restorable declarations
- [ ] High-risk operation audit trace validated

## Gate G6 — Artifact Parity (M6)

Status: `Not Started`

- [ ] E4 complete: flow list/get/validate
- [ ] E5 complete: workflow list/get/validate
- [ ] D coverage expanded for flow/workflow rulepacks

## Gate G7 — Enterprise Readiness (M7)

Status: `Not Started`

- [ ] G1–G4 quality/testing epics complete
- [ ] H1 SIEM/webhook export complete
- [ ] H2 tool bundles and deploy profiles complete
- [ ] H3 security docs complete
- [ ] H4 admin/runbook docs complete
- [ ] Release package reviewed against PRD acceptance criteria

---

## 3) Gate Decision Log

| Date       | Gate | Decision    | Notes                                                                                                              |
| ---------- | ---- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-02-28 | G1   | In Progress | Planning/tracking initialized; implementation started at EPIC-A                                                    |
| 2026-02-28 | G1   | In Progress | A1 marked complete; continuing with A2/A3/A5 and B1/B2/B3 for M1 exit                                              |
| 2026-02-28 | G1   | In Progress | A2 marked complete; next focus is A3 tier enforcement middleware                                                   |
| 2026-02-28 | G1   | In Progress | A3 and A5 marked complete; remaining G1 dependencies are B1/B2/B3/E1 and demo evidence                             |
| 2026-02-28 | G1   | In Progress | Added B4 structure-alignment checkpoint; remaining dependencies are B1/B4/B2/B3/E1 and demo evidence               |
| 2026-02-28 | G1   | In Progress | B1/B2/B3/B4 completed in code and smoke-validated; remaining G1 items are E1 minimal and demo evidence             |
| 2026-02-28 | G1   | In Progress | A6 completed: URL-first HTTP/SSE MCP endpoint added (`http://localhost:3001/mcp`) with stdio fallback              |
| 2026-02-28 | G1   | Passed      | E1 minimal (`sn.script.get` + validation summary) implemented and smoke evidence captured for first vertical slice |
| 2026-02-28 | G3   | Not Started | A4 implementation completed early; Gate G3 remains pending companion deliverables                                  |
