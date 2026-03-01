# MCP Tool Catalog — 101 Matrix (Authoritative Program Tracker)

Last Updated: 2026-03-01 06:21 PST  
Owner: Engineering + Product Architecture  
Status: Active (R0 catalog lock complete; G8 integrity execution in progress)

---

## 1) Truth Policy and How to Use This File

This document is the **catalog-level source of truth** for the 101-tool v2 target.

Use this hierarchy whenever tool-count or readiness claims differ:

1. **Runtime truth:** `npm run smoke:summary` (actual registered tools)
2. **This matrix:** authoritative 101-tool program status (implemented vs planned)
3. Supporting docs (README, PRD, epics, runbook)

No document should claim 100+ tool availability unless this matrix and runtime evidence agree.

---

## 2) Baseline Counts (Current)

- Runtime-registered tools (implemented): **43**
- v2 catalog target: **101**
- Remaining to reach full catalog: **58**

Family status snapshot:

- Core/platform + governance: 11 implemented / 10 planned
- Script tooling: 9 implemented / 12 planned
- Validation addendum family (`sn.validate.*`): 8 implemented / 0 planned
- Changeset/updateset/rollback: 9 implemented / 15 planned
- Flow/workflow: 6 implemented / 10 planned
- ATF/quality: 0 implemented / 6 planned
- ITSM/Admin edition: 0 implemented / 31 planned

---

## 3) Tool Matrix (1..101)

Legend:

- **Status:** `Implemented | Planned`
- **Enablement Track:** `R0..R6` roadmap from implementation plan
- **Evidence:** runtime (`smoke:summary`) for implemented; story/test contract for planned

