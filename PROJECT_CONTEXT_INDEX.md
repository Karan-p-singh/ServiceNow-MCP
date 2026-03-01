# ServiceNow MCP Server v2 — Project Context Index

Last Updated: 2026-02-28 21:14 PST
Purpose: Central guide for humans/LLMs to quickly find the right markdown source of truth.

---

## 1) Core Product Context

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

- Use for: architecture overview, safety model summary, expected project layout.
- Best when: onboarding or aligning implementation details to intended structure.

### `src/` (implementation)

- `src/index.js` → runtime entrypoint + bootstrap wiring
- `src/server/tool-registry.js` → tool registration abstraction
- `src/server/request-context.js` → request/correlation context generation
- `src/server/mcp.js` → server lifecycle + invocation orchestration
- `src/server/http-sse.js` → HTTP/SSE transport host + JSON-RPC bridge (`/mcp`, `/mcp/sse`)
- `src/servicenow/client.js` → ServiceNow REST adapter (auth, retries, normalization, capability discovery)
- `src/config.js` → environment parsing + local `.env` loading and merged config resolution

### `scripts/` (diagnostics + verification)

- `scripts/test-live-connection.js` → expanded live instance diagnostics matrix (auth, stats, metadata, script read, failure classification)
- `scripts/test-live-mcp-transport.js` → MCP transport/runtime verification (`GET /mcp`, JSON-RPC initialize/list/call)
- `package.json` scripts: `npm run smoke`, `npm run test:live`, `npm run test:live:mcp`

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

- Phase 1 is complete with **Gate G1 passed**; **EPIC-A** and **EPIC-B** are complete and **EPIC-E** remains in progress.
- G1 evidence now includes live diagnostics tooling (`test:live`, `test:live:mcp`) and secure env publishing baseline (`.env.example` + `.gitignore`).
- Known operational risk: endpoint-specific authorization gap on `sys_plugins` (403) while other probes pass; tracked in gate/activity logs.
- Next queued stories are **D1, D2, D3, E1 (full scope)**.
- For latest live status, always prioritize `Epics/BUILD_STATUS_BOARD.md`.
