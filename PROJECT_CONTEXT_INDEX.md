# ServiceNow MCP Server v2 — Project Context Index

Last Updated: 2026-03-03 22:00 PST
Purpose: Central guide for humans/LLMs to quickly find the right markdown source of truth.

---

## 1) Core Product Context

### `LLM_START_HERE.md` (Root-first context entry)

- Use for: default low-token load order from repository root.
- Best when: starting any LLM session and minimizing context-window usage.

### `docs/LLM_CONTEXT_PACK.md` (Start Here for LLM sessions)

- Use for: token-optimized context loading order, current truth snapshot, claim guardrails, and minimum verification commands.
- Best when: you need to minimize context-window usage before reading long governance/history files.

### `Epics/EPICS_CONTEXT_COMPACT.md`

- Use for: condensed operational state of all epic trackers and execution queue orientation.
- Best when: you need epic/governance status without loading full historical logs.

### `docs/DOCS_CONTEXT_COMPACT.md`

- Use for: condensed governance/runbook/catalog guidance and LLM-safe claims.
- Best when: you need docs-layer policy/claim truth in minimal tokens.

### `Project PRD/PRD_ServiceNow_MCP_Server.md`

- Use for: product goals, scope, constraints, safety model, acceptance expectations.
- Best when: deciding **what** to build and validating requirement intent.

### `Project PRD/BUILD_TIMELINE_ServiceNow_MCP_Server.md`

- Use for: phase-by-phase delivery approach, task sequencing, release gates.
- Best when: deciding **when/how** to implement and what should come next.

---

## 2) Planning + Execution Governance

### `Epics/IMPLEMENTATION_PLAN_EPICS_STORIES.md`

- Use for: canonical epic/story/task decomposition, dependencies, per-story acceptance criteria.
- Best when: selecting current story implementation scope.

### `Epics/BUILD_STATUS_BOARD.md`

- Use for: live Kanban (Backlog/Ready/In Progress/Blocked/Done), phase/epic progress, next queue.
- Best when: checking current execution status and immediate next stories.

### `Epics/BUILD_ACTIVITY_LOG.md`

- Use for: timestamped history of status transitions with reason/evidence/next step.
- Best when: auditing what changed and why.

### `Epics/MILESTONES_AND_GATES.md`

- Use for: formal milestone gates and exit checklists.
- Best when: deciding if a phase/milestone is actually complete.

### `Epics/RISKS_AND_DECISIONS.md`

- Use for: risk register and ADR-lite architecture/program decisions.
- Best when: understanding tradeoffs, blockers, and governance impacts.

---

## 3) Technical Entry Points

### `README.md`

- Use for: architecture overview, safety model summary, current project layout, and MCP tool catalog governance/truth boundaries.
- Best when: onboarding or aligning implementation details to intended structure.

### `docs/MCP_TOOL_CATALOG_101_MATRIX.md`

- Use for: authoritative 101-tool catalog tracking (runtime reconciliation, ownership, and evidence).
- Best when: validating any claim about 100+ tool readiness, ownership, tier mapping, and roadmap sequencing.
- Truth precedence: runtime `npm run smoke:summary` → 101 matrix → summary docs.

### `src/` (implementation)

- `src/index.js` → runtime entrypoint + bootstrap wiring
- `src/server/tool-registry.js` → tool registration abstraction
- `src/server/request-context.js` → request/correlation context generation
- `src/server/mcp.js` → server lifecycle + invocation orchestration
- `src/server/http-sse.js` → HTTP/SSE transport host + JSON-RPC bridge (`/mcp`, `/mcp/sse`)
- `src/servicenow/client.js` → ServiceNow REST adapter (auth, retries, normalization, capability discovery)
- `src/servicenow/companion-client.js` → Optional companion mode resolver (`none|scoped|global`) + authoritative ACL integration client for pilot mode only
- `src/config.js` → environment parsing + local `.env` loading and merged config resolution

### `scripts/` (diagnostics + verification)

- `scripts/test-live-connection.js` → expanded live instance diagnostics matrix (auth, stats, metadata, script read, failure classification)
- `scripts/test-live-mcp-transport.js` → MCP transport/runtime verification (`GET /mcp`, JSON-RPC initialize/list/call)
- `scripts/test-g4-integration-live.js` → non-prod live Gate G4 integration validation for update set flow exit evidence
- `scripts/deploy-companion-update-set.js` → Optional companion deployment helper with strict scope invariants (not required for baseline runtime)
- `scripts/test-companion-live.js` → Optional companion live endpoint verification for scoped/global pilot modes
- `scripts/test-g5-validation.js` → Gate G5 checklist validation (`F5`, `F6`, high-risk audit trace) and summary artifact generation
- `scripts/test-g6-validation.js` → Gate G6 checklist validation (`E4`, `E5`, flow/workflow rulepack coverage) and summary artifact generation
- `scripts/test-g2-integration.js` → Gate G2 integration harness (tier/policy/companion-disabled/bundle-policy scenarios)
- `scripts/test-g3-fixtures.js` → Gate G3 golden fixture/snapshot regression harness
- `scripts/test-g4-ci-quality-gates.js` → CI quality aggregation harness for Gates G2–G6 + unit checks
- `scripts/test-g7-readiness.js` → Gate G7 enterprise readiness aggregator (CI + docs-pack checks)
- `package.json` scripts: `npm run smoke`, `npm run test:live`, `npm run test:live:mcp`, `npm run test:g4:live`, `npm run test:g5`, `npm run test:g6`, `npm run test:g2:integration`, `npm run test:g3:fixtures`, `npm run test:g4:ci`, `npm run test:g7`

