# ServiceNow MCP Optional Companion Authority Contract

Status: Optional pilot path (not baseline runtime requirement)

This repository includes an **optional** companion authority contract.

Important positioning:

- Baseline MCP delivery is discovery-first and companion-independent.
- Companion should be treated as an opt-in pilot for teams that explicitly need authoritative ACL tracing.
- If companion is unavailable, baseline tooling must remain operational with explicit degraded-mode signaling.

Catalog claim integrity boundary:

- Companion enablement changes `sn.acl.trace` confidence/mode semantics (`discovery` vs `authoritative`) but does **not** increase the number of runtime-registered MCP tools by itself.
- Tool-count claims must follow runtime-first evidence (`npm run smoke:summary`) and then the program matrix (`docs/MCP_TOOL_CATALOG_101_MATRIX.md`).
- Planned tools remain planned until they are runtime-registered and reconciled in governance trackers.

- **Phase A (default):** no companion dependency (`SN_COMPANION_ENABLED=false`, `SN_COMPANION_MODE=none`)
- **Phase B (optional pilot):** enable companion authority for `sn.acl.trace` (`scoped` or `global`)

## Optional Deployment Modes

### Scoped mode (preferred when companion is enabled)

- Scope: `x_mcp_companion`
- Versioned API contract (minimum supported version configured by `SN_COMPANION_MIN_VERSION`)
- Scripted REST base path (default): `/api/x_mcp_companion/v1`

### Global mode (non-ideal pilot)

- Base path: `/api/global/x_mcp_companion/v1`
- Enabled with `SN_COMPANION_MODE=global`
- Intended only as an operational fallback pilot when scoped deployment is blocked

Zurich deployment note: depending on instance namespace generation, effective `sys_ws_definition.base_uri` can be auto-derived (for example `/api/240215/v1`). MCP runtime and live verification scripts now discover this value dynamically.

## Required Endpoints

### `GET /health`

Expected response shape:

```json
{
	"result": {
		"status": "ok",
		"version": "1.2.0",
		"app_scope": "x_mcp_companion"
	}
}
```

### `POST /acl/evaluate`

Request shape (minimum):

```json
{
	"user": "optional-user-sys-id-or-name",
	"table": "incident",
	"sys_id": "optional-record-sys-id",
	"operation": "read",
	"field": "optional-field",
	"context": {}
}
```

Response shape (minimum):

```json
{
	"result": {
		"decision": "allow",
		"reasoning_summary": "...",
		"evaluated_acls": []
	}
}
```

## Runtime Behavior in MCP Server

- With Phase A defaults, ACL tracing remains available in `mode="discovery"` with explicit limitations.
- Companion authority is activated only when both are true:
  - `SN_COMPANION_ENABLED=true`
  - `SN_COMPANION_MODE=scoped|global`

- If Companion is present and version-compatible, `sn.acl.trace` returns `mode="authoritative"` with `confidence="high"`.
- If Companion is missing/outdated/unreachable/disabled, `sn.acl.trace` degrades to `mode="discovery"` with explicit `limitations[]` and deterministic `degraded_reason_code`.

## Optional Update Set Import Workflow (Scoped-only, strict)

Use this only if you are explicitly running **Phase B scoped companion pilot**.

### 1) Build update set XML

```bash
npm run build:companion
```

This generates `companion-app/update-set.xml` from scoped source artifacts and enforces strict preflight checks:

- role definition is `x_mcp_companion.api_user`
- Scripted REST definition metadata is present (`name`, `api_id`, `base_path`)
- required resources are present and correctly shaped (`GET /health`, `POST /acl/evaluate`)
- script include and resource script references are internally consistent

If preflight fails, build aborts.

### 2) Import in ServiceNow

In target instance (with import/commit permissions):

1. Navigate to **System Update Sets → Retrieved Update Sets**
2. Import XML (`companion-app/update-set.xml`)
3. Open imported update set
4. Run **Preview Update Set** and resolve any collisions
5. Run **Commit Update Set**

### 3) Enforce strict deployment invariants

```bash
npm run deploy:companion
```

Deployment script is intentionally strict:

- does **not** create companion artifacts in ambiguous/global context
- fails if required artifacts are missing
- fails if companion artifacts are global-scoped or `api_name` is `global.*`
- requires companion ownership expectations before proceeding

### 4) Validate live behavior and ownership

```bash
npm run test:companion:live
```

This must report:

- companion scope + artifacts exist
- script includes use `x_mcp_companion.*` api names
- Scripted REST definition/operations are present and properly linked
- required auth/ACL flags are correctly set
- runtime endpoint payload contracts pass

## Acceptance Criteria (Done Means Done)

### Phase A baseline (default)

Companion deployment is **not required** when all are true:

1. `SN_COMPANION_ENABLED=false`
2. `SN_COMPANION_MODE=none`
3. `sn.acl.trace` returns `mode=discovery` with deterministic degraded reason codes.

This is the recommended default for most environments.

### Phase B scoped/global pilot

Companion app is acceptable only when all are true:

1. `npm run build:companion` succeeds.
2. Update set is imported, previewed, and committed in ServiceNow.
3. `npm run deploy:companion` completes without invariant failures.
4. `npm run test:companion:live` shows **0 required failures**.
5. Companion records are owned by `sys_scope=x_mcp_companion` (not `global`).

## Catalog Claim Safety Note

Do not use companion pilot readiness as evidence for “100+ tools enabled.”

Before any catalog-size claim, reconcile in this order:

1. `npm run smoke:summary`
2. `docs/MCP_TOOL_CATALOG_101_MATRIX.md`
3. README + epics tracker synchronization