|   # | Tool                              | Edition | Tier | Status      | Enablement Track | Evidence / Gate Anchor                     | Owner    |
| --: | --------------------------------- | ------- | ---- | ----------- | ---------------- | ------------------------------------------ | -------- |
|   1 | `sn.instance.info`                | dev     | T0   | Implemented | R0 locked        | `src/index.js`, `npm run smoke:summary`    | Eng      |
|   2 | `sn.table.list`                   | dev     | T0   | Implemented | R0 locked        | `src/index.js`, `npm run smoke:summary`    | Eng      |
|   3 | `sn.acl.trace`                    | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G3 evidence                | Eng      |
|   4 | `sn.script.get`                   | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G2 evidence                | Eng      |
|   5 | `sn.script.list`                  | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G2 evidence                | Eng      |
|   6 | `sn.script.search`                | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G2 evidence                | Eng      |
|   7 | `sn.script.refs`                  | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G2 evidence                | Eng      |
|   8 | `sn.script.deps`                  | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G2 evidence                | Eng      |
|   9 | `sn.script.create`                | dev     | T2   | Implemented | R0 locked        | `src/index.js`, G2 evidence                | Eng      |
|  10 | `sn.script.update`                | dev     | T2   | Implemented | R0 locked        | `src/index.js`, G2 evidence                | Eng      |
|  11 | `sn.changeset.list`               | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G4 evidence                | Eng      |
|  12 | `sn.changeset.get`                | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G4 evidence                | Eng      |
|  13 | `sn.changeset.contents`           | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G4 evidence                | Eng      |
|  14 | `sn.changeset.export`             | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G4 evidence                | Eng      |
|  15 | `sn.changeset.gaps`               | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G4 evidence                | Eng      |
|  16 | `sn.updateset.capture.verify`     | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G4 evidence                | Eng      |
|  17 | `sn.changeset.commit.preview`     | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G5 evidence                | Eng      |
|  18 | `sn.changeset.commit`             | dev     | T3   | Implemented | R0 locked        | `src/index.js`, G5 evidence                | Eng      |
|  19 | `sn.rollback.plan.generate`       | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G5 evidence                | Eng      |
|  20 | `sn.flow.list`                    | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G6 evidence                | Eng      |
|  21 | `sn.flow.get`                     | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G6 evidence                | Eng      |
|  22 | `sn.flow.validate`                | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G6 evidence                | Eng      |
|  23 | `sn.workflow.list`                | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G6 evidence                | Eng      |
|  24 | `sn.workflow.get`                 | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G6 evidence                | Eng      |
|  25 | `sn.workflow.validate`            | dev     | T0   | Implemented | R0 locked        | `src/index.js`, G6 evidence                | Eng      |
|  26 | `sn.health.check`                 | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  27 | `sn.config.get`                   | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  28 | `sn.policy.test`                  | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  29 | `sn.audit.ping`                   | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  30 | `sn.tool.catalog`                 | dev     | T0   | Planned     | R6               | Docs/runtime drift guard                   | Eng/QA   |
|  31 | `sn.tool.describe`                | dev     | T0   | Planned     | R6               | Catalog contract introspection             | Eng      |
|  32 | `sn.instance.capabilities.get`    | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  33 | `sn.instance.plugins.list`        | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  34 | `sn.table.get`                    | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  35 | `sn.table.schema.get`             | dev     | T0   | Planned     | R2               | Metadata/read parity                       | Eng      |
|  36 | `sn.table.dictionary.list`        | dev     | T0   | Planned     | R2               | Metadata/read parity                       | Eng      |
|  37 | `sn.table.count`                  | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  38 | `sn.user.role.check`              | dev     | T0   | Planned     | R2               | Security diagnostics track                 | Eng/Sec  |
|  39 | `sn.scope.inspect`                | dev     | T0   | Planned     | R2               | Scope governance parity                    | Eng      |
|  40 | `sn.scope.guard.check`            | dev     | T0   | Planned     | R2               | Scope/policy diagnostics                   | Eng      |
|  41 | `sn.dependency.graph.get`         | dev     | T0   | Planned     | R2               | Dependency mapping expansion               | Eng      |
|  42 | `sn.release.compatibility.check`  | dev     | T0   | Planned     | R2               | Release-aware guardrails                   | Eng      |
|  43 | `sn.logs.tail`                    | dev     | T1   | Planned     | R6               | Ops diagnostics w/ governance              | Eng/Sec  |
|  44 | `sn.validate.script_include`      | dev     | T0   | Implemented | R1 (D5)          | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  45 | `sn.validate.business_rule`       | dev     | T0   | Implemented | R1 (D5)          | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  46 | `sn.validate.client_script`       | dev     | T0   | Implemented | R1 (D5)          | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  47 | `sn.validate.ui_script`           | dev     | T0   | Implemented | R1 (D5)          | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  48 | `sn.validate.flow`                | dev     | T0   | Implemented | R1 (D5)          | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  49 | `sn.validate.workflow`            | dev     | T0   | Implemented | R1 (D5)          | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  50 | `sn.validate.catalog_policy`      | dev     | T0   | Implemented | R1 (D5)          | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  51 | `sn.validate.fix`                 | dev     | T1   | Implemented | R1 (D5)          | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  52 | `sn.script.diff`                  | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  53 | `sn.script.history`               | dev     | T0   | Implemented | R2               | `src/index.js`, `npm run smoke:summary`    | Eng      |
|  54 | `sn.script.compare`               | dev     | T0   | Planned     | R2               | Script parity expansion                    | Eng      |
|  55 | `sn.script.delete`                | dev     | T3   | Planned     | R2               | High-risk script operation                 | Eng/Sec  |
|  56 | `sn.script.clone`                 | dev     | T2   | Planned     | R2               | Script productivity                        | Eng      |
|  57 | `sn.script.lint`                  | dev     | T0   | Planned     | R1 (D5)          | Validation linkage                         | Eng      |
|  58 | `sn.script.test.stub.generate`    | dev     | T1   | Planned     | R3               | ATF readiness helper                       | Eng      |
|  59 | `sn.script.bulk.search`           | dev     | T0   | Planned     | R2               | Bulk diagnostics                           | Eng      |
|  60 | `sn.script.bulk.validate`         | dev     | T0   | Planned     | R1 (D5)          | Validation expansion                       | Eng      |
|  61 | `sn.script.refactors.preview`     | dev     | T1   | Planned     | R2               | Safe refactor preview                      | Eng      |
|  62 | `sn.script.refactors.apply`       | dev     | T2   | Planned     | R2               | Controlled refactor apply                  | Eng      |
|  63 | `sn.script.scope.migrate.preview` | dev     | T1   | Planned     | R2               | Scope migration planning                   | Eng      |
|  64 | `sn.script.scope.migrate.apply`   | dev     | T3   | Planned     | R2               | High-risk scope migration                  | Eng/Sec  |
|  65 | `sn.script.guardrails.explain`    | dev     | T0   | Planned     | R6               | Explainability for policy/validation       | Eng      |
|  66 | `sn.changeset.diff`               | dev     | T0   | Planned     | R2               | Changeset parity expansion                 | Eng      |
|  67 | `sn.changeset.validate`           | dev     | T0   | Planned     | R1 (D5)          | Validation addendum linkage                | Eng      |
|  68 | `sn.changeset.dependencies.map`   | dev     | T0   | Planned     | R2               | Dependency graph maturity                  | Eng      |
|  69 | `sn.changeset.records.list`       | dev     | T0   | Planned     | R2               | Record-level visibility                    | Eng      |
|  70 | `sn.changeset.record.get`         | dev     | T0   | Planned     | R2               | Record-level visibility                    | Eng      |
|  71 | `sn.changeset.record.validate`    | dev     | T0   | Planned     | R1 (D5)          | Validation addendum linkage                | Eng      |
|  72 | `sn.changeset.rollback.preview`   | dev     | T1   | Planned     | R4               | Rollback maturity                          | Eng      |
|  73 | `sn.rollback.snapshot.create`     | dev     | T1   | Planned     | R4               | Rollback maturity (required)               | Eng      |
|  74 | `sn.rollback.snapshot.get`        | dev     | T0   | Planned     | R4               | Snapshot management                        | Eng      |
|  75 | `sn.rollback.snapshot.list`       | dev     | T0   | Planned     | R4               | Snapshot management                        | Eng      |
|  76 | `sn.rollback.plan.review`         | dev     | T0   | Planned     | R4               | Rollback governance                        | Eng      |
|  77 | `sn.rollback.execute.manualguide` | dev     | T1   | Planned     | R4               | Manual rollback runbook aid                | Eng/Ops  |
|  78 | `sn.updateset.capture.force`      | dev     | T2   | Planned     | R2               | Capture recovery tooling                   | Eng      |
|  79 | `sn.updateset.capture.status`     | dev     | T0   | Planned     | R2               | Capture diagnostics tooling                | Eng      |
|  80 | `sn.flow.search`                  | dev     | T0   | Planned     | R2               | Flow parity expansion                      | Eng      |
|  81 | `sn.flow.refs`                    | dev     | T0   | Planned     | R2               | Flow dependency evidence                   | Eng      |
|  82 | `sn.flow.deps`                    | dev     | T0   | Planned     | R2               | Flow dependency evidence                   | Eng      |
|  83 | `sn.flow.publish`                 | dev     | T2   | Planned     | R2               | Controlled flow lifecycle                  | Eng      |
|  84 | `sn.flow.activate`                | dev     | T2   | Planned     | R2               | Controlled flow lifecycle                  | Eng      |
|  85 | `sn.workflow.search`              | dev     | T0   | Planned     | R2               | Workflow parity expansion                  | Eng      |
|  86 | `sn.workflow.refs`                | dev     | T0   | Planned     | R2               | Workflow dependency evidence               | Eng      |
|  87 | `sn.workflow.deps`                | dev     | T0   | Planned     | R2               | Workflow dependency evidence               | Eng      |
|  88 | `sn.workflow.publish`             | dev     | T2   | Planned     | R2               | Controlled workflow lifecycle              | Eng      |
|  89 | `sn.workflow.activate`            | dev     | T2   | Planned     | R2               | Controlled workflow lifecycle              | Eng      |
|  90 | `sn.atf.suite.list`               | dev     | T0   | Planned     | R3               | ATF integration track                      | Eng/QA   |
|  91 | `sn.atf.suite.run`                | dev     | T2   | Planned     | R3               | ATF integration track                      | Eng/QA   |
|  92 | `sn.atf.test.get`                 | dev     | T0   | Planned     | R3               | ATF integration track                      | Eng/QA   |
|  93 | `sn.atf.coverage_signals`         | dev     | T0   | Planned     | R3               | Required non-overclaim ATF signal contract | Eng/QA   |
|  94 | `sn.quality.gate.evaluate`        | dev     | T0   | Planned     | R6               | CI drift guard integration                 | Eng/QA   |
|  95 | `sn.quality.report.get`           | dev     | T0   | Planned     | R6               | CI/reporting integration                   | Eng/QA   |
|  96 | `sn.incident.list`                | itsm    | T0   | Planned     | R5               | ITSM edition track                         | Eng/ITSM |
|  97 | `sn.incident.get`                 | itsm    | T0   | Planned     | R5               | ITSM edition track                         | Eng/ITSM |
|  98 | `sn.incident.create`              | itsm    | T2   | Planned     | R5               | ITSM edition track                         | Eng/ITSM |
|  99 | `sn.incident.update`              | itsm    | T2   | Planned     | R5               | ITSM edition track                         | Eng/ITSM |
| 100 | `sn.change.list`                  | itsm    | T0   | Planned     | R5               | ITSM edition track                         | Eng/ITSM |
| 101 | `sn.change.get`                   | itsm    | T0   | Planned     | R5               | ITSM edition track                         | Eng/ITSM |

