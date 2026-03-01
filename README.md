# ServiceNow MCP Server v2 (Developer Edition)

A **safe-by-default MCP (Model Context Protocol) server** for ServiceNow that enables LLM tooling to read, validate, and (when allowed) change ServiceNow artifacts with enterprise guardrails.

This repository follows the revised v2 architecture principles:

- **No over-claims** (ACL evaluation limits, dependency completeness limits, rollback limits)
- **Validation-first** behavior (findings on read, gated writes)
- **Tier + policy enforcement before network calls**
- **Discovery-first baseline** with companion-independent operation

> Current product direction in this repo: baseline delivery is discovery-first. Companion authority is treated as optional/deprioritized and is not required for core operation.

---

## Architecture Snapshot (What matters most)

- **Runtime:** JavaScript implementation, TS-aligned architecture (`src/server`, `src/servicenow`, `src/validation`)
- **Transport:** HTTP/SSE by default, stdio fallback
- **Safety controls:** tiering (`T0`–`T3`), policy engine, audit envelopes
- **Validation:** in-process rulepacks with severity gating
- **Deployment intelligence:** update set inspect/gaps/capture verify/preview/commit/rollback-plan surfaces

---

## Transport & Connection Model

This server supports two MCP transports:

- **HTTP/SSE (default)**
  - MCP endpoint: `http://localhost:3001/mcp`
  - SSE stream: `http://localhost:3001/mcp/sse`
- **stdio (fallback)**

By default, startup is HTTP/SSE for URL-first MCP integrations.

---

## Honesty Contract (v2-aligned)

1. **ACL trace**: discovery output is diagnostic, not platform-authoritative.
2. **Changeset gaps**: confidence-tier evidence; no completeness claim.
3. **Commit/rollback**: controlled commit + rollback planning; no guaranteed reversibility claims.
4. **ATF linkage**: treated as evidence signals, not code coverage.

---

## Quick Start

### 1) Prerequisites

- Node.js 18+
- Access to a ServiceNow instance (dev/test recommended)
- A least-privilege ServiceNow service account
- (Recommended) OAuth credentials for ServiceNow REST APIs

### 2) Configure Environment

Create local env from the template (recommended):

```bash
copy .env.example .env
```

Then update `.env` with your instance and local credentials (or set environment variables via your secret manager):

```bash
# Edition: dev | itsm
MCP_EDITION=dev

# MCP transport (default is URL-based HTTP/SSE)
MCP_TRANSPORT=http-sse      # http-sse | stdio
MCP_SERVER_HOST=localhost
MCP_SERVER_PORT=3001
MCP_SERVER_PATH=/mcp

# Instance connection
SN_INSTANCE_URL=https://YOUR_INSTANCE.service-now.com
SN_AUTH_MODE=oauth   # oauth | basic
SN_CLIENT_ID=...
SN_CLIENT_SECRET=...
SN_USERNAME=...       # if basic auth is used (discouraged)
SN_PASSWORD=...       # if basic auth is used (discouraged)

# Tier limits (T0/T1/T2/T3)
MCP_TIER_MAX=T1

# Scope policy
MCP_ALLOWED_SCOPES=x_your_scope,global
MCP_DENY_GLOBAL_WRITES=true
MCP_ENFORCE_CHANGESET_SCOPE=true

# Validation
VALIDATION_RULEPACK_VERSION=1.0.0
VALIDATION_FAIL_ON=CRITICAL     # CRITICAL or HIGH

# Companion integration (deprioritized/optional)
# Default baseline: discovery-only ACL mode
SN_COMPANION_ENABLED=false
SN_COMPANION_MODE=none
# Optional pilot (not baseline): scoped or global companion authority
# SN_COMPANION_ENABLED=true
# SN_COMPANION_MODE=scoped
# SN_COMPANION_MODE=global
SN_COMPANION_BASE_PATH=/api/x_mcp_companion/v1
SN_COMPANION_GLOBAL_BASE_PATH=/api/global/x_mcp_companion/v1
SN_COMPANION_MIN_VERSION=1.0.0
SN_COMPANION_REQUEST_TIMEOUT_MS=3000
```

