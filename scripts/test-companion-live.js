import { loadConfig } from "../src/config.js";
import { ServiceNowClient } from "../src/servicenow/client.js";

const COMPANION_SCOPE = "x_mcp_companion";

function pass(label, details = "") {
  console.log(`✅ PASS: ${label}`);
  if (details) console.log(`   ${details}`);
}

function fail(label, details = "") {
  console.log(`❌ FAIL: ${label}`);
  if (details) console.log(`   ${details}`);
}

function unwrapCompanionPayload(data) {
  const root = data?.result ?? data ?? {};
  if (root && typeof root === "object" && root.result && typeof root.result === "object") {
    return root.result;
  }
  return root;
}

function refValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.value || "";
  return "";
}

function summarizeScope(record) {
  return {
    sys_scope: refValue(record?.sys_scope) || "<unknown>",
    sys_package: refValue(record?.sys_package) || "<unknown>",
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function check(results, { id, description, ok, details = "", required = true }) {
  results.push({ id, description, ok: Boolean(ok), required, details });
}

async function fetchOne({ client, table, query }) {
  const page = await client.listTable({ table, query, limit: 1, offset: 0 });
  return page.records?.[0] || null;
}

async function main() {
  const config = loadConfig();
  const client = new ServiceNowClient({ config });
  const configuredBasePath = config?.companion?.basePath || "/api/x_mcp_companion/v1";
  const results = [];

  let effectiveBasePath = configuredBasePath;
  try {
    const definitions = await client.listTable({
      table: "sys_ws_definition",
      query: "name=x_mcp_companion",
      limit: 1,
      offset: 0,
    });
    const discovered = definitions?.records?.[0]?.base_uri;
    if (discovered) {
      effectiveBasePath = discovered;
    }
  } catch {
    // Keep configured base path when discovery is unavailable.
  }

  console.log("Companion live verification target:", config.instanceUrl);
  console.log("Companion live verification base path:", effectiveBasePath);

  const scopeRecord = await fetchOne({
    client,
    table: "sys_scope",
    query: `scope=${COMPANION_SCOPE}`,
  });
  check(results, {
    id: "meta.scope.exists",
    description: "Companion sys_scope exists",
    ok: Boolean(scopeRecord?.sys_id),
    details: `sys_id=${scopeRecord?.sys_id || "<missing>"}`,
  });

  const roleRecord = await fetchOne({
    client,
    table: "sys_user_role",
    query: "name=x_mcp_companion.api_user",
  });
  check(results, {
    id: "meta.role.exists",
    description: "Companion role exists",
    ok: Boolean(roleRecord?.sys_id),
    details: `sys_id=${roleRecord?.sys_id || "<missing>"}`,
  });

  const versionInclude = await fetchOne({
    client,
    table: "sys_script_include",
    query: "name=XMcpCompanionVersion",
  });
  const aclInclude = await fetchOne({
    client,
    table: "sys_script_include",
    query: "name=XMcpAclEvaluator",
  });
  check(results, {
    id: "meta.include.version.exists",
    description: "XMcpCompanionVersion script include exists",
    ok: Boolean(versionInclude?.sys_id),
    details: `sys_id=${versionInclude?.sys_id || "<missing>"}`,
  });
  check(results, {
    id: "meta.include.acl.exists",
    description: "XMcpAclEvaluator script include exists",
    ok: Boolean(aclInclude?.sys_id),
    details: `sys_id=${aclInclude?.sys_id || "<missing>"}`,
  });
  check(results, {
    id: "meta.include.version.api_name",
    description: "XMcpCompanionVersion api_name is companion-scoped",
    ok: String(versionInclude?.api_name || "").startsWith(`${COMPANION_SCOPE}.`),
    details: `api_name=${versionInclude?.api_name || "<missing>"}`,
  });
  check(results, {
    id: "meta.include.acl.api_name",
    description: "XMcpAclEvaluator api_name is companion-scoped",
    ok: String(aclInclude?.api_name || "").startsWith(`${COMPANION_SCOPE}.`),
    details: `api_name=${aclInclude?.api_name || "<missing>"}`,
  });
  check(results, {
    id: "meta.include.version.client_callable",
    description: "XMcpCompanionVersion is not client callable",
    ok: String(versionInclude?.client_callable || "").toLowerCase() === "false",
    details: `client_callable=${versionInclude?.client_callable || "<missing>"}`,
  });
  check(results, {
    id: "meta.include.acl.client_callable",
    description: "XMcpAclEvaluator is not client callable",
    ok: String(aclInclude?.client_callable || "").toLowerCase() === "false",
    details: `client_callable=${aclInclude?.client_callable || "<missing>"}`,
  });

  const wsDefinition = await fetchOne({
    client,
    table: "sys_ws_definition",
    query: "name=x_mcp_companion",
  });
  check(results, {
    id: "meta.ws_definition.exists",
    description: "Scripted REST definition exists",
    ok: Boolean(wsDefinition?.sys_id),
    details: `sys_id=${wsDefinition?.sys_id || "<missing>"}`,
  });
  check(results, {
    id: "meta.ws_definition.active",
    description: "Scripted REST definition is active",
    ok: String(wsDefinition?.active || "").toLowerCase() === "true",
    details: `active=${wsDefinition?.active || "<missing>"}`,
  });

  const wsDefinitionId = wsDefinition?.sys_id || "";
  const healthOp = wsDefinitionId
    ? await fetchOne({
        client,
        table: "sys_ws_operation",
        query: `web_service_definition=${wsDefinitionId}^name=health`,
      })
    : null;
  const aclOp = wsDefinitionId
    ? await fetchOne({
        client,
        table: "sys_ws_operation",
        query: `web_service_definition=${wsDefinitionId}^name=acl_evaluate`,
      })
    : null;

  check(results, {
    id: "meta.ws_operation.health.exists",
    description: "health operation exists and is linked",
    ok: Boolean(healthOp?.sys_id),
    details: `sys_id=${healthOp?.sys_id || "<missing>"}`,
  });
  check(results, {
    id: "meta.ws_operation.acl.exists",
    description: "acl_evaluate operation exists and is linked",
    ok: Boolean(aclOp?.sys_id),
    details: `sys_id=${aclOp?.sys_id || "<missing>"}`,
  });
  check(results, {
    id: "meta.ws_operation.health.auth_required",
    description: "health operation requires authentication",
    ok: String(healthOp?.requires_authentication || "").toLowerCase() === "true",
    details: `requires_authentication=${healthOp?.requires_authentication || "<missing>"}`,
  });
  check(results, {
    id: "meta.ws_operation.acl.auth_required",
    description: "acl_evaluate operation requires authentication",
    ok: String(aclOp?.requires_authentication || "").toLowerCase() === "true",
    details: `requires_authentication=${aclOp?.requires_authentication || "<missing>"}`,
  });
  check(results, {
    id: "meta.ws_operation.health.acl_required",
    description: "health operation requires ACL authorization",
    ok: String(healthOp?.requires_acl_authorization || "").toLowerCase() === "true",
    details: `requires_acl_authorization=${healthOp?.requires_acl_authorization || "<missing>"}`,
  });
  check(results, {
    id: "meta.ws_operation.acl.acl_required",
    description: "acl_evaluate operation requires ACL authorization",
    ok: String(aclOp?.requires_acl_authorization || "").toLowerCase() === "true",
    details: `requires_acl_authorization=${aclOp?.requires_acl_authorization || "<missing>"}`,
  });
  check(results, {
    id: "meta.ws_operation.health.no_snc_internal",
    description: "health operation does not require snc_internal",
    ok: String(healthOp?.requires_snc_internal_role || "").toLowerCase() === "false",
    details: `requires_snc_internal_role=${healthOp?.requires_snc_internal_role || "<missing>"}`,
  });
  check(results, {
    id: "meta.ws_operation.acl.no_snc_internal",
    description: "acl_evaluate operation does not require snc_internal",
    ok: String(aclOp?.requires_snc_internal_role || "").toLowerCase() === "false",
    details: `requires_snc_internal_role=${aclOp?.requires_snc_internal_role || "<missing>"}`,
  });

  const versionScope = summarizeScope(versionInclude);
  const aclScope = summarizeScope(aclInclude);
  const defScope = summarizeScope(wsDefinition);
  const healthScope = summarizeScope(healthOp);
  const aclOpScope = summarizeScope(aclOp);

  check(results, {
    id: "meta.scope.version_include",
    description: "XMcpCompanionVersion record scope is x_mcp_companion",
    ok: versionScope.sys_scope === COMPANION_SCOPE,
    details: JSON.stringify(versionScope),
  });
  check(results, {
    id: "meta.scope.acl_include",
    description: "XMcpAclEvaluator record scope is x_mcp_companion",
    ok: aclScope.sys_scope === COMPANION_SCOPE,
    details: JSON.stringify(aclScope),
  });
  check(results, {
    id: "meta.scope.ws_definition",
    description: "Scripted REST definition scope is x_mcp_companion",
    ok: defScope.sys_scope === COMPANION_SCOPE,
    details: JSON.stringify(defScope),
  });
  check(results, {
    id: "meta.scope.ws_operation.health",
    description: "health operation scope is x_mcp_companion",
    ok: healthScope.sys_scope === COMPANION_SCOPE,
    details: JSON.stringify(healthScope),
  });
  check(results, {
    id: "meta.scope.ws_operation.acl",
    description: "acl_evaluate operation scope is x_mcp_companion",
    ok: aclOpScope.sys_scope === COMPANION_SCOPE,
    details: JSON.stringify(aclOpScope),
  });

  let healthOk = false;
  let aclOk = false;

  try {
    const health = await client.request({
      method: "GET",
      path: `${effectiveBasePath}/health`,
    });
    const payload = unwrapCompanionPayload(health?.data);
    healthOk = payload?.status === "ok" && Boolean(payload?.version);
    check(results, {
      id: "runtime.health.schema",
      description: "Health payload includes status/version",
      ok: healthOk,
      details: JSON.stringify(payload),
    });
    check(results, {
      id: "runtime.health.app_scope",
      description: "Health payload app_scope matches x_mcp_companion",
      ok: payload?.app_scope === COMPANION_SCOPE,
      details: `app_scope=${payload?.app_scope || "<missing>"}`,
    });
    if (healthOk) {
      pass("Companion health endpoint", JSON.stringify(payload));
    } else {
      fail("Companion health endpoint", JSON.stringify(payload));
    }
  } catch (error) {
    check(results, {
      id: "runtime.health.schema",
      description: "Health payload includes status/version",
      ok: false,
      details: `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`,
    });
    fail("Companion health endpoint", `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`);
  }

  try {
    const acl = await client.request({
      method: "POST",
      path: `${effectiveBasePath}/acl/evaluate`,
      body: {
        table: "incident",
        operation: "read",
        field: "short_description",
      },
    });
    const payload = unwrapCompanionPayload(acl?.data);
    aclOk = ["allow", "deny", "indeterminate"].includes(payload?.decision);
    check(results, {
      id: "runtime.acl.schema",
      description: "ACL payload includes valid decision enum",
      ok: aclOk,
      details: JSON.stringify(payload),
    });
    check(results, {
      id: "runtime.acl.reasoning",
      description: "ACL payload includes reasoning_summary",
      ok: typeof payload?.reasoning_summary === "string" && payload.reasoning_summary.length > 0,
      details: `reasoning_summary=${payload?.reasoning_summary || "<missing>"}`,
    });
    check(results, {
      id: "runtime.acl.evaluated_acls",
      description: "ACL payload includes evaluated_acls array",
      ok: Array.isArray(payload?.evaluated_acls),
      details: `type=${typeof payload?.evaluated_acls}`,
    });
    if (aclOk) {
      pass("Companion ACL evaluate endpoint", JSON.stringify(payload));
    } else {
      fail("Companion ACL evaluate endpoint", JSON.stringify(payload));
    }
  } catch (error) {
    check(results, {
      id: "runtime.acl.schema",
      description: "ACL payload includes valid decision enum",
      ok: false,
      details: `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`,
    });
    fail("Companion ACL evaluate endpoint", `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`);
  }

  try {
    const negative = await client.request({
      method: "POST",
      path: `${effectiveBasePath}/acl/evaluate`,
      body: {
        operation: "read",
      },
    });
    const payload = unwrapCompanionPayload(negative?.data);
    const acceptable =
      ["allow", "deny", "indeterminate"].includes(payload?.decision) ||
      typeof payload?.reasoning_summary === "string";
    check(results, {
      id: "runtime.acl.negative_payload",
      description: "ACL endpoint returns controlled response on partial payload",
      ok: acceptable,
      details: JSON.stringify(payload),
      required: false,
    });
  } catch (error) {
    const acceptableError = ["SN_RESOURCE_NOT_FOUND", "SN_AUTH_FORBIDDEN", "SERVICENOW_REQUEST_FAILED"].includes(error?.code);
    check(results, {
      id: "runtime.acl.negative_payload",
      description: "ACL endpoint returns controlled response on partial payload",
      ok: acceptableError,
      details: `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`,
      required: false,
    });
  }

  console.log("\nCompanion detailed verification matrix");
  for (const result of results) {
    const marker = result.ok ? "✅" : "❌";
    const requiredLabel = result.required ? "required" : "advisory";
    console.log(`${marker} [${requiredLabel}] ${result.id} — ${result.description}`);
    if (!result.ok || result.details) {
      console.log(`   ${result.details || ""}`);
    }
  }

  const requiredFailures = results.filter((entry) => entry.required && !entry.ok);
  const advisoryFailures = results.filter((entry) => !entry.required && !entry.ok);
  console.log("\nCompanion verification summary");
  console.log(`- Total checks: ${results.length}`);
  console.log(`- Required failures: ${requiredFailures.length}`);
  console.log(`- Advisory failures: ${advisoryFailures.length}`);

  if (!healthOk || !aclOk || requiredFailures.length > 0) {
    process.exitCode = 1;
    return;
  }

  pass("Companion live verification complete");
}

main().catch((error) => {
  fail("Companion live verification unhandled failure", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