### ITSM extension backlog attached to Tool #101

To keep this matrix fixed at 101 entries while preserving roadmap visibility, remaining ITSM/Admin tools are tracked as **R5 extension backlog** and must be promoted into the 101 set only through explicit governance swap:

- `sn.change.create`, `sn.change.update`
- `sn.problem.list`, `sn.problem.get`, `sn.problem.create`, `sn.problem.update`
- `sn.request.list`, `sn.request.get`, `sn.request.create`, `sn.request.update`
- `sn.catalog.item.list`, `sn.catalog.item.get`, `sn.catalog.request.submit`
- `sn.cmdb.ci.list`, `sn.cmdb.ci.get`, `sn.cmdb.relationships.get`
- `sn.kb.article.search`, `sn.kb.article.get`
- `sn.user.list`, `sn.user.get`, `sn.user.create`, `sn.user.update`
- `sn.group.list`, `sn.group.get`, `sn.group.members.list`

---

## 4) Enablement Requirements to Reach 101/101

### R0 — Catalog lock and governance

1. Keep this matrix synchronized with runtime and roadmap docs.
2. Ensure every tool has edition, tier, status, track, and owner.
3. Block any “100+ enabled” claim unless runtime + matrix counts match.

### R1 (D5) — Validation addendum completion

1. Implement full `sn.validate.*` family (`44..51`).
2. Expand rulepack categories: PERF, SEC, BP, FLOW.
3. Add deterministic validation payloads and gate behavior parity.