### Key Documentation Contract Files (v2 alignment)

- `docs/MCP_TOOL_CATALOG_101_MATRIX.md` → authoritative tool-count and per-tool status contract for 101-tool enablement program.
- `Project PRD/PRD_ServiceNow_MCP_Server.md` → authoritative product contract language, including revised high-risk tools and validation expansion targets.
- `Project PRD/BUILD_TIMELINE_ServiceNow_MCP_Server.md` → phased delivery sequencing aligned to non-overclaim contracts.
- `docs/SECURITY_MODEL_AND_GOVERNANCE.md` → governance controls, tier/policy behavior, discovery-first security posture.
- `docs/ADMIN_RUNBOOK.md` → operational runbooks and diagnostics flows.
- `docs/RELEASE_READINESS_G7_CHECKLIST.md` → release evidence checklist for enterprise readiness.

---

## 4) Recommended LLM Workflow

1. Read PRD (`PRD_ServiceNow_MCP_Server.md`) for requirement intent.
2. Read implementation plan (`IMPLEMENTATION_PLAN_EPICS_STORIES.md`) for story scope/dependencies.
3. Read status board (`BUILD_STATUS_BOARD.md`) to identify current story.
4. Read activity log (`BUILD_ACTIVITY_LOG.md`) for latest transition evidence.
5. Check gates (`MILESTONES_AND_GATES.md`) before marking phase exits.
6. Check risks/decisions (`RISKS_AND_DECISIONS.md`) before changing policy/architecture.
7. Implement in `src/`, then update status/log/gates/risk docs per transition rules.

---

## 5) Status Snapshot (Current)

- Phase 1 through Phase 7 are complete with **G1–G7 passed**.
- Runtime currently registers **101 tools**; program target remains **101 tools** (**101/101, remaining 0**).
- Canonical catalog governance now lives in `docs/MCP_TOOL_CATALOG_101_MATRIX.md`.
- Phase 3 companion authority is now treated as **optional pilot capability** rather than baseline dependency.
- **EPIC-D** is complete and script lifecycle scope in **EPIC-E** (`E1/E2/E3`) is complete.
- **EPIC-C baseline** (`C1/C2/C4`) is complete with dual-mode `sn.acl.trace` and deterministic degraded reason codes.
- G1 evidence now includes live diagnostics tooling (`test:live`, `test:live:mcp`) and secure env publishing baseline (`.env.example` + `.gitignore`).
- Known operational behavior: diagnostics now probe plugin tables with `v_plugin` preferred and `sys_plugins` fallback; if both are restricted, `test:live` classifies it as a limited-access warning while preserving overall connectivity signal.
- Runtime default is now **Phase A**: `SN_COMPANION_ENABLED=false`, `SN_COMPANION_MODE=none`, and discovery-mode ACL tracing.
- **Phase B** is optional: enable companion in `scoped` or `global` mode for authoritative ACL tracing.
- Documentation now follows runtime-first catalog claim governance with explicit evidence reconciliation to avoid over-claiming runtime coverage.
- README includes an MCP tool catalog section with runtime-registered family summary, matrix pointer, and roadmap history notes.
- EPIC-F is complete through **F6** and EPIC-E is complete through **E5**.
- EPIC-G and EPIC-H are complete with enterprise hardening controls and docs-pack deliverables.
- Gates **G4**, **G5**, **G6**, and **G7** are **Passed** with validation artifacts in `artifacts/g4-*.json`, `artifacts/g5-validation-summary.json`, `artifacts/g6-validation-summary.json`, `artifacts/g4-ci-quality-summary.json`, and `artifacts/g7-readiness-summary.json`.
- `sn.changeset.commit` now exposes the controlled T3 commit contract (confirm/reason + snapshot coverage + high-risk audit trace), and `sn.rollback.plan.generate` provides rollback planning with restorable/non-restorable declarations.
- Flow/workflow parity tooling is available via `sn.flow.*` and `sn.workflow.*`, each with deterministic rulepack-backed validation summaries.
- Enterprise controls now include optional audit webhook export and deploy-profile/tool-bundle gating (`TOOL_DISABLED_BY_BUNDLE`) for runtime policy enforcement.
- R1/D5 (`sn.validate.*` family) is implemented and reconciled in runtime + matrix evidence.
- R2/R3/R4/R5 implementation families are runtime-registered; remaining G8 scope is process-only R6 release-cadence evidence automation (owner: Release Engineering; next checkpoint: 2026-03-08).
- For latest live status, always prioritize `Epics/BUILD_STATUS_BOARD.md`.