`MCP_TIER_MAX` valid values are `T0|T1|T2|T3`. Unknown values (for example `T4`) are treated as `T0`.

> Production guidance: default `MCP_TIER_MAX=T0` and disable all write bundles.

Security note:

- `.env` is ignored by git and should never be committed.
- `.env.example` is safe to commit and share as a setup template.

---

## Running Locally

```bash
npm install
npm run start
```

Expected startup output includes:

- `MCP endpoint URL: http://localhost:3001/mcp`
- `MCP SSE URL: http://localhost:3001/mcp/sse`

Optional stdio mode:

```bash
npm run start:stdio
```

Expected behavior:

- Tools above `MCP_TIER_MAX` are rejected before any ServiceNow call.
- All artifact reads include a `validation_summary` block.
- Writes are blocked on CRITICAL validation findings.
- HIGH-severity findings require explicit `acknowledged_findings[]` in write calls.

---

## MCP Tool Catalog

This section includes the list of tools currently available in this server runtime, plus planned v2 tool families.

Canonical catalog governance for 100+ enablement:

- Authoritative 101-tool program matrix: `docs/MCP_TOOL_CATALOG_101_MATRIX.md`
- Runtime implementation truth command: `npm run smoke:summary`
- Current baseline: **25 implemented / 101 target**

When any count differs across docs, use this precedence:

1. runtime registered tools (`smoke:summary`)
2. `docs/MCP_TOOL_CATALOG_101_MATRIX.md`
3. summary docs (README/PRD/epics)

### A) Currently implemented tools (runtime-registered)

Use `npm run smoke:summary` to verify the live registered tool list.

#### Core / platform (T0)

- `sn.instance.info`
- `sn.table.list`
- `sn.acl.trace`

#### Script developer tooling

- `sn.script.get` (T0)
- `sn.script.list` (T0)
- `sn.script.search` (T0)
- `sn.script.refs` (T0)
- `sn.script.deps` (T0)
- `sn.script.create` (T2)
- `sn.script.update` (T2)

#### Changeset / update set tooling

- `sn.changeset.list` (T0)
- `sn.changeset.get` (T0)
- `sn.changeset.contents` (T0)
- `sn.changeset.export` (T0)
- `sn.changeset.gaps` (T0)
- `sn.updateset.capture.verify` (T0)
- `sn.changeset.commit.preview` (T0)
- `sn.changeset.commit` (T3)
- `sn.rollback.plan.generate` (T0)

#### Flow / workflow tooling

- `sn.flow.list` (T0)
- `sn.flow.get` (T0)
- `sn.flow.validate` (T0)
- `sn.workflow.list` (T0)
- `sn.workflow.get` (T0)
- `sn.workflow.validate` (T0)

### B) Planned v2 expansion (documentation target)

- Validation tool family: `sn.validate.*` per artifact type
- `sn.rollback.snapshot.create`
- `sn.atf.coverage_signals`
- broader dev and ITSM catalogs from the architecture plan

Roadmap alignment for full 101-tool enablement:

- `R0`: catalog lock + matrix governance
- `R1 (D5)`: `sn.validate.*` completion
- `R2`: dev parity clusters (metadata/diagnostics/script/flow/workflow/changeset)
- `R3`: ATF + `sn.atf.coverage_signals`
- `R4`: rollback snapshot maturity (`sn.rollback.snapshot.create` and related surfaces)
- `R5`: ITSM/Admin edition pack under strict edition boundaries
- `R6`: docs/runtime drift guards and release-proof claim checks

> Planned tools are not implied as currently implemented. Runtime truth is the registered list returned by MCP `tools/list` and `npm run smoke:summary`.

> For full tool-by-tool status, owner mapping, and enablement track, use `docs/MCP_TOOL_CATALOG_101_MATRIX.md`.

---

Run unit tests for validation/runtime and script tooling:

```bash
npm test
```

