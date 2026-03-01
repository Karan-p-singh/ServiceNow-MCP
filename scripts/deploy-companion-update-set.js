import fs from "node:fs";
import { loadConfig } from "../src/config.js";
import { ServiceNowClient } from "../src/servicenow/client.js";

const COMPANION_SCOPE = "x_mcp_companion";
const ALLOW_GLOBAL_FALLBACK = String(process.env.SN_COMPANION_ALLOW_GLOBAL_FALLBACK || "false").toLowerCase() === "true";

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function refValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.value || "";
  return "";
}

function summarizeRecordScope(record) {
  const scope = refValue(record?.sys_scope) || "<unknown>";
  const pkg = refValue(record?.sys_package) || "<unknown>";
  return { scope, package: pkg };
}

function canEvaluateStrictScope(scopeDetails) {
  return scopeDetails.scope !== "<unknown>";
}

async function getFirstByQuery({ client, table, query, instanceKey }) {
  const page = await client.listTable({ table, query, limit: 1, offset: 0, instanceKey });
  return page.records?.[0] || null;
}

async function ensureCompanionScope({ client, instanceKey }) {
  const existing = await getFirstByQuery({
    client,
    table: "sys_scope",
    query: `scope=${COMPANION_SCOPE}`,
    instanceKey,
  });

  if (existing?.sys_id) {
    return { action: "existing", record: existing };
  }

  const created = await client.request({
    method: "POST",
    path: "/api/now/table/sys_scope",
    body: {
      scope: COMPANION_SCOPE,
      source: COMPANION_SCOPE,
      name: COMPANION_SCOPE,
      short_description: "MCP Companion scoped application",
      active: "true",
    },
    instanceKey,
  });

  return { action: "created", record: created?.data?.result || null };
}

async function updateExistingBySysId({ client, table, sysId, payload, instanceKey }) {
  await client.request({
    method: "PATCH",
    path: `/api/now/table/${table}/${sysId}`,
    body: payload,
    instanceKey,
  });
  return { action: "updated", sys_id: sysId };
}

function assertRecordNotGlobal({ label, record, requireScope = true, expectedApiPrefix = "" }) {
  const scope = refValue(record?.sys_scope) || "<unknown>";
  const apiName = String(record?.api_name || "");

  if (scope === "global") {
    throw new Error(
      `${label} is global-scoped (sys_scope=global). Refusing global deployment path. Recreate/import this record from true scoped app context (${COMPANION_SCOPE}) before rerunning.`,
    );
  }

  if (apiName.startsWith("global.")) {
    throw new Error(
      `${label} has global api_name (${apiName}). Refusing global deployment path. Recreate/import this record from true scoped app context (${COMPANION_SCOPE}) before rerunning.`,
    );
  }

  if (requireScope && scope !== "<unknown>" && scope !== COMPANION_SCOPE) {
    throw new Error(
      `${label} scope mismatch (sys_scope=${scope}). Expected ${COMPANION_SCOPE}. Recreate/import this record from true scoped app context before rerunning.`,
    );
  }

  if (expectedApiPrefix && !apiName.startsWith(expectedApiPrefix)) {
    throw new Error(
      `${label} api_name mismatch (${apiName || "<missing>"}). Expected prefix ${expectedApiPrefix}. Recreate/import this record from true scoped app context before rerunning.`,
    );
  }
}

async function requireExistingByName({
  client,
  table,
  name,
  label,
  instanceKey,
  requireScope = true,
  expectedApiPrefix = "",
}) {
  const record = await getFirstByQuery({
    client,
    table,
    query: `name=${name}`,
    instanceKey,
  });

  if (!record?.sys_id) {
    throw new Error(
      `${label} is missing. This deployment script is scope-bootstrap + scoped-update only and will not create ${table} records in a potentially global context. Create/import ${label} in scoped app ${COMPANION_SCOPE} (Studio/scoped update set/app repo), then rerun deployment.`,
    );
  }

  assertRecordNotGlobal({
    label,
    record,
    requireScope,
    expectedApiPrefix,
  });

  return record;
}

