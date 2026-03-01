# ServiceNow MCP Server — Admin Runbook (Gate G7)

Last Updated: 2026-03-01

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

## 6) Rollback and Recovery

If recent changes must be reverted:

1. Reset local changes in git as per team policy.
2. Re-run `npm run test:g4:ci` to confirm baseline integrity.
3. Re-run `npm run test:g7` to confirm Gate 7 readiness package integrity.