Run compact smoke summary output (short, console-friendly):

```bash
npm run smoke:summary
```

This prints only:

- `smoke_summary`
- registered tool names/count

Run the end-user Gate G2 validation checklist (human-readable + JSON artifact):

```bash
npm run test:g2
```

Run the same checklist against your **actual ServiceNow instance from `.env`**:

```bash
npm run test:g2:live
```

Expected output includes a criterion-by-criterion checklist like:

- `✅ D1: Validation runtime is deterministic`
- `✅ D2: Script rulepack v1 metadata/version is attached`
- `✅ D3-CRITICAL: CRITICAL findings block writes`
- `✅ D3-HIGH: HIGH findings require/satisfy acknowledgment`
- `✅ E1: Script read/list/search lifecycle is available`
- `✅ E2: refs/deps include evidence arrays`
- `✅ E3: create/update include audit metadata`

Machine-readable report is generated at:

- `artifacts/g2-validation-summary.json`

Run the end-user Gate G4 validation checklist (human-readable + JSON artifact):

```bash
npm run test:g4
```

Run the same Gate G4 checklist against your **actual ServiceNow instance from `.env`**:

```bash
npm run test:g4:live:gate
```

Machine-readable report is generated at:

- `artifacts/g4-validation-summary.json`

Run the end-user Gate G5 validation checklist (human-readable + JSON artifact):

```bash
npm run test:g5
```

Run the same checklist against your **actual ServiceNow instance from `.env`**:

```bash
npm run test:g5:live
```

Machine-readable report is generated at:

- `artifacts/g5-validation-summary.json`

Run the end-user Gate G6 validation checklist (human-readable + JSON artifact):

```bash
npm run test:g6
```

Run the same checklist against your **actual ServiceNow instance from `.env`**:

```bash
npm run test:g6:live
```

Machine-readable report is generated at:

- `artifacts/g6-validation-summary.json`

Run the Gate G2 integration harness (dev-instance style integration checks for tier/policy/bundle behavior):

```bash
npm run test:g2:integration
```

Machine-readable report is generated at:

- `artifacts/g2-integration-summary.json`

Run the Gate G3 fixture/snapshot regression checks:

```bash
npm run test:g3:fixtures
```

Machine-readable report is generated at:

- `artifacts/g3-fixtures-summary.json`

Run CI-style quality gate aggregation (unit + gates G2/G3/G4/G5/G6):

```bash
npm run test:g4:ci
```

Machine-readable report is generated at:

- `artifacts/g4-ci-quality-summary.json`

Run Gate G7 enterprise readiness validation:

```bash
npm run test:g7
```

Machine-readable report is generated at:

- `artifacts/g7-readiness-summary.json`

Run the non-prod live integration validation used for final Gate G4 exit evidence:

```bash
npm run test:g4:live
```

Run all current G1–G6 live validations in one sequence:

```bash
npm run test:gates:g1-g6:live
```

Live gate safety guards:

- `test:g2:live`, `test:g4:live:gate`, `test:g5:live`, and `test:g6:live` require:
  - `GATE_TEST_TARGET=live`
  - `ALLOW_LIVE_GATE_TESTS=true`
  - `ALLOW_LIVE_GATE_WRITES=true`
- These are set by the npm scripts above.
- Live runs fail fast if `SN_INSTANCE_URL` is missing or still points to `example.service-now.com`.

Machine-readable report is generated at:

- `artifacts/g4-integration-summary.json`

### Connectivity Diagnostics (Gate G1 Evidence)

Run expanded live instance diagnostics (outside smoke):

```bash
npm run test:live
```

This verifies:

- auth handshake (`sys_user`)
- REST stats endpoint (`/api/now/stats/sys_user`)
- capability probe (`sn.instance.info` path)
- table/metadata access (`v_plugin` preferred, `sys_plugins` fallback, `sys_db_object`)
- script include read (`sys_script_include`)
- classified failure output (`401/403/429/5xx`) with remediation guidance

Run MCP transport diagnostics:

