import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const COMPANION_SCOPE = "x_mcp_companion";
const VERSION_INCLUDE_NAME = "XMcpCompanionVersion";
const ACL_INCLUDE_NAME = "XMcpAclEvaluator";
const VERSION_INCLUDE_API = `${COMPANION_SCOPE}.${VERSION_INCLUDE_NAME}`;
const ACL_INCLUDE_API = `${COMPANION_SCOPE}.${ACL_INCLUDE_NAME}`;

function read(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapCdata(value) {
  return `<![CDATA[${String(value || "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function deterministicSysId(seed) {
  return crypto.createHash("md5").update(String(seed)).digest("hex");
}

function asField(value, attrs = null) {
  return {
    value,
    attrs,
    cdata: false,
  };
}

function asCdataField(value, attrs = null) {
  return {
    value,
    attrs,
    cdata: true,
  };
}

function serializeAttrs(attrs) {
  if (!attrs || typeof attrs !== "object") return "";
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${xmlEscape(value)}"`)
    .join("");
}

function serializeFieldTag(tagName, field) {
  const attrs = serializeAttrs(field?.attrs);
  if (field?.cdata) {
    return `<${tagName}${attrs}>${wrapCdata(field?.value || "")}</${tagName}>`;
  }
  return `<${tagName}${attrs}>${xmlEscape(field?.value || "")}</${tagName}>`;
}