async function ensureByName({
  client,
  table,
  name,
  label,
  instanceKey,
  createPayload,
  updatePayload,
  requireScope = true,
  expectedApiPrefix = "",
}) {
  const existing = await getFirstByQuery({
    client,
    table,
    query: `name=${name}`,
    instanceKey,
  });

  if (!existing?.sys_id) {
    throw new Error(
      `${label} is missing. This deployment script will NOT create ${table} via Table API because creation may land in global scope. Import and commit companion-app/update-set.xml in scoped app ${COMPANION_SCOPE}, then rerun deployment.`,
    );
  }

  assertRecordNotGlobal({
    label,
    record: existing,
    requireScope,
    expectedApiPrefix,
  });

  await updateExistingBySysId({
    client,
    table,
    sysId: existing.sys_id,
    payload: updatePayload,
    instanceKey,
  });

  const createdRecord = await fetchBySysId({ client, table, sysId: existing.sys_id, instanceKey });
  assertRecordNotGlobal({
    label,
    record: createdRecord,
    requireScope,
    expectedApiPrefix,
  });

  return { action: "created", record: createdRecord };
}

async function requireExistingWsOperation({ client, wsDefinitionId, name, instanceKey }) {
  const label = `REST operation ${name}`;
  const record = await getFirstByQuery({
    client,
    table: "sys_ws_operation",
    query: `web_service_definition=${wsDefinitionId}^name=${name}`,
    instanceKey,
  });

  if (!record?.sys_id) {
    throw new Error(
      `${label} is missing for definition sys_id=${wsDefinitionId}. This deployment script will not create operations outside confirmed scoped context. Create/import this operation in scoped app ${COMPANION_SCOPE}, then rerun deployment.`,
    );
  }

  assertRecordNotGlobal({ label, record, requireScope: true });
  return record;
}

async function ensureWsOperation({
  client,
  wsDefinitionId,
  name,
  label,
  createPayload,
  updatePayload,
  instanceKey,
}) {
  const existing = await getFirstByQuery({
    client,
    table: "sys_ws_operation",
    query: `web_service_definition=${wsDefinitionId}^name=${name}`,
    instanceKey,
  });

  if (!existing?.sys_id) {
    throw new Error(
      `${label} is missing for definition sys_id=${wsDefinitionId}. This deployment script will NOT create sys_ws_operation via Table API because creation may land in global scope. Import and commit companion-app/update-set.xml in scoped app ${COMPANION_SCOPE}, then rerun deployment.`,
    );
  }

  assertRecordNotGlobal({ label, record: existing, requireScope: true });

  await updateExistingBySysId({
    client,
    table: "sys_ws_operation",
    sysId: existing.sys_id,
    payload: updatePayload,
    instanceKey,
  });

  const createdRecord = await fetchBySysId({
    client,
    table: "sys_ws_operation",
    sysId: existing.sys_id,
    instanceKey,
  });
  assertRecordNotGlobal({ label, record: createdRecord, requireScope: true });
  return { action: "updated", record: createdRecord };
}

async function fetchBySysId({ client, table, sysId, instanceKey }) {
  return getFirstByQuery({
    client,
    table,
    query: `sys_id=${sysId}`,
    instanceKey,
  });
}

function printInvariantReport({ title, checks }) {
  console.log(`\n${title}`);
  for (const check of checks) {
    const marker = check.ok ? "✅" : "❌";
    console.log(`${marker} ${check.name}`);
    if (!check.ok && check.details) {
      console.log(`   ${check.details}`);
    }
  }
}