```bash
npm run test:live:mcp
```

This validates:

- MCP endpoint readiness (`GET /mcp`)
- JSON-RPC `initialize`
- JSON-RPC `ping`
- JSON-RPC `tools/list`
- JSON-RPC `tools/call` envelope contracts (`sn.instance.info`, `sn.script.update`, `sn.changeset.commit`)
- JSON-RPC negative-path handling (`parse error`, `invalid request`, `method not found`, `invalid params`, unknown tool)

Both diagnostics scripts are assertion-driven and return non-zero exit codes on contract failures, making them safe for CI-style gating.

Known current behavior in some instances: `sys_plugins` may return `403` even when other probes pass. Diagnostics now probe plugin tables as `v_plugin` first with `sys_plugins` fallback, and classify table-level authorization limits as limited-access warnings rather than transport failures.

Transport diagnostics output now includes an interpretation section that explicitly explains expected guardrail warnings (for example `POLICY_BLOCKED`, `T3_CONFIRMATION_REQUIRED`) during negative-path checks.

---

## Project Layout (Recommended)

```text
/
  src/
    server/
      mcp.ts
      tool-registry.ts
      tiering.ts
      policy-engine.ts
      audit.ts
    servicenow/
      client.ts
      tables.ts
      pagination.ts
      companion.ts
    validation/
      engine.ts
      rulepacks/
        1.0.0/
          scripts/
          flows/
          workflows/
          catalog/
      report.ts
  companion-app/
    update-set.xml
    scoped-app/
      scripted-rest/
      script-includes/
      roles/
  docs/
    PRD_ServiceNow_MCP_Server.md
    BUILD_TIMELINE_ServiceNow_MCP_Server.md
```

---

## Safety Model (Tiers)

- **T0** Read-only: metadata, list, get, validate, preview
- **T1** Safe writes: low-risk writes (config-dependent)
- **T2** Writes: standard modifications with full logging and validation gating
- **T3** Dangerous: commit, delete, cross-scope operations (requires explicit confirm + reason)

A typical enterprise posture:

- prod: T0
- test: T1–T2
- dev: T3 (only when necessary)

---

## ACL Trace Modes (Default + Optional Authority)

`sn.acl.trace` always works, but with explicit mode signaling:

- **Phase A default**: `mode=discovery` (best-effort, explicit limitations, no companion dependency)
- **Phase B optional pilot**: `mode=authoritative` when companion is enabled and compatible

Companion activation is controlled by:

- `SN_COMPANION_ENABLED=true`
- `SN_COMPANION_MODE=scoped|global`

With `SN_COMPANION_MODE=none` (default), companion is intentionally disabled.

## Optional Companion App (Scoped/Global, deprioritized)

Some platform truths cannot be reproduced externally. If companion pilot mode is intentionally enabled, the companion app may provide:

- **Authoritative ACL evaluation** via Scripted REST calling platform evaluation logic
- **Scope guard checks** for cross-scope write protection
- **Version contract** to ensure MCP server behavior is predictable

If the companion app is missing/outdated/unavailable:

- tools degrade safely or refuse “authoritative” operations
- outputs explicitly declare what is and is not reliable

Zurich note: some instances auto-generate Scripted REST `base_uri` from namespace (for example `/api/240215/v1`) even when scoped artifacts are named `x_mcp_companion`. Runtime and live verification now auto-discover effective base path from `sys_ws_definition(name=x_mcp_companion)` and fall back to `SN_COMPANION_BASE_PATH`.

### `sn.acl.trace` behavior

- **Default baseline:** `mode=discovery`
- **Optional pilot:** `mode=authoritative` only when explicitly enabled and compatible

Degraded reason codes currently include:

- `COMPANION_DISABLED_BY_CONFIG`
- `COMPANION_OUTDATED`
- `COMPANION_NOT_INSTALLED`
- `COMPANION_FORBIDDEN`
- `COMPANION_UNREACHABLE`

---

## Validation Engine

Validation is always-on:

