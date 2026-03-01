# Security Model and Governance (Gate G7)

Last Updated: 2026-03-01 (Catalog Claim Integrity Sync)

## 1) Safety Posture

This MCP server remains **safe-by-default**:

- Tier model: `T0` (read-only) → `T3` (high-risk)
- Policy engine controls scope/global write behavior before handlers execute
- Validation engine enforces CRITICAL/HIGH write gating contracts
- Documentation truth policy prevents over-claims and separates **implemented** vs **planned** capabilities

Core truth commitments:

1. ACL discovery mode is diagnostic and confidence-scored; it is not platform-authoritative.
2. Changeset dependency analysis is evidence-tiered (`hard|soft|heuristic`) and does not claim completeness.
3. Commit/rollback surfaces are planning and risk-management tools, not guaranteed reversibility.
4. Companion authority is optional and explicitly opt-in; baseline runtime must work without it.

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

Companion-independent production posture remains recommended:

- `MCP_TIER_MAX=T0`
- `MCP_DEPLOY_PROFILE=prod_readonly`
- `SN_COMPANION_ENABLED=false`
- `SN_COMPANION_MODE=none`

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

Scope governance controls (pre-network enforcement):

- `MCP_ALLOWED_SCOPES`
- `MCP_DENY_GLOBAL_WRITES`
- `MCP_ENFORCE_CHANGESET_SCOPE`
- `MCP_DENY_CROSS_SCOPE_REFERENCES_ON_WRITE`
- `MCP_WARN_ON_GLOBAL_READ`

All are evaluated before write handlers execute to reduce blast radius from cross-scope or global mistakes.

## 5) Validation Gate Security Contract

Validation is enforced consistently on write paths:

- `CRITICAL` findings: write rejected (`VALIDATION_BLOCKED_CRITICAL`)
- `HIGH` findings: write allowed only with explicit `acknowledged_findings[]`
- `MEDIUM`/`LOW`: advisory only

Validation runs in-process and is deterministic for the same payload/rulepack version.

## 6) Companion Authority Security Position

- Phase A default: Companion disabled (`SN_COMPANION_ENABLED=false`, `SN_COMPANION_MODE=none`)
- Optional Phase B pilot: explicit enablement required (`scoped|global`)
- ACL trace always reports mode and limitations honestly (`discovery` vs `authoritative`)

Security guidance:

- Do not treat companion deployment as a prerequisite for baseline release readiness.
- If enabled, require scoped ownership checks and stricter change governance.
- If absent/outdated/unreachable, system behavior must degrade explicitly (never silently).

## 7) 101-Tool Catalog Claim Integrity Controls

For tool-count claims, security governance requires evidence-backed documentation synchronization.

- Current baseline: **25 implemented / 101 target / 76 remaining**.
- Planned tools are roadmap commitments, not runtime-enabled capabilities.
- Companion pilot enablement does not, by itself, increase implemented runtime tool count.

Required evidence order for any catalog claim:

1. `npm run smoke:summary` (runtime-registered implementation truth)
2. `docs/MCP_TOOL_CATALOG_101_MATRIX.md` (authoritative program matrix)
3. Tracker/governance docs (`README.md`, epics boards/gates, runbook)

Recommended release-candidate evidence bundle:

```bash
npm run smoke:summary
npm run test:g4:ci
npm run test:g7
```

If evidence sources disagree, update claims to the lower-confidence truth (runtime first) and synchronize matrix/trackers before publishing release statements.
