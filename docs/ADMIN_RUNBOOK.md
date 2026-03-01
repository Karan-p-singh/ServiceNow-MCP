# ServiceNow MCP Server — Admin Runbook (Gate G7)

Last Updated: 2026-03-01 (R2 docs sync)

## 0) Operating Contract (Read First)

This runbook follows the v2 documentation truth policy:

- Treat discovery ACL output as diagnostic, not platform-authoritative.
- Treat changeset gap output as confidence-ranked evidence, not complete dependency truth.
- Treat commit/rollback tools as controlled deployment aids, not guaranteed reversibility.
- Treat companion capability as optional pilot mode, never baseline requirement.

Catalog claim integrity contract (101-tool program):

- Current documented baseline: **43 implemented / 101 target / 58 remaining**.
- Never present planned tools as implemented tools.
- For any release-candidate or stakeholder claim, reconcile evidence in this order:
  1. `npm run smoke:summary` (runtime registered tools)
  2. `docs/MCP_TOOL_CATALOG_101_MATRIX.md` (program matrix)
  3. Summary trackers (`README.md`, `Epics/BUILD_STATUS_BOARD.md`, `Epics/MILESTONES_AND_GATES.md`)

## 1) Startup and Health

### Start server (HTTP/SSE)

```bash
npm run start
```

Expected:

- `MCP endpoint URL: http://localhost:3001/mcp`
- `MCP SSE URL: http://localhost:3001/mcp/sse`

### Quick smoke verification

```bash
npm run smoke:summary
```

Recommended immediate checks after startup:

1. Verify expected tool inventory appears (implemented tools only).
2. Confirm tier policy (`MCP_TIER_MAX`) matches target environment posture.
3. Confirm companion is disabled for baseline runs unless intentionally piloting authoritative ACL mode.

## 2) Standard Validation Ops

### Unit tests

```bash
npm run test
```

### Gate validation checks

```bash
npm run test:g2
npm run test:g2:integration
npm run test:g3:fixtures
npm run test:g4
npm run test:g4:ci
npm run test:g5
npm run test:g6
npm run test:g7
```

Artifacts are written under `artifacts/`.

## 3) Deploy Profile Operations

Control runtime exposure with:

- `MCP_DEPLOY_PROFILE=dev_full|dev_safe|prod_readonly|commit_only`
- `MCP_ENABLED_BUNDLES` (optional explicit override)
- `MCP_DISABLED_TOOLS` (explicit deny-list)

When a tool is disallowed, runtime returns:

- `TOOL_DISABLED_BY_BUNDLE`

Recommended profiles by environment:

- **Prod:** `MCP_DEPLOY_PROFILE=prod_readonly`, `MCP_TIER_MAX=T0`
- **Test/UAT:** `MCP_DEPLOY_PROFILE=dev_safe`, `MCP_TIER_MAX=T1|T2`
- **Dev sandbox:** `MCP_DEPLOY_PROFILE=dev_full` (or explicit bundles)

## 4) SIEM/Webhook Operations

Enable structured audit forwarding:

```env
MCP_AUDIT_WEBHOOK_ENABLED=true
MCP_AUDIT_WEBHOOK_URL=https://your-siem-endpoint.example/webhook
MCP_AUDIT_WEBHOOK_FILTER=writes
MCP_AUDIT_WEBHOOK_TIMEOUT_MS=2000
```

Filters:

- `writes` — only write-like events
- `high_risk` — T3 or CRITICAL/HIGH finding context
- `all` — all audit lifecycle stages

## 5) Incident Triage

### Transport issues

Run:

```bash
npm run test:live:mcp
```

### Connectivity/auth issues

Run:

```bash
npm run test:live
```

### Contract drift issues

Run:

```bash
npm run test:g4:ci
```

### Documentation/runtime drift issues

When docs and runtime appear inconsistent (tool names, guarantees, mode semantics):

1. Trust runtime-registered list (`npm run smoke:summary`) as source of implementation truth.
2. Cross-check README implemented vs planned sections.
3. Update docs and trackers atomically (`BUILD_STATUS_BOARD`, `BUILD_ACTIVITY_LOG`, `MILESTONES_AND_GATES`, `RISKS_AND_DECISIONS`).

### 101-tool claim drift prevention (release cadence)

Run this evidence bundle before any “100+ tools enabled” claim:

```bash
npm run smoke:summary
npm run test:g4:ci
npm run test:g7
```

Then confirm:

1. Runtime implemented count from `smoke:summary` matches implemented count tracked in `docs/MCP_TOOL_CATALOG_101_MATRIX.md`.
2. Matrix status changes (if any) are reflected in README/epics trackers.
3. Claim language uses implemented-vs-planned boundaries and preserves non-overclaim contracts.

## 6) Rollback and Recovery

If recent changes must be reverted:

1. Reset local changes in git as per team policy.
2. Re-run `npm run test:g4:ci` to confirm baseline integrity.
3. Re-run `npm run test:g7` to confirm Gate 7 readiness package integrity.

Important rollback note:

- Use rollback outputs as **planning evidence**. Do not describe rollback as guaranteed.
- If artifacts are marked non-restorable, follow manual steps and capture operator notes.

## 7) Optional Companion Pilot Operations (Only if explicitly enabled)

Baseline operation does not require companion app deployment.

If you intentionally enable pilot mode:

1. Enable config (`SN_COMPANION_ENABLED=true`, `SN_COMPANION_MODE=scoped|global`).
2. Run `npm run deploy:companion` (strict invariants).
3. Run `npm run test:companion:live`.
4. If checks fail, revert to baseline (`SN_COMPANION_ENABLED=false`, `SN_COMPANION_MODE=none`) and continue discovery mode.
