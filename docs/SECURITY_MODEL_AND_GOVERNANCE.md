# Security Model and Governance (Gate G7)

Last Updated: 2026-03-01

## 1) Safety Posture

This MCP server remains **safe-by-default**:

- Tier model: `T0` (read-only) → `T3` (high-risk)
- Policy engine controls scope/global write behavior before handlers execute
- Validation engine enforces CRITICAL/HIGH write gating contracts

## 2) Tool Bundles and Deploy Profiles

Gate G7 introduces deploy-surface controls:

- `MCP_DEPLOY_PROFILE` with built-in profiles:
  - `dev_full`
  - `dev_safe`
  - `prod_readonly`
  - `commit_only`
- `MCP_ENABLED_BUNDLES` for explicit bundle override
- `MCP_DISABLED_TOOLS` for explicit deny-listing

Tool invocation now returns deterministic `TOOL_DISABLED_BY_BUNDLE` when blocked by bundle/profile policy.

## 3) SIEM / Webhook Audit Export

Optional webhook sink configuration:

- `MCP_AUDIT_WEBHOOK_ENABLED`
- `MCP_AUDIT_WEBHOOK_URL`
- `MCP_AUDIT_WEBHOOK_FILTER` (`writes|high_risk|all`)
- `MCP_AUDIT_WEBHOOK_TIMEOUT_MS`

Behavior:

- If disabled, runtime behaves unchanged.
- If enabled, audit events are forwarded as JSON envelopes.
- Failures in webhook forwarding are non-fatal and logged as warnings.

## 4) Break-Glass and Scope Governance

Break-glass controls remain enforced via:

- `MCP_BREAK_GLASS_ENABLED`
- required reason text on break-glass invocation
- full audit events including policy decisions and error codes

## 5) Companion Authority Security Position

- Phase A default: Companion disabled (`SN_COMPANION_ENABLED=false`, `SN_COMPANION_MODE=none`)
- Optional Phase B pilot: explicit enablement required (`scoped|global`)
- ACL trace always reports mode and limitations honestly (`discovery` vs `authoritative`)