async function main() {
  const config = loadConfig();
  const client = new ServiceNowClient({ config });
  const instanceKey = config.defaultInstance;

  console.log("Companion deployment target:", config.instanceUrl);

  const versionScript = read("companion-app/scoped-app/script-includes/XMcpCompanionVersion.js");
  const aclScript = read("companion-app/scoped-app/script-includes/XMcpAclEvaluator.js");
  const healthResource = read("companion-app/scoped-app/scripted-rest/health.get.js");
  const aclResource = read("companion-app/scoped-app/scripted-rest/acl-evaluate.post.js");

  const scopeInfo = await ensureCompanionScope({ client, instanceKey });
  console.log(`Companion scope (${COMPANION_SCOPE}):`, {
    action: scopeInfo.action,
    sys_id: scopeInfo.record?.sys_id || null,
  });

  console.log(
    "Companion artifact policy: scope bootstrap + strict scoped-update only. Table API create path is disabled to avoid global-scoped artifacts.",
  );

  const role = await ensureByName({
    client,
    table: "sys_user_role",
    name: "x_mcp_companion.api_user",
    label: "Role x_mcp_companion.api_user",
    instanceKey,
    createPayload: null,
    updatePayload: {
      name: "x_mcp_companion.api_user",
      description: "Allows MCP Companion Scripted REST access.",
    },
    requireScope: true,
  });
  console.log("Role:", role);

  const versionInclude = await ensureByName({
    client,
    table: "sys_script_include",
    name: "XMcpCompanionVersion",
    label: "Script Include XMcpCompanionVersion",
    instanceKey,
    createPayload: null,
    updatePayload: {
      name: "XMcpCompanionVersion",
      api_name: "x_mcp_companion.XMcpCompanionVersion",
      active: "true",
      client_callable: "false",
      script: versionScript,
      description: "MCP Companion health/version provider",
    },
    requireScope: true,
    expectedApiPrefix: `${COMPANION_SCOPE}.`,
  });
  console.log("Script Include XMcpCompanionVersion:", versionInclude);

  const aclInclude = await ensureByName({
    client,
    table: "sys_script_include",
    name: "XMcpAclEvaluator",
    label: "Script Include XMcpAclEvaluator",
    instanceKey,
    createPayload: null,
    updatePayload: {
      name: "XMcpAclEvaluator",
      api_name: "x_mcp_companion.XMcpAclEvaluator",
      active: "true",
      client_callable: "false",
      script: aclScript,
      description: "MCP Companion ACL evaluation service",
    },
    requireScope: true,
    expectedApiPrefix: `${COMPANION_SCOPE}.`,
  });
  console.log("Script Include XMcpAclEvaluator:", aclInclude);

  const wsDefinition = await ensureByName({
    client,
    table: "sys_ws_definition",
    name: "x_mcp_companion",
    label: "Scripted REST definition x_mcp_companion",
    instanceKey,
    createPayload: null,
    updatePayload: {
      name: "x_mcp_companion",
      service_id: "v1",
      namespace: "x_mcp_companion",
      active: "true",
      is_versioned: "false",
    },
    requireScope: true,
  });
  console.log("Scripted REST definition:", wsDefinition);

  const wsDefinitionId = wsDefinition.record?.sys_id;

  if (!wsDefinitionId) {
    throw new Error("Scripted REST definition x_mcp_companion resolved without sys_id.");
  }

  const healthOp = await ensureWsOperation({
    client,
    wsDefinitionId,
    name: "health",
    label: "REST operation health",
    createPayload: null,
    updatePayload: {
      name: "health",
      http_method: "GET",
      relative_path: "/health",
      operation_script: healthResource,
      script: healthResource,
      active: "true",
      requires_authentication: "true",
      requires_snc_internal_role: "false",
      requires_acl_authorization: "true",
    },
    instanceKey,
  });
  console.log("REST operation health:", healthOp);

  const aclOp = await ensureWsOperation({
    client,
    wsDefinitionId,
    name: "acl_evaluate",
    label: "REST operation acl_evaluate",
    createPayload: null,
    updatePayload: {
      name: "acl_evaluate",
      http_method: "POST",
      relative_path: "/acl/evaluate",
      operation_script: aclResource,
      script: aclResource,
      active: "true",
      requires_authentication: "true",
      requires_snc_internal_role: "false",
      requires_acl_authorization: "true",
    },
    instanceKey,
  });
  console.log("REST operation acl_evaluate:", aclOp);

  const roleRecord = await fetchBySysId({ client, table: "sys_user_role", sysId: role.record?.sys_id, instanceKey });
  const versionIncludeRecord = await fetchBySysId({
    client,
    table: "sys_script_include",
    sysId: versionInclude.record?.sys_id,
    instanceKey,
  });
  const aclIncludeRecord = await fetchBySysId({
    client,
    table: "sys_script_include",
    sysId: aclInclude.record?.sys_id,
    instanceKey,
  });
  const wsDefinitionRecord = await fetchBySysId({
    client,
    table: "sys_ws_definition",
    sysId: wsDefinitionId,
    instanceKey,
  });
  const healthRecord = await fetchBySysId({
    client,
    table: "sys_ws_operation",
    sysId: healthOp.record?.sys_id,
    instanceKey,
  });
  const aclRecord = await fetchBySysId({
    client,
    table: "sys_ws_operation",
    sysId: aclOp.record?.sys_id,
    instanceKey,
  });

  const checks = [
    {
      name: "Scope record exists",
      ok: Boolean(scopeInfo.record?.sys_id),
      details: `scope=${COMPANION_SCOPE}`,
    },
    {
      name: "Script include XMcpCompanionVersion api_name is companion-scoped",
      ok: String(versionIncludeRecord?.api_name || "").startsWith(`${COMPANION_SCOPE}.`),
      details: `api_name=${versionIncludeRecord?.api_name || "<missing>"}`,
    },
    {
      name: "Script include XMcpAclEvaluator api_name is companion-scoped",
      ok: String(aclIncludeRecord?.api_name || "").startsWith(`${COMPANION_SCOPE}.`),
      details: `api_name=${aclIncludeRecord?.api_name || "<missing>"}`,
    },
    {
      name: "REST definition exists and is active",
      ok: String(wsDefinitionRecord?.active || "").toLowerCase() === "true",
      details: `sys_id=${wsDefinitionId}`,
    },
    {
      name: "REST operation health is bound to definition",
      ok: refValue(healthRecord?.web_service_definition) === wsDefinitionId,
      details: `web_service_definition=${refValue(healthRecord?.web_service_definition) || "<missing>"}`,
    },
    {
      name: "REST operation acl_evaluate is bound to definition",
      ok: refValue(aclRecord?.web_service_definition) === wsDefinitionId,
      details: `web_service_definition=${refValue(aclRecord?.web_service_definition) || "<missing>"}`,
    },
  ];

  const scopeChecks = [
    {
      name: "Role record scope/package",
      details: summarizeRecordScope(roleRecord),
    },
    {
      name: "Script include XMcpCompanionVersion scope/package",
      details: summarizeRecordScope(versionIncludeRecord),
    },
    {
      name: "Script include XMcpAclEvaluator scope/package",
      details: summarizeRecordScope(aclIncludeRecord),
    },
    {
      name: "REST definition scope/package",
      details: summarizeRecordScope(wsDefinitionRecord),
    },
    {
      name: "REST operation health scope/package",
      details: summarizeRecordScope(healthRecord),
    },
    {
      name: "REST operation acl_evaluate scope/package",
      details: summarizeRecordScope(aclRecord),
    },
  ];

  const strictScopeChecks = scopeChecks.filter((entry) => canEvaluateStrictScope(entry.details));
  const scopeOwnershipIsStrict = strictScopeChecks.every((entry) => entry.details.scope === COMPANION_SCOPE);

  printInvariantReport({ title: "\nCompanion deployment invariant checks", checks });
  console.log("\nCompanion scope ownership snapshot");
  for (const entry of scopeChecks) {
    console.log(`• ${entry.name}:`, entry.details);
  }
  if (strictScopeChecks.length === 0) {
    console.warn("⚠️  No strict scope-capable records were returned by Table API checks.");
  }

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    throw new Error(
      `Companion deployment invariants failed (${failed.length}). First failure: ${failed[0].name}`,
    );
  }

  if (strictScopeChecks.length > 0 && !scopeOwnershipIsStrict) {
    const message =
      "Companion artifacts are not fully owned by sys_scope=x_mcp_companion. Table API deployment can succeed functionally while records remain global-scoped. Set SN_COMPANION_ALLOW_GLOBAL_FALLBACK=true to bypass this error temporarily.";
    if (ALLOW_GLOBAL_FALLBACK) {
      console.warn(`⚠️  ${message}`);
    } else {
      throw new Error(message);
    }
  }

  console.log("✅ Companion deployment (scope-bootstrap + scoped-update path) completed.");
  console.log("Run `npm run test:companion:live` to verify endpoint behavior.");
}

main().catch((error) => {
  console.error("❌ Companion deployment failed");
  console.error(error);
  process.exit(1);
});