### R2 — Dev catalog parity completion

1. Deliver metadata/diagnostics/core parity (`26..43`).
2. Complete script, flow, workflow, and changeset parity tools (`52..89`).
3. Add tests for tier/policy/validation behavior on every write-capable tool.

### R3 — ATF and quality signal track

1. Implement ATF tooling (`90..93`).
2. Ensure `sn.atf.coverage_signals` language remains evidence-only (no code coverage claim).

### R4 — Rollback maturity track

1. Implement snapshot tools (`73..75`) and rollback review surfaces.
2. Maintain explicit non-restorable declarations and manual-step guidance.

### R5 — ITSM/Admin edition track

1. Deliver edition-separated ITSM tools (`96..101` and extension backlog).
2. Keep strict edition policy boundaries (`dev` vs `itsm`) in docs and runtime.

### R6 — Drift guards and release-proof claims

1. Add docs/runtime parity check workflow in CI.
2. Add catalog-claim checks to release readiness.
3. Require evidence refresh before each release gate decision.

---

## 5) Required Verification Commands

```bash
npm run smoke:summary
npm run test:g4:ci
npm run test:g7
```

Use these outputs plus this matrix before updating any tool-count claims in README, PRD, or epics trackers.

Release-claim drift prevention cadence:

1. Run the command bundle above for every release-candidate cut.
2. Reconcile implemented count against runtime output first, then matrix.
3. Update summary docs atomically (`README.md`, `Epics/BUILD_STATUS_BOARD.md`, `Epics/MILESTONES_AND_GATES.md`, runbook/checklists).
