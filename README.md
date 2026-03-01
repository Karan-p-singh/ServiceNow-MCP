# ServiceNow MCP Server v2

A **safe-by-default MCP (Model Context Protocol) server** for ServiceNow that enables LLM tooling to **read, validate, and (when allowed) change** ServiceNow artifacts with enterprise guardrails.

This repository delivers:
- **MCP Server (TypeScript)**: tool registry, tier enforcement, policy engine, validation engine, audit logs
- **ServiceNow Companion App (Scoped)**: authoritative platform-native evaluation endpoints (e.g., ACL evaluation)
- **Rulepacks**: versioned best-practice and governance validations

---

## Why this exists

ServiceNow is not a generic CRUD system. External tooling cannot safely “guess”:
- ACL outcomes (scripted ACLs, impersonation, domain separation context)
- update set completeness (implicit dependencies and embedded references)
- rollback reversibility from commits

This project is designed to be **honest and safe**:
- “Authoritative” actions require a **Companion App**.
- Dependency tools return **confidence tiers**.
- Commit and rollback are implemented as **preview + plan**, not false promises.

---

## Quick Start

### 1) Prerequisites
- Node.js 18+
- Access to a ServiceNow instance (dev/test recommended)
- A least-privilege ServiceNow service account
- (Recommended) OAuth credentials for ServiceNow REST APIs

### 2) Configure Environment

Create `.env` (or set environment variables via your secret manager):

```bash
# Edition: dev | itsm
MCP_EDITION=dev

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
```

> Production guidance: default `MCP_TIER_MAX=T0` and disable all write bundles.

---

## Running Locally

```bash
npm install
npm run build
npm run start
```

Expected behavior:
- Tools above `MCP_TIER_MAX` are rejected before any ServiceNow call.
- All artifact reads include a `validation_summary` block.
- Writes are blocked on CRITICAL validation findings.

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

## Companion App (ServiceNow Scoped)

Some platform truths cannot be reproduced externally.
The Companion App provides:
- **Authoritative ACL evaluation** via Scripted REST calling platform evaluation logic
- **Scope guard checks** for cross-scope write protection
- **Version contract** to ensure MCP server behavior is predictable

If the Companion App is missing or outdated:
- tools degrade safely or refuse “authoritative” operations
- outputs explicitly declare what is and is not reliable

---

## Validation Engine

Validation is always-on:
- On read: attach `validation_summary`
- On write: block/warn/require-ack based on severity

Severities:
- **CRITICAL**: blocks write
- **HIGH**: requires acknowledgment (`acknowledged_findings[]`)
- **MEDIUM/LOW**: advisory

Rulepacks are versioned and can be tailored by enterprise policy.

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
1) `sn.script.get` → read + see `validation_summary`
2) `sn.script.validate` → full findings
3) Fix changes
4) `sn.script.update` (tier gated) with `acknowledged_findings` if needed

### Update Set Deployment Readiness
1) `sn.changeset.get`
2) `sn.changeset.gaps` (confidence-tier output)
3) `sn.updateset.capture.verify` for key records
4) `sn.changeset.commit.preview`
5) `sn.changeset.commit` (if allowed) + `sn.rollback.plan.generate`

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
