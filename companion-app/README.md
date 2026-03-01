# ServiceNow MCP Companion App Contract (Gate G3 Baseline)

This repository now includes the MCP-side Companion integration contract used for Gate G3.

## Expected Scoped App

- Scope: `x_mcp_companion`
- Versioned API contract (minimum supported version configured by `SN_COMPANION_MIN_VERSION`)
- Scripted REST base path (default): `/api/x_mcp_companion/v1`

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

- If Companion is present and version-compatible, `sn.acl.trace` returns `mode="authoritative"` with `confidence="high"`.
- If Companion is missing/outdated/unreachable/disabled, `sn.acl.trace` degrades to `mode="discovery"` with explicit `limitations[]` and deterministic `degraded_reason_code`.
