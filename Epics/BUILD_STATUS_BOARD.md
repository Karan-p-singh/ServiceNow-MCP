# ServiceNow MCP Server v2 — Build Status Board

Last Updated: 2026-02-28 18:22 PST
Legend: `Backlog | Ready | In Progress | Blocked | Done`

---

## 1) Phase Progress Snapshot

| Phase | Name                              | Status      | Progress | Notes                                                  |
| ----- | --------------------------------- | ----------- | -------: | ------------------------------------------------------ |
| 1     | Foundation + First Vertical Slice | In Progress |      40% | EPIC-A complete; Phase 1 focus shifts to B1/B2/B3 + E1 |
| 2     | Validation MVP + Script Tooling   | Backlog     |       0% | Dependent on Phase 1 exits                             |
| 3     | Companion App + ACL Authoritative | Backlog     |       0% | Dependent on Phase 2 exits                             |
| 4     | Update Set MVP                    | Backlog     |       0% | Dependent on Phase 3 readiness                         |
| 5     | Commit + Rollback Planning        | Backlog     |       0% | Dependent on Phase 4 readiness                         |
| 6     | Flows + Workflows Coverage        | Backlog     |       0% | Dependent on core validation maturity                  |
| 7     | Enterprise Hardening              | Backlog     |       0% | Final hardening and release prep                       |

---

## 2) Epic Board

| Epic ID | Epic Name                           | Owner   | Status  | Start      | Target End | Progress | Blocking Dependencies     |
| ------- | ----------------------------------- | ------- | ------- | ---------- | ---------- | -------: | ------------------------- |
| EPIC-A  | Core MCP Framework                  | Eng     | Done    | 2026-02-28 | 2026-02-28 |     100% | None                      |
| EPIC-B  | ServiceNow Client & Connectivity    | Eng     | Ready   | TBD        | TBD        |       0% | EPIC-A (A1 baseline)      |
| EPIC-C  | Companion App                       | SN Dev  | Backlog | TBD        | TBD        |       0% | EPIC-B                    |
| EPIC-D  | Validation Engine & Rulepacks       | Eng     | Ready   | TBD        | TBD        |       0% | EPIC-A, EPIC-B            |
| EPIC-E  | Developer Artifact Tooling          | Eng     | Ready   | TBD        | TBD        |       0% | EPIC-B, EPIC-D            |
| EPIC-F  | Update Set & Commit Operations      | Eng     | Backlog | TBD        | TBD        |       0% | EPIC-E (baseline), EPIC-C |
| EPIC-G  | Quality Engineering & Test Strategy | Eng/QA  | Backlog | TBD        | TBD        |       0% | Core feature completeness |
| EPIC-H  | Enterprise Hardening                | Eng/Sec | Backlog | TBD        | TBD        |       0% | EPIC-A..G maturity        |

---

## 3) Story Kanban

## In Progress

- None (next up: B1)

## Ready

- B1 — Auth + client abstraction
- D1 — Validation runtime framework
- E1 — Script read/list/search tools

## Backlog

- B2 — Retry/pagination/error normalization
- B3 — Instance capability discovery
- C1, C2, C3, C4 — Companion app and ACL dual-mode
- D2, D3, D4 — Rulepack and gating governance
- E2, E3, E4, E5 — refs/deps, writes, flows, workflows
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

---

## 4) Immediate Next 10 Stories (Execution Queue)

1. B1 — Auth + client abstraction
2. B2 — Retry/pagination/error normalization
3. B3 — Instance capability discovery
4. D1 — Validation runtime framework skeleton
5. E1 — `sn.script.get` minimal read path + validation summary
6. D2 — Script rulepack v1 baseline
7. D3 — Read summary + write gating integration
8. E2 — Script refs/deps with evidence
9. E3 — Script create/update (tiered)
10. C1 — Scoped app packaging + version contract
