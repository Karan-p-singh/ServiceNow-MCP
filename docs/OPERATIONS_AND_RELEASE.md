# ServiceNow MCP Server — Operations & Release Guide

Last Updated: 2026-03-04
Purpose: Single canonical operations document for startup, diagnostics, governance checks, and release readiness.

---

## 1) Operating Contract (Read First)

This project uses a strict truth and non-overclaim policy:

- ACL discovery output is diagnostic, not platform-authoritative.
- Changeset gaps are confidence-ranked evidence, not complete dependency truth.
- Commit/rollback tooling is controlled planning aid, not guaranteed reversibility.
- Companion authority is optional pilot mode, never baseline requirement.

Catalog claim integrity contract:

- Current baseline: **101 implemented / 101 target / 0 remaining**.
- Never present planned tools as implemented.
- Claim precedence:
  1. `npm run smoke:summary` (runtime registered tools)
  2. `docs/MCP_TOOL_CATALOG_101_MATRIX.md` (program matrix)
  3. summary docs (`README.md`, epics trackers)

---

## 2) Startup and Health

### Start server (HTTP/SSE default)

```bash
npm run start
```

Expected:

- `MCP endpoint URL: http://localhost:3001/mcp`
- `MCP SSE URL: http://localhost:3001/mcp/sse`

### Quick runtime verification

```bash
npm run smoke:summary
```

Immediate checks:

1. Expected implemented tool inventory is present.
2. `MCP_TIER_MAX` aligns to environment posture.
3. Companion remains disabled for baseline runs unless piloting authoritative mode.

---

## 3) Standard Validation and Gate Ops

### Unit tests

```bash
npm run test
```

### Gate suite

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

Artifacts are emitted in `artifacts/`.

---

## 4) Deploy Profiles and Tool Exposure

Control runtime tool exposure with:

- `MCP_DEPLOY_PROFILE=dev_full|dev_safe|prod_readonly|commit_only`
- `MCP_ENABLED_BUNDLES` (optional explicit override)
- `MCP_DISABLED_TOOLS` (explicit deny-list)

Disallowed tools return `TOOL_DISABLED_BY_BUNDLE`.

Recommended posture:

- **Prod:** `MCP_DEPLOY_PROFILE=prod_readonly`, `MCP_TIER_MAX=T0`
- **Test/UAT:** `MCP_DEPLOY_PROFILE=dev_safe`, `MCP_TIER_MAX=T1|T2`
- **Dev sandbox:** `MCP_DEPLOY_PROFILE=dev_full` (or explicit bundles)

---

## 5) SIEM/Webhook Operations

```env
MCP_AUDIT_WEBHOOK_ENABLED=true
MCP_AUDIT_WEBHOOK_URL=https://your-siem-endpoint.example/webhook
MCP_AUDIT_WEBHOOK_FILTER=writes
MCP_AUDIT_WEBHOOK_TIMEOUT_MS=2000
```

Filter modes:

- `writes`
- `high_risk`
- `all`

---

## 6) Incident Triage

### Transport issues

```bash
npm run test:live:mcp
```

### Connectivity/auth issues

```bash
npm run test:live
```

### Contract drift / CI quality

```bash
npm run test:g4:ci
```

### Docs/runtime drift

1. Trust runtime registered list first (`npm run smoke:summary`).
2. Reconcile with `docs/MCP_TOOL_CATALOG_101_MATRIX.md`.
3. Update summary docs atomically.

---

## 7) Release Readiness (Gate G7 + Claim Integrity)

### Checklist Snapshot

- [x] Unit test suite passes (`npm run test`)
- [x] G2 validation passes (`npm run test:g2`)
- [x] G2 integration passes (`npm run test:g2:integration`)
- [x] G3 fixtures pass (`npm run test:g3:fixtures`)
- [x] G4 CI aggregation passes (`npm run test:g4:ci`)
- [x] SIEM/webhook hardening complete
- [x] Tool bundles/deploy profiles complete
- [x] Security/governance docs complete
- [x] Ops/runbook docs complete
- [x] Documentation truth-policy alignment complete

### Final gate command

```bash
npm run test:g7
```

Expected evidence artifacts:

- `artifacts/g2-integration-summary.json`
- `artifacts/g3-fixtures-summary.json`
- `artifacts/g4-ci-quality-summary.json`
- `artifacts/g7-readiness-summary.json`

### G7 -> G8 integrity cadence

Before any “100+ tools enabled” communication:

```bash
npm run smoke:summary
npm run test:g4:ci
npm run test:g7
```

Required assertions:

- Runtime implemented count and matrix implemented count are synchronized.
- README/epics claims preserve implemented-vs-planned boundaries.
- Companion remains documented as optional pilot.

---

## 8) Rollback and Recovery

1. Revert local changes per team git policy.
2. Re-run `npm run test:g4:ci`.
3. Re-run `npm run test:g7`.

Important: rollback outputs are planning evidence, not guarantees. Follow manual steps for non-restorable items.

---

## 9) Optional Companion Pilot Operations

Baseline operation does not require companion deployment.

For explicit pilot mode only:

1. Enable config (`SN_COMPANION_ENABLED=true`, `SN_COMPANION_MODE=scoped|global`).
2. Run `npm run deploy:companion`.
3. Run `npm run test:companion:live`.
4. If checks fail, revert to baseline discovery mode (`SN_COMPANION_ENABLED=false`, `SN_COMPANION_MODE=none`).