function buildRecordUpdatePayload({ table, fields }) {
  const body = Object.entries(fields)
    .map(([tagName, field]) => `    ${serializeFieldTag(tagName, field)}`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<record_update table="${xmlEscape(table)}">
  <${table} action="INSERT_OR_UPDATE">
${body}
  </${table}>
</record_update>`;
}

function buildSysUpdateXmlEntry({
  sourceTable,
  targetName,
  type,
  payload,
  remoteUpdateSetSysId,
  remoteUpdateSetName,
  seed,
}) {
  const recordSysId = deterministicSysId(`sys_update_xml:${seed}`);
  return `  <sys_update_xml action="INSERT_OR_UPDATE">
    <sys_id>${recordSysId}</sys_id>
    <name>${xmlEscape(`${sourceTable}_${targetName}`)}</name>
    <source_table>${xmlEscape(sourceTable)}</source_table>
    <target_name>${xmlEscape(targetName)}</target_name>
    <type>${xmlEscape(type)}</type>
    <category>customer</category>
    <replace_on_upgrade>false</replace_on_upgrade>
    <update_set display_value="${xmlEscape(remoteUpdateSetName)}">${xmlEscape(remoteUpdateSetSysId)}</update_set>
    <payload>${wrapCdata(payload)}</payload>
  </sys_update_xml>`;
}

function normalizeResource(definition, name, method) {
  return definition.resources?.find(
    (entry) => String(entry.name || "") === name && String(entry.http_method || "").toUpperCase() === method,
  );
}

function buildUpdateSetXml() {
  const roleDefinition = readJson("companion-app/scoped-app/roles/x_mcp_companion.api_user.json");
  const restDefinition = readJson("companion-app/scoped-app/scripted-rest/definition.json");

  const versionScript = read("companion-app/scoped-app/script-includes/XMcpCompanionVersion.js");
  const aclScript = read("companion-app/scoped-app/script-includes/XMcpAclEvaluator.js");
  const healthResource = read("companion-app/scoped-app/scripted-rest/health.get.js");
  const aclResource = read("companion-app/scoped-app/scripted-rest/acl-evaluate.post.js");

  const healthDefinition = normalizeResource(restDefinition, "health", "GET");
  const aclDefinition = normalizeResource(restDefinition, "acl_evaluate", "POST");

  assert(roleDefinition?.name === `${COMPANION_SCOPE}.api_user`, "Role definition name must be x_mcp_companion.api_user");
  assert(restDefinition?.name === COMPANION_SCOPE, "Scripted REST definition name must be x_mcp_companion");
  assert(restDefinition?.api_id === COMPANION_SCOPE, "Scripted REST api_id must be x_mcp_companion");
  assert(typeof restDefinition?.base_path === "string" && restDefinition.base_path.length > 0, "Scripted REST base_path is required");
  assert(Boolean(healthDefinition), "Scripted REST definition is missing GET health resource");
  assert(Boolean(aclDefinition), "Scripted REST definition is missing POST acl_evaluate resource");
  assert(String(healthDefinition.relative_path || "") === "/health", "health resource relative_path must be /health");
  assert(
    String(aclDefinition.relative_path || "") === "/acl/evaluate",
    "acl_evaluate resource relative_path must be /acl/evaluate",
  );

  assert(VERSION_INCLUDE_API.startsWith(`${COMPANION_SCOPE}.`), "Version script include api_name must be scoped");
  assert(ACL_INCLUDE_API.startsWith(`${COMPANION_SCOPE}.`), "ACL evaluator api_name must be scoped");
  assert(versionScript.includes(`type: \"${VERSION_INCLUDE_NAME}\"`), "XMcpCompanionVersion script include appears incomplete");
  assert(aclScript.includes(`type: \"${ACL_INCLUDE_NAME}\"`), "XMcpAclEvaluator script include appears incomplete");
  assert(healthResource.includes(VERSION_INCLUDE_NAME), "health resource must reference XMcpCompanionVersion");
  assert(aclResource.includes(ACL_INCLUDE_NAME), "acl_evaluate resource must reference XMcpAclEvaluator");

  const generatedOn = new Date().toISOString();
  const remoteUpdateSetName = "ServiceNow MCP Companion (x_mcp_companion)";
  const remoteUpdateSetSysId = deterministicSysId(`remote_update_set:${remoteUpdateSetName}`);
  const scopeSysId = deterministicSysId(`sys_scope:${COMPANION_SCOPE}`);
  const packageSysId = deterministicSysId(`sys_package:${COMPANION_SCOPE}`);

  const roleSysId = deterministicSysId("sys_user_role:x_mcp_companion.api_user");
  const versionIncludeSysId = deterministicSysId("sys_script_include:XMcpCompanionVersion");
  const aclIncludeSysId = deterministicSysId("sys_script_include:XMcpAclEvaluator");
  const wsDefinitionSysId = deterministicSysId("sys_ws_definition:x_mcp_companion");
  const healthOperationSysId = deterministicSysId("sys_ws_operation:x_mcp_companion:health");
  const aclOperationSysId = deterministicSysId("sys_ws_operation:x_mcp_companion:acl_evaluate");

  const sharedScopedFields = {
    sys_scope: asField(scopeSysId, { display_value: COMPANION_SCOPE }),
    sys_package: asField(packageSysId, { display_value: COMPANION_SCOPE }),
  };

  const rolePayload = buildRecordUpdatePayload({
    table: "sys_user_role",
    fields: {
      sys_id: asField(roleSysId),
      name: asField(roleDefinition.name),
      description: asField("Allows MCP Companion Scripted REST access."),
      ...sharedScopedFields,
    },
  });

  const versionIncludePayload = buildRecordUpdatePayload({
    table: "sys_script_include",
    fields: {
      sys_id: asField(versionIncludeSysId),
      name: asField(VERSION_INCLUDE_NAME),
      api_name: asField(VERSION_INCLUDE_API),
      active: asField("true"),
      client_callable: asField("false"),
      description: asField("MCP Companion health/version provider"),
      script: asCdataField(versionScript),
      ...sharedScopedFields,
    },
  });

  const aclIncludePayload = buildRecordUpdatePayload({
    table: "sys_script_include",
    fields: {
      sys_id: asField(aclIncludeSysId),
      name: asField(ACL_INCLUDE_NAME),
      api_name: asField(ACL_INCLUDE_API),
      active: asField("true"),
      client_callable: asField("false"),
      description: asField("MCP Companion ACL evaluation service"),
      script: asCdataField(aclScript),
      ...sharedScopedFields,
    },
  });

  const wsDefinitionPayload = buildRecordUpdatePayload({
    table: "sys_ws_definition",
    fields: {
      sys_id: asField(wsDefinitionSysId),
      name: asField(restDefinition.name),
      api_id: asField(restDefinition.api_id),
      namespace: asField(COMPANION_SCOPE),
      service_id: asField("v1"),
      is_versioned: asField("false"),
      active: asField("true"),
      base_path: asField(restDefinition.base_path),
      ...sharedScopedFields,
    },
  });

  const healthOperationPayload = buildRecordUpdatePayload({
    table: "sys_ws_operation",
    fields: {
      sys_id: asField(healthOperationSysId),
      name: asField(String(healthDefinition.name || "health")),
      http_method: asField(String(healthDefinition.http_method || "GET").toUpperCase()),
      relative_path: asField(String(healthDefinition.relative_path || "/health")),
      active: asField("true"),
      requires_authentication: asField("true"),
      requires_acl_authorization: asField("true"),
      requires_snc_internal_role: asField("false"),
      operation_script: asCdataField(healthResource),
      script: asCdataField(healthResource),
      web_service_definition: asField(wsDefinitionSysId, { display_value: COMPANION_SCOPE }),
      ...sharedScopedFields,
    },
  });

  const aclOperationPayload = buildRecordUpdatePayload({
    table: "sys_ws_operation",
    fields: {
      sys_id: asField(aclOperationSysId),
      name: asField(String(aclDefinition.name || "acl_evaluate")),
      http_method: asField(String(aclDefinition.http_method || "POST").toUpperCase()),
      relative_path: asField(String(aclDefinition.relative_path || "/acl/evaluate")),
      active: asField("true"),
      requires_authentication: asField("true"),
      requires_acl_authorization: asField("true"),
      requires_snc_internal_role: asField("false"),
      operation_script: asCdataField(aclResource),
      script: asCdataField(aclResource),
      web_service_definition: asField(wsDefinitionSysId, { display_value: COMPANION_SCOPE }),
      ...sharedScopedFields,
    },
  });

  const childUpdates = [
    buildSysUpdateXmlEntry({
      sourceTable: "sys_user_role",
      targetName: roleDefinition.name,
      type: "User Role",
      payload: rolePayload,
      remoteUpdateSetSysId,
      remoteUpdateSetName,
      seed: "role",
    }),
    buildSysUpdateXmlEntry({
      sourceTable: "sys_script_include",
      targetName: VERSION_INCLUDE_NAME,
      type: "Script Include",
      payload: versionIncludePayload,
      remoteUpdateSetSysId,
      remoteUpdateSetName,
      seed: "version_include",
    }),
    buildSysUpdateXmlEntry({
      sourceTable: "sys_script_include",
      targetName: ACL_INCLUDE_NAME,
      type: "Script Include",
      payload: aclIncludePayload,
      remoteUpdateSetSysId,
      remoteUpdateSetName,
      seed: "acl_include",
    }),
    buildSysUpdateXmlEntry({
      sourceTable: "sys_ws_definition",
      targetName: restDefinition.name,
      type: "Scripted REST API",
      payload: wsDefinitionPayload,
      remoteUpdateSetSysId,
      remoteUpdateSetName,
      seed: "ws_definition",
    }),
    buildSysUpdateXmlEntry({
      sourceTable: "sys_ws_operation",
      targetName: String(healthDefinition.name || "health"),
      type: "Scripted REST Resource",
      payload: healthOperationPayload,
      remoteUpdateSetSysId,
      remoteUpdateSetName,
      seed: "health_operation",
    }),
    buildSysUpdateXmlEntry({
      sourceTable: "sys_ws_operation",
      targetName: String(aclDefinition.name || "acl_evaluate"),
      type: "Scripted REST Resource",
      payload: aclOperationPayload,
      remoteUpdateSetSysId,
      remoteUpdateSetName,
      seed: "acl_operation",
    }),
  ].join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<unload unload_date="${xmlEscape(generatedOn)}" version="Zurich">
  <sys_remote_update_set action="INSERT_OR_UPDATE">
    <sys_id>${xmlEscape(remoteUpdateSetSysId)}</sys_id>
    <name>${xmlEscape(remoteUpdateSetName)}</name>
    <description>Companion baseline for health/version + ACL evaluate endpoints (scope-enforced).</description>
    <application display_value="${xmlEscape(COMPANION_SCOPE)}">${xmlEscape(scopeSysId)}</application>
    <sys_scope display_value="${xmlEscape(COMPANION_SCOPE)}">${xmlEscape(scopeSysId)}</sys_scope>
    <state>loaded</state>
  </sys_remote_update_set>

${childUpdates}
</unload>
`;
}

function main() {
  const outPath = path.resolve(process.cwd(), "companion-app/update-set.xml");
  const xml = buildUpdateSetXml();
  fs.writeFileSync(outPath, xml, "utf8");
  console.log(`✅ Companion Update Set XML generated: ${outPath}`);
}

main();