- On read: attach `validation_summary`
- On write: block/warn/require-ack based on severity

Severities:

- **CRITICAL**: blocks write
- **HIGH**: requires acknowledgment (`acknowledged_findings[]`)
- **MEDIUM/LOW**: advisory

Rulepacks are versioned and intended to expand to full artifact-specific + cross-cutting rule coverage as defined in the v2 validation addendum.

---

## Audit Logging

All tool calls emit structured JSON logs with:

- instance, tool name, tier, policy decisions
- validation summary counts
- write metadata (table/sys_id/action)
- correlation IDs for traceability

---

## Common Workflows

### Validate a Script Before Changing It

1. `sn.script.get` → read + see `validation_summary`
2. `sn.script.refs` / `sn.script.deps` → inspect evidence-backed dependencies/references
3. Fix changes
4. `sn.script.update` (tier gated) with `acknowledged_findings` if needed

### Script Tooling Coverage (Gate G2)

- Read/navigation: `sn.script.get`, `sn.script.list`, `sn.script.search`
- Evidence: `sn.script.refs`, `sn.script.deps`
- Writes: `sn.script.create`, `sn.script.update`

All script read tools attach validation summaries. Write tools enforce:

- `VALIDATION_BLOCKED_CRITICAL` for CRITICAL findings
- `VALIDATION_ACK_REQUIRED_HIGH` when HIGH findings are not acknowledged

### Update Set Deployment Readiness

Current implemented F-series tools (F1-F6):

- `sn.changeset.list`
- `sn.changeset.get`
- `sn.changeset.contents`
- `sn.changeset.export`
- `sn.changeset.gaps`
- `sn.updateset.capture.verify`
- `sn.changeset.commit.preview`
- `sn.changeset.commit`
- `sn.rollback.plan.generate`

1. `sn.changeset.get`
2. `sn.changeset.gaps` (confidence-tier output)
3. `sn.updateset.capture.verify` for key records
4. `sn.changeset.commit.preview`
5. `sn.changeset.commit` (if allowed) + `sn.rollback.plan.generate`

### Flow/Workflow Artifact Parity (Gate G6)

- Flow tools: `sn.flow.list`, `sn.flow.get`, `sn.flow.validate`
- Workflow tools: `sn.workflow.list`, `sn.workflow.get`, `sn.workflow.validate`
- Validation coverage: flow/workflow reads now include rulepack-backed `validation_summary`
  (`flows-v1`, `workflows-v1`) with deterministic findings output.

---

## MCP Endpoint Verification (HTTP/SSE)

Check endpoint metadata:

```bash
curl -H "Accept: application/json" http://localhost:3001/mcp
```

Expected response includes transport metadata and supported methods.

> Note: Opening `http://localhost:3001/mcp` in a browser returns an informational HTML page.
> MCP clients should use `POST /mcp` (JSON-RPC), and scripts can force metadata JSON with `Accept: application/json`.

Basic MCP JSON-RPC initialize request:

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {}
  }'
```

List tools:

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

Call a tool (`sn.instance.info`):

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "sn.instance.info",
      "arguments": {}
    }
  }'
```

---

## Connecting LLM Clients

### URL-based MCP clients (recommended)

Use this MCP endpoint URL:

- `http://localhost:3001/mcp`

If the client supports separate SSE configuration, also use:

- `http://localhost:3001/mcp/sse`

### Command/stdio clients (fallback)

If your client only supports stdio MCP servers, use:

- command: `node`
- args: `D:/Personal Projects/ServiceNow-MCP/ServiceNow-MCP/src/index.js`
- env: set `MCP_TRANSPORT=stdio` plus your `SN_*` and `MCP_*` variables

---

## Contributing / Governance

- Treat rulepacks as regulated artifacts:
  - version bumps require change notes
  - rule source references required
  - release alignment must be stated
- No tool may claim certainty where the platform cannot provide it.
- Any new T3 tool must include:
  - explicit confirm and reason
  - dry-run if possible
  - rollback planning surface

---

## License

TBD (choose per organizational policy)
