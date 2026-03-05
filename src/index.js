import { loadConfig } from "./config.js";
import { AuditWebhookSink } from "./server/audit-webhook.js";
import { HttpSseTransport } from "./server/http-sse.js";
import { getToolingPolicySummary } from "./server/tool-bundles.js";
import { MCPServer } from "./server/mcp.js";
import { CompanionClient } from "./servicenow/companion-client.js";
import { ServiceNowClient } from "./servicenow/client.js";
import {
  evaluateBusinessRuleValidation,
  evaluateCatalogPolicyValidation,
  evaluateClientScriptValidation,
  evaluateFixValidation,
  evaluateFlowValidation,
  evaluateScriptValidation,
  evaluateUiScriptValidation,
  evaluateWorkflowValidation,
  evaluateWriteGate,
} from "./validation/engine.js";

function extractScriptRecord(result) {
  return result?.script || null;
}

function buildScriptEvidence(scriptBody = "") {
  const source = String(scriptBody || "");
  const refs = [];

  const glideRecordRegex = /new\s+GlideRecord\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match = glideRecordRegex.exec(source);
  while (match) {
    refs.push({
      type: "hard",
      confidence: "high",
      target_type: "table",
      target: match[1],
      evidence: [{ type: "snippet", value: match[0] }],
    });
    match = glideRecordRegex.exec(source);
  }

  const includesRegex = /([a-zA-Z0-9_]+)\s*\.prototype/g;
  match = includesRegex.exec(source);
  while (match) {
    refs.push({
      type: "soft",
      confidence: "medium",
      target_type: "script_include",
      target: match[1],
      evidence: [{ type: "snippet", value: match[0] }],
    });
    match = includesRegex.exec(source);
  }

  return refs;
}

function buildSingleRecordQuery({ sysId, name, query } = {}) {
  if (sysId) {
    return `sys_id=${sysId}`;
  }
  if (name) {
    return `name=${name}`;
  }
  return String(query || "").trim();
}

async function fetchSingleTableRecord({ client, table, input }) {
  const effectiveQuery = buildSingleRecordQuery({
    sysId: input?.sys_id,
    name: input?.name,
    query: input?.query,
  });
  const page = await client.listTable({
    table,
    limit: 1,
    offset: 0,
    query: effectiveQuery,
    instanceKey: input?.instance_key,
  });
  const record = page?.records?.[0] || null;
  return {
    found: Boolean(record),
    record,
    query: {
      table,
      sys_id: input?.sys_id || null,
      name: input?.name || null,
      sysparm_query: effectiveQuery,
    },
  };
}

function redactConfigForTool(value) {
  const sensitiveKeys = ["password", "secret", "token", "authorization", "clientsecret"];
  if (Array.isArray(value)) {
    return value.map((entry) => redactConfigForTool(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const copy = {};
  for (const [key, entry] of Object.entries(value)) {
    const isSensitive = sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive));
    copy[key] = isSensitive ? "[REDACTED]" : redactConfigForTool(entry);
  }
  return copy;
}

function evaluatePolicyPreview({ input, config }) {
  const resolvedScope =
    typeof input?.scope === "string" && input.scope.trim()
      ? input.scope.trim()
      : typeof input?.target_scope === "string" && input.target_scope.trim()
        ? input.target_scope.trim()
        : typeof input?.artifact_scope === "string" && input.artifact_scope.trim()
          ? input.artifact_scope.trim()
          : "";
  const scope = resolvedScope || null;
  const toolTier = String(input?.tool_tier || "T0").toUpperCase();
  const tierOrder = { T0: 0, T1: 1, T2: 2, T3: 3 };
  const tierMax = String(config?.tierMax || "T0").toUpperCase();
  const allowlisted = (config?.exceptionAllowlist || []).includes(String(input?.tool_name || ""));
  const writeLike = toolTier !== "T0";

  const checks = [];

  if (writeLike) {
    const tierAllowed = (tierOrder[toolTier] ?? 0) <= (tierOrder[tierMax] ?? 0);
    checks.push({ check: "tier_max", passed: tierAllowed, details: { tool_tier: toolTier, tier_max: tierMax } });

    if (config?.requireScopeForWrites) {
      checks.push({
        check: "scope_required_for_writes",
        passed: Boolean(scope) || allowlisted,
        details: {
          scope,
          exception_allowlisted: allowlisted,
        },
      });
    }

    if (Array.isArray(config?.allowedScopes) && config.allowedScopes.length > 0) {
      checks.push({
        check: "allowed_scopes",
        passed: config.allowedScopes.includes(scope) || allowlisted,
        details: { scope, allowed_scopes: config.allowedScopes, exception_allowlisted: allowlisted },
      });
    }

    if (config?.denyGlobalWrites) {
      checks.push({
        check: "deny_global_writes",
        passed: scope !== "global" || allowlisted,
        details: { scope, exception_allowlisted: allowlisted },
      });
    }

    if (config?.enforceChangesetScope && config?.changesetScope) {
      checks.push({
        check: "enforce_changeset_scope",
        passed: scope === config.changesetScope || allowlisted,
        details: {
          scope,
          changeset_scope: config.changesetScope,
          exception_allowlisted: allowlisted,
        },
      });
    }
  }

  return {
    evaluated: true,
    write_like: writeLike,
    checks,
    allowed: checks.every((entry) => entry.passed !== false),
  };
}

async function buildDiscoveryAclTrace({ client, input, degradedReasonCode }) {
  const table = String(input?.table || "task").trim() || "task";
  const operation = String(input?.operation || "read").trim().toLowerCase() || "read";
  const field = input?.field ? String(input.field) : "*";
  const user = input?.user ? String(input.user) : null;

  const aclQuery = `nameLIKE${table}^operation=${operation}`;
  const aclPage = await client.listTable({
    table: "sys_security_acl",
    limit: 25,
    offset: 0,
    query: aclQuery,
    instanceKey: input?.instance_key,
  });

  const rolePage = await client.listTable({
    table: "sys_user_has_role",
    limit: 25,
    offset: 0,
    query: user ? `user=${user}` : "",
    instanceKey: input?.instance_key,
  });

  const matchedAcls = (aclPage.records || []).map((record) => ({
    sys_id: record?.sys_id || null,
    name: record?.name || null,
    operation: record?.operation || null,
    type: record?.type || null,
    active: record?.active || null,
  }));

  const resolvedRoles = (rolePage.records || []).map((record) =>
    record?.role?.display_value || record?.role?.value || record?.role || null,
  ).filter(Boolean);

  return {
    mode: "discovery",
    decision: matchedAcls.length > 0 ? "indeterminate" : "indeterminate",
    confidence: matchedAcls.length > 0 ? "medium" : "low",
    degraded_reason_code: degradedReasonCode,
    limitations: [
      "Discovery mode is best-effort and cannot execute scripted ACL runtime context.",
      "Domain separation, impersonation, and runtime script conditions are not fully evaluated externally.",
    ],
    evidence: {
      table,
      operation,
      field,
      user,
      acl_matches: matchedAcls,
      user_roles: resolvedRoles,
    },
    reasoning_summary:
      "Companion authoritative evaluation unavailable; returning discovery-only ACL evidence with explicit limitations.",
  };
}

function registerBaselineTools(server) {
  server.registerTool({
    name: "sn.health.check",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const probe = await client.getInstanceInfo({ instanceKey: input?.instance_key });
      return {
        data: {
          status: "ok",
          transport: context.config.transport,
          endpoint_path: context.config.server?.path || "/mcp",
          instance: probe?.instance || null,
          connectivity: probe?.connectivity || null,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.config.get",
    tier: "T0",
    handler: async (_, context) => {
      return {
        data: {
          config: redactConfigForTool(context.config || {}),
        },
      };
    },
  });

  server.registerTool({
    name: "sn.policy.test",
    tier: "T0",
    handler: async (input, context) => {
      return {
        data: {
          tool_name: input?.tool_name || null,
          tool_tier: input?.tool_tier || "T0",
          scope:
            input?.scope ||
            input?.target_scope ||
            input?.artifact_scope ||
            null,
          policy_preview: evaluatePolicyPreview({ input, config: context.config }),
        },
      };
    },
  });

  server.registerTool({
    name: "sn.preflight.write",
    tier: "T0",
    description: "Runs deterministic preflight policy checks for a candidate write tool call.",
    inputSchema: {
      type: "object",
      properties: {
        tool_name: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["tool_name"],
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const toolName = String(input?.tool_name || "").trim();
      if (!toolName) {
        return {
          data: null,
          errors: [
            {
              code: "TARGET_REQUIRED",
              message: "tool_name is required",
            },
          ],
        };
      }

      const preview = context?.services?.mcpServer?.preflight?.(
        toolName,
        input?.arguments && typeof input.arguments === "object" ? input.arguments : {},
      );
      return {
        data: preview,
      };
    },
  });

  server.registerTool({
    name: "sn.audit.ping",
    tier: "T0",
    handler: async (input, context) => {
      const dryRun = input?.dry_run !== false;
      const sink = context.services?.auditWebhook;
      if (dryRun) {
        return {
          data: {
            dry_run: true,
            webhook_enabled: Boolean(sink?.isEnabled?.()),
          },
        };
      }

      const result = await sink.send({
        event_type: "mcp.audit.ping",
        stage: "diagnostic_ping",
        tier: "T0",
        write_operation: false,
        validation_summary: {
          findings_count_by_severity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
          blocked: false,
        },
      });

      return {
        data: {
          dry_run: false,
          webhook_enabled: Boolean(sink?.isEnabled?.()),
          send_result: result,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.script.get",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getScriptInclude({
        sysId: input?.sys_id,
        name: input?.name,
        instanceKey: input?.instance_key,
      });

      const script = extractScriptRecord(result);
      const validation = evaluateScriptValidation({
        script: script?.script || "",
        record: script || {},
      });

      return {
        data: {
          found: result.found,
          query: result.query,
          artifact_type: "sys_script_include",
          record: script,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.script.list",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const limit = Math.min(100, Math.max(1, Number(input?.limit || 25)));
      const offset = Math.max(0, Number(input?.offset || 0));
      const query = String(input?.query || "");

      const page = await client.listScriptIncludes({
        limit,
        offset,
        query,
        instanceKey: input?.instance_key,
      });

      const validationSummaries = page.records.map((record) => {
        const validation = evaluateScriptValidation({
          script: record?.script || "",
          record,
        });
        return {
          sys_id: record?.sys_id || null,
          name: record?.name || null,
          validation_summary: validation.summary,
        };
      });

      return {
        data: {
          records: page.records,
          page: page.page,
          query,
          validation_summaries: validationSummaries,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.script.search",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const limit = Math.min(100, Math.max(1, Number(input?.limit || 25)));
      const offset = Math.max(0, Number(input?.offset || 0));
      const term = String(input?.term || input?.query || "").trim();

      const page = await client.searchScriptIncludes({
        term,
        limit,
        offset,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          term,
          records: page.records,
          page: page.page,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.script.refs",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getScriptInclude({
        sysId: input?.sys_id,
        name: input?.name,
        instanceKey: input?.instance_key,
      });

      const script = extractScriptRecord(result);
      const references = buildScriptEvidence(script?.script || "");

      return {
        data: {
          found: Boolean(script),
          script_identity: {
            sys_id: script?.sys_id || null,
            name: script?.name || null,
          },
          references,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.script.deps",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getScriptInclude({
        sysId: input?.sys_id,
        name: input?.name,
        instanceKey: input?.instance_key,
      });

      const script = extractScriptRecord(result);
      const dependencies = buildScriptEvidence(script?.script || "").map((entry) => ({
        ...entry,
        dependency_kind: entry.target_type,
      }));

      return {
        data: {
          found: Boolean(script),
          script_identity: {
            sys_id: script?.sys_id || null,
            name: script?.name || null,
          },
          dependencies,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.instance.info",
    tier: "T0",
    description: "Gets normalized instance connectivity, capability, and tooling policy metadata.",
    inputSchema: {
      type: "object",
      properties: {
        instance_key: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const companionClient = context.services?.companion;
      const details = await client.getInstanceInfo({
        instanceKey: input?.instance_key,
      });
      const companion = await companionClient.getStatus({
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          instance: details.instance,
          auth: {
            mode: details.auth.mode,
            credentials_configured: details.auth.credentials_configured,
          },
          connectivity: details.connectivity,
          capabilities: details.capabilities,
          companion,
          tooling: getToolingPolicySummary(context.config),
          edition: context.config.edition,
          tier_max: context.config.tierMax,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.instance.capabilities.get",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const details = await client.getInstanceInfo({
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          instance: details.instance,
          capabilities: details.capabilities,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.instance.plugins.list",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const limit = Math.min(200, Math.max(1, Number(input?.limit || 50)));
      const offset = Math.max(0, Number(input?.offset || 0));
      const page = await client.listInstancePlugins({
        limit,
        offset,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          source_table: page.table,
          records: page.records,
          page: page.page,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.acl.trace",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const companionClient = context.services?.companion;

      const companionStatus = await companionClient.getStatus({
        instanceKey: input?.instance_key,
      });

      if (companionStatus.ready && companionStatus.compatible) {
        const authoritative = await companionClient.evaluateAcl({
          instanceKey: input?.instance_key,
          input,
        });

        return {
          data: {
            ...authoritative,
            companion: {
              enabled: companionStatus.enabled,
              mode: companionStatus.mode || "none",
              status: companionStatus.status,
              version: companionStatus.version,
              min_version: companionStatus.min_version,
              degraded_reason_code: companionStatus.degraded_reason_code || null,
            },
          },
        };
      }

      const degradedReasonCode = companionStatus?.degraded_reason_code || "COMPANION_UNREACHABLE";
      const discovery = await buildDiscoveryAclTrace({
        client,
        input,
        degradedReasonCode,
      });

      return {
        data: {
          ...discovery,
          companion: {
            enabled: companionStatus.enabled,
            mode: companionStatus.mode || "none",
            status: companionStatus.status,
            version: companionStatus.version,
            min_version: companionStatus.min_version,
            degraded_reason_code: companionStatus.degraded_reason_code || degradedReasonCode,
          },
        },
      };
    },
  });

  server.registerTool({
    name: "sn.table.list",
    tier: "T0",
    description: "Lists table records with paging controls.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        query: { type: "string" },
        instance_key: { type: "string" },
      },
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.listTable({
        table: input?.table || "sys_plugins",
        limit: Number(input?.limit || 25),
        offset: Number(input?.offset || 0),
        query: input?.query || "",
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          table: input?.table || "sys_plugins",
          records: result.records,
          page: result.page,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.table.get",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const table = String(input?.table || "").trim();
      const result = await client.getTableRecord({
        table,
        sysId: input?.sys_id,
        query: input?.query || "",
        instanceKey: input?.instance_key,
      });

      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.table.count",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.countTable({
        table: String(input?.table || "").trim(),
        query: String(input?.query || ""),
        instanceKey: input?.instance_key,
      });

      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.history",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const script = await client.getScriptInclude({
        sysId: input?.sys_id,
        name: input?.name,
        instanceKey: input?.instance_key,
      });
      const scriptSysId = script?.script?.sys_id || input?.sys_id;
      const history = await client.listScriptIncludeHistory({
        sysId: scriptSysId,
        limit: Math.min(100, Math.max(1, Number(input?.limit || 20))),
        offset: Math.max(0, Number(input?.offset || 0)),
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          found: Boolean(script?.script),
          script_identity: {
            sys_id: script?.script?.sys_id || null,
            name: script?.script?.name || input?.name || null,
          },
          history: history.records,
          page: history.page,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.script.diff",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const script = await client.getScriptInclude({
        sysId: input?.sys_id,
        name: input?.name,
        instanceKey: input?.instance_key,
      });
      const scriptSysId = script?.script?.sys_id || input?.sys_id;
      const diff = await client.diffScriptInclude({
        sysId: scriptSysId,
        baseVersion: input?.base_version,
        targetVersion: input?.target_version,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          found: Boolean(script?.script),
          script_identity: {
            sys_id: script?.script?.sys_id || null,
            name: script?.script?.name || input?.name || null,
          },
          diff,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.list",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const limit = Math.min(100, Math.max(1, Number(input?.limit || 25)));
      const offset = Math.max(0, Number(input?.offset || 0));
      const query = String(input?.query || "");

      const page = await client.listChangesets({
        limit,
        offset,
        query,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          records: page.records,
          page: page.page,
          query,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.get",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getChangeset({
        sysId: input?.sys_id,
        name: input?.name,
        query: input?.query,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          found: result.found,
          query: result.query,
          record: result.record,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.contents",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const limit = Math.min(200, Math.max(1, Number(input?.limit || 50)));
      const offset = Math.max(0, Number(input?.offset || 0));
      const query = String(input?.query || "");

      const page = await client.listChangesetContents({
        changesetSysId: input?.changeset_sys_id || input?.sys_id,
        limit,
        offset,
        query,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          changeset_sys_id: input?.changeset_sys_id || input?.sys_id || null,
          records: page.records,
          page: page.page,
          query,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.export",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.exportChangeset({
        sysId: input?.sys_id,
        format: input?.format || "xml",
        instanceKey: input?.instance_key,
      });

      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.gaps",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const limit = Math.min(500, Math.max(1, Number(input?.limit || 200)));
      const offset = Math.max(0, Number(input?.offset || 0));

      const result = await client.detectChangesetGaps({
        changesetSysId: input?.changeset_sys_id || input?.sys_id,
        limit,
        offset,
        instanceKey: input?.instance_key,
      });

      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.updateset.capture.verify",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.verifyChangesetCapture({
        table: input?.table,
        sysId: input?.sys_id,
        changesetSysId: input?.changeset_sys_id || input?.changeset,
        instanceKey: input?.instance_key,
      });

      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.commit.preview",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.previewChangesetCommit({
        changesetSysId: input?.changeset_sys_id || input?.sys_id,
        includeConflicts: input?.include_conflicts !== false,
        instanceKey: input?.instance_key,
      });

      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.flow.list",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const limit = Math.min(100, Math.max(1, Number(input?.limit || 25)));
      const offset = Math.max(0, Number(input?.offset || 0));
      const query = String(input?.query || "");

      const page = await client.listFlows({
        limit,
        offset,
        query,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          records: page.records,
          page: page.page,
          query,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.flow.get",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getFlow({
        sysId: input?.sys_id,
        name: input?.name,
        query: input?.query,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          found: result.found,
          query: result.query,
          record: result.record,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.flow.validate",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getFlow({
        sysId: input?.sys_id,
        name: input?.name,
        query: input?.query,
        instanceKey: input?.instance_key,
      });
      const flowRecord = result?.record || {};
      const validation = evaluateFlowValidation({
        flow: flowRecord,
        record: flowRecord,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "sys_hub_flow",
          query: result.query,
          record: flowRecord,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.workflow.list",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const limit = Math.min(100, Math.max(1, Number(input?.limit || 25)));
      const offset = Math.max(0, Number(input?.offset || 0));
      const query = String(input?.query || "");

      const page = await client.listWorkflows({
        limit,
        offset,
        query,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          records: page.records,
          page: page.page,
          query,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.workflow.get",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getWorkflow({
        sysId: input?.sys_id,
        name: input?.name,
        query: input?.query,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          found: result.found,
          query: result.query,
          record: result.record,
        },
      };
    },
  });

  server.registerTool({
    name: "sn.workflow.validate",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getWorkflow({
        sysId: input?.sys_id,
        name: input?.name,
        query: input?.query,
        instanceKey: input?.instance_key,
      });
      const workflowRecord = result?.record || {};
      const validation = evaluateWorkflowValidation({
        workflow: workflowRecord,
        record: workflowRecord,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "wf_workflow",
          query: result.query,
          record: workflowRecord,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.validate.script_include",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getScriptInclude({
        sysId: input?.sys_id,
        name: input?.name,
        instanceKey: input?.instance_key,
      });
      const record = result?.script || {};
      const validation = evaluateScriptValidation({
        script: record?.script || "",
        record,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "sys_script_include",
          query: result.query,
          record,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.validate.business_rule",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await fetchSingleTableRecord({
        client,
        table: "sys_script",
        input,
      });
      const record = result?.record || {};
      const validation = evaluateBusinessRuleValidation({
        businessRule: record,
        record,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "sys_script",
          query: result.query,
          record,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.validate.client_script",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await fetchSingleTableRecord({
        client,
        table: "sys_script_client",
        input,
      });
      const record = result?.record || {};
      const validation = evaluateClientScriptValidation({
        clientScript: record,
        record,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "sys_script_client",
          query: result.query,
          record,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.validate.ui_script",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await fetchSingleTableRecord({
        client,
        table: "sys_ui_script",
        input,
      });
      const record = result?.record || {};
      const validation = evaluateUiScriptValidation({
        uiScript: record,
        record,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "sys_ui_script",
          query: result.query,
          record,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.validate.flow",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getFlow({
        sysId: input?.sys_id,
        name: input?.name,
        query: input?.query,
        instanceKey: input?.instance_key,
      });
      const flowRecord = result?.record || {};
      const validation = evaluateFlowValidation({
        flow: flowRecord,
        record: flowRecord,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "sys_hub_flow",
          query: result.query,
          record: flowRecord,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.validate.workflow",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.getWorkflow({
        sysId: input?.sys_id,
        name: input?.name,
        query: input?.query,
        instanceKey: input?.instance_key,
      });
      const workflowRecord = result?.record || {};
      const validation = evaluateWorkflowValidation({
        workflow: workflowRecord,
        record: workflowRecord,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "wf_workflow",
          query: result.query,
          record: workflowRecord,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.validate.catalog_policy",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const table = String(input?.table || "catalog_ui_policy");
      const result = await fetchSingleTableRecord({
        client,
        table,
        input,
      });
      const record = result?.record || {};
      const validation = evaluateCatalogPolicyValidation({
        catalogPolicy: record,
        record,
      });

      return {
        data: {
          found: result.found,
          artifact_type: table,
          query: result.query,
          record,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.validate.fix",
    tier: "T1",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await fetchSingleTableRecord({
        client,
        table: "sys_script_fix",
        input,
      });
      const record = result?.record || {};
      const validation = evaluateFixValidation({
        fixScript: record,
        record,
      });

      return {
        data: {
          found: result.found,
          artifact_type: "sys_script_fix",
          query: result.query,
          record,
          findings: validation.findings,
        },
        validation_summary: validation.summary,
      };
    },
  });

  server.registerTool({
    name: "sn.script.update",
    tier: "T2",
    description: "Updates a Script Include with validation gating and auditable metadata.",
    inputSchema: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        name: { type: "string" },
        script: { type: "string" },
        description: { type: "string" },
        scope: { type: "string" },
        target_scope: { type: "string" },
        artifact_scope: { type: "string" },
        acknowledged_findings: { type: "array", items: { type: "string" } },
        break_glass: { type: "boolean" },
        break_glass_reason: { type: "string" },
        reason: { type: "string" },
        instance_key: { type: "string" },
        response_mode: { type: "string", enum: ["compact", "full"] },
      },
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const current = await client.getScriptInclude({
        sysId: input?.sys_id,
        name: input?.name,
        instanceKey: input?.instance_key,
      });
      const beforeRecord = extractScriptRecord(current) || {};

      const nextScript = input?.script !== undefined ? String(input?.script || "") : String(beforeRecord?.script || "");
      const nextRecord = {
        ...beforeRecord,
        ...input,
        script: nextScript,
      };

      const validation = evaluateScriptValidation({
        script: nextScript,
        record: nextRecord,
      });
      const gate = evaluateWriteGate({
        findings: validation.findings,
        acknowledgedFindings: input?.acknowledged_findings,
      });

      if (gate.blocked) {
        return {
          data: {
            updated: false,
            blocked: true,
            gate,
            required_acknowledgments: gate.missing_acknowledgments,
          },
          validation_summary: {
            ...validation.summary,
            blocked: true,
          },
          errors: [
            {
              code: gate.code,
              message: gate.message,
              details: {
                missing_acknowledgments: gate.missing_acknowledgments,
              },
            },
          ],
        };
      }

      const changes = {
        script: nextScript,
      };
      if (input?.description !== undefined) {
        changes.description = input.description;
      }
      if (input?.name !== undefined) {
        changes.name = input.name;
      }

      const updateResult = await client.updateScriptInclude({
        sysId: input?.sys_id || beforeRecord?.sys_id,
        changes,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          updated: updateResult.updated,
          table: "sys_script_include",
          sys_id: updateResult?.record?.sys_id || input?.sys_id || null,
          scope:
            input?.scope ||
            updateResult?.record?.sys_scope?.value ||
            updateResult?.record?.sys_scope?.display_value ||
            "global",
          actor: "mcp",
          audit: {
            action: "update",
            before: {
              sys_id: beforeRecord?.sys_id || null,
              name: beforeRecord?.name || null,
              sys_updated_on: beforeRecord?.sys_updated_on || null,
            },
            after: {
              sys_id: updateResult?.record?.sys_id || null,
              name: updateResult?.record?.name || null,
              sys_updated_on: updateResult?.record?.sys_updated_on || null,
            },
          },
        },
        validation_summary: validation.summary,
        errors: [],
      };
    },
  });

  server.registerTool({
    name: "sn.script.create",
    tier: "T2",
    description: "Creates a Script Include with validation gating and auditable metadata.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        api_name: { type: "string" },
        script: { type: "string" },
        description: { type: "string" },
        active: { type: "boolean" },
        scope: { type: "string" },
        target_scope: { type: "string" },
        artifact_scope: { type: "string" },
        acknowledged_findings: { type: "array", items: { type: "string" } },
        break_glass: { type: "boolean" },
        break_glass_reason: { type: "string" },
        reason: { type: "string" },
        instance_key: { type: "string" },
        response_mode: { type: "string", enum: ["compact", "full"] },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const recordInput = {
        name: input?.name,
        api_name: input?.api_name || input?.name,
        script: String(input?.script || ""),
        description: input?.description || "",
        active: String(input?.active ?? "true"),
        sys_scope: input?.sys_scope,
        scope: input?.scope,
      };

      const validation = evaluateScriptValidation({
        script: recordInput.script,
        record: recordInput,
      });
      const gate = evaluateWriteGate({
        findings: validation.findings,
        acknowledgedFindings: input?.acknowledged_findings,
      });

      if (gate.blocked) {
        return {
          data: {
            created: false,
            blocked: true,
            gate,
            required_acknowledgments: gate.missing_acknowledgments,
          },
          validation_summary: {
            ...validation.summary,
            blocked: true,
          },
          errors: [
            {
              code: gate.code,
              message: gate.message,
              details: {
                missing_acknowledgments: gate.missing_acknowledgments,
              },
            },
          ],
        };
      }

      const created = await client.createScriptInclude({
        record: recordInput,
        instanceKey: input?.instance_key,
      });

      return {
        data: {
          created: created.created,
          table: "sys_script_include",
          sys_id: created?.record?.sys_id || null,
          scope:
            input?.scope ||
            created?.record?.sys_scope?.value ||
            created?.record?.sys_scope?.display_value ||
            "global",
          actor: "mcp",
          audit: {
            action: "create",
            before: null,
            after: {
              sys_id: created?.record?.sys_id || null,
              name: created?.record?.name || null,
              sys_updated_on: created?.record?.sys_updated_on || null,
            },
          },
        },
        validation_summary: validation.summary,
        errors: [],
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.commit",
    tier: "T3",
    description: "Commits an update set under T3 confirmation and reason controls.",
    inputSchema: {
      type: "object",
      properties: {
        changeset_sys_id: { type: "string" },
        sys_id: { type: "string" },
        confirm: { type: "boolean" },
        reason: { type: "string" },
        scope: { type: "string" },
        target_scope: { type: "string" },
        artifact_scope: { type: "string" },
        break_glass: { type: "boolean" },
        break_glass_reason: { type: "string" },
        instance_key: { type: "string" },
        response_mode: { type: "string", enum: ["compact", "full"] },
      },
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const resolvedChangesetSysId = input?.changeset_sys_id || input?.sys_id;

      const result = await client.commitChangesetControlled({
        changesetSysId: resolvedChangesetSysId,
        reason: input?.reason,
        confirm: input?.confirm === true,
        instanceKey: input?.instance_key,
      });

      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.rollback.plan.generate",
    tier: "T0",
    handler: async (input, context) => {
      const client = context.services?.serviceNow;
      const result = await client.generateRollbackPlan({
        changesetSysId: input?.changeset_sys_id || input?.sys_id,
        instanceKey: input?.instance_key,
      });

      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.tool.catalog",
    tier: "T0",
    description: "Executes the sn.tool.catalog operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.toolCatalog({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.tool.describe",
    tier: "T0",
    description: "Executes the sn.tool.describe operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.toolDescribe({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.table.schema.get",
    tier: "T0",
    description: "Executes the sn.table.schema.get operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.tableSchemaGet({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.table.dictionary.list",
    tier: "T0",
    description: "Executes the sn.table.dictionary.list operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.tableDictionaryList({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.user.role.check",
    tier: "T0",
    description: "Executes the sn.user.role.check operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.userRoleCheck({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.scope.inspect",
    tier: "T0",
    description: "Executes the sn.scope.inspect operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scopeInspect({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.scope.guard.check",
    tier: "T0",
    description: "Executes the sn.scope.guard.check operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scopeGuardCheck({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.dependency.graph.get",
    tier: "T0",
    description: "Executes the sn.dependency.graph.get operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.dependencyGraphGet({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.release.compatibility.check",
    tier: "T0",
    description: "Executes the sn.release.compatibility.check operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.releaseCompatibilityCheck({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.logs.tail",
    tier: "T1",
    description: "Executes the sn.logs.tail operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.logsTail({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.compare",
    tier: "T0",
    description: "Executes the sn.script.compare operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptCompare({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.delete",
    tier: "T3",
    description: "Executes the sn.script.delete operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptDelete({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.clone",
    tier: "T2",
    description: "Executes the sn.script.clone operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptClone({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.lint",
    tier: "T0",
    description: "Executes the sn.script.lint operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptLint({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.test.stub.generate",
    tier: "T1",
    description: "Executes the sn.script.test.stub.generate operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptTestStubGenerate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.bulk.search",
    tier: "T0",
    description: "Executes the sn.script.bulk.search operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptBulkSearch({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.bulk.validate",
    tier: "T0",
    description: "Executes the sn.script.bulk.validate operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptBulkValidate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.refactors.preview",
    tier: "T1",
    description: "Executes the sn.script.refactors.preview operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptRefactorsPreview({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.refactors.apply",
    tier: "T2",
    description: "Executes the sn.script.refactors.apply operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptRefactorsApply({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.scope.migrate.preview",
    tier: "T1",
    description: "Executes the sn.script.scope.migrate.preview operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptScopeMigratePreview({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.scope.migrate.apply",
    tier: "T3",
    description: "Executes the sn.script.scope.migrate.apply operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptScopeMigrateApply({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.script.guardrails.explain",
    tier: "T0",
    description: "Executes the sn.script.guardrails.explain operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.scriptGuardrailsExplain({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.diff",
    tier: "T0",
    description: "Executes the sn.changeset.diff operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changesetDiff({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.validate",
    tier: "T0",
    description: "Executes the sn.changeset.validate operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changesetValidate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.dependencies.map",
    tier: "T0",
    description: "Executes the sn.changeset.dependencies.map operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changesetDependenciesMap({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.records.list",
    tier: "T0",
    description: "Executes the sn.changeset.records.list operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changesetRecordsList({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.record.get",
    tier: "T0",
    description: "Executes the sn.changeset.record.get operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changesetRecordGet({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.record.validate",
    tier: "T0",
    description: "Executes the sn.changeset.record.validate operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changesetRecordValidate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.changeset.rollback.preview",
    tier: "T1",
    description: "Executes the sn.changeset.rollback.preview operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changesetRollbackPreview({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.rollback.snapshot.create",
    tier: "T1",
    description: "Executes the sn.rollback.snapshot.create operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.rollbackSnapshotCreate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.rollback.snapshot.get",
    tier: "T0",
    description: "Executes the sn.rollback.snapshot.get operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.rollbackSnapshotGet({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.rollback.snapshot.list",
    tier: "T0",
    description: "Executes the sn.rollback.snapshot.list operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.rollbackSnapshotList({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.rollback.plan.review",
    tier: "T0",
    description: "Executes the sn.rollback.plan.review operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.rollbackPlanReview({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.rollback.execute.manualguide",
    tier: "T1",
    description: "Executes the sn.rollback.execute.manualguide operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.rollbackExecuteManualguide({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.updateset.capture.force",
    tier: "T2",
    description: "Executes the sn.updateset.capture.force operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.updatesetCaptureForce({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.updateset.capture.status",
    tier: "T0",
    description: "Executes the sn.updateset.capture.status operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.updatesetCaptureStatus({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.flow.search",
    tier: "T0",
    description: "Executes the sn.flow.search operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.flowSearch({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.flow.refs",
    tier: "T0",
    description: "Executes the sn.flow.refs operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.flowRefs({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.flow.deps",
    tier: "T0",
    description: "Executes the sn.flow.deps operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.flowDeps({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.flow.publish",
    tier: "T2",
    description: "Executes the sn.flow.publish operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.flowPublish({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.flow.activate",
    tier: "T2",
    description: "Executes the sn.flow.activate operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.flowActivate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.workflow.search",
    tier: "T0",
    description: "Executes the sn.workflow.search operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.workflowSearch({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.workflow.refs",
    tier: "T0",
    description: "Executes the sn.workflow.refs operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.workflowRefs({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.workflow.deps",
    tier: "T0",
    description: "Executes the sn.workflow.deps operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.workflowDeps({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.workflow.publish",
    tier: "T2",
    description: "Executes the sn.workflow.publish operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.workflowPublish({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.workflow.activate",
    tier: "T2",
    description: "Executes the sn.workflow.activate operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.workflowActivate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.atf.suite.list",
    tier: "T0",
    description: "Executes the sn.atf.suite.list operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.atfSuiteList({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.atf.suite.run",
    tier: "T2",
    description: "Executes the sn.atf.suite.run operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.atfSuiteRun({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.atf.test.get",
    tier: "T0",
    description: "Executes the sn.atf.test.get operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.atfTestGet({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.atf.coverage_signals",
    tier: "T0",
    description: "Executes the sn.atf.coverage_signals operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.atfCoverage_signals({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.quality.gate.evaluate",
    tier: "T0",
    description: "Executes the sn.quality.gate.evaluate operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.qualityGateEvaluate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.quality.report.get",
    tier: "T0",
    description: "Executes the sn.quality.report.get operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.qualityReportGet({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.incident.list",
    tier: "T0",
    description: "Executes the sn.incident.list operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.incidentList({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.incident.get",
    tier: "T0",
    description: "Executes the sn.incident.get operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.incidentGet({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.incident.create",
    tier: "T2",
    description: "Executes the sn.incident.create operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.incidentCreate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.incident.update",
    tier: "T2",
    description: "Executes the sn.incident.update operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.incidentUpdate({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.change.list",
    tier: "T0",
    description: "Executes the sn.change.list operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changeList({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });

  server.registerTool({
    name: "sn.change.get",
    tier: "T0",
    description: "Executes the sn.change.get operation in ServiceNow.",
    parameters: {
      type: "object",
      properties: {
        sys_id: { type: "string" },
        query: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        instance_key: { type: "string" }
      }
    },
    handler: async (input, ctx) => {
      const client = ctx.services?.serviceNow;
      const result = await client.changeGet({
        sysId: input?.sys_id,
        query: input?.query,
        limit: input?.limit,
        offset: input?.offset,
        instanceKey: input?.instance_key
      });
      return {
        data: result,
      };
    },
  });
}


async function main() {
  const isSmokeSummaryMode = process.argv.includes("--smoke-summary");
  const isSmokeMode = process.argv.includes("--smoke") || isSmokeSummaryMode;
  const config = loadConfig();
  if (isSmokeMode) {
    config.responseModeDefault = "full";
  }
  const smokeLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  const runtimeLogger = isSmokeMode ? smokeLogger : console;
  const serviceNow = new ServiceNowClient({ config, logger: runtimeLogger });
  const companion = new CompanionClient({ serviceNowClient: serviceNow, config });
  const auditWebhook = new AuditWebhookSink({
    config: config.auditWebhook,
    logger: runtimeLogger,
  });
  const server = new MCPServer({
    config,
    logger: runtimeLogger,
    services: {
      serviceNow,
      companion,
      auditWebhook,
    },
  });
  server.services.mcpServer = server;
  let transport = null;

  registerBaselineTools(server);
  await server.start();

  if (!isSmokeMode && config.transport === "http-sse") {
    transport = new HttpSseTransport({ mcpServer: server, config });
    await transport.start();
  }

  const shutdown = async () => {
    if (transport) {
      await transport.stop();
    }
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (isSmokeMode) {
    const healthCheckResult = await server.invoke("sn.health.check", {});
    const configGetResult = await server.invoke("sn.config.get", {});
    const policyTestResult = await server.invoke("sn.policy.test", {
      tool_name: "sn.script.update",
      tool_tier: "T2",
      scope: "global",
    });
    const auditPingResult = await server.invoke("sn.audit.ping", {
      dry_run: true,
    });
    const result = await server.invoke("sn.instance.info", {});
    const instanceCapabilitiesResult = await server.invoke("sn.instance.capabilities.get", {});
    const instancePluginsResult = await server.invoke("sn.instance.plugins.list", {
      limit: 2,
      offset: 0,
    });
    const paged = await server.invoke("sn.table.list", {
      table: "sys_plugins",
      limit: 2,
      offset: 0,
    });
    const tableGetResult = await server.invoke("sn.table.get", {
      table: "sys_db_object",
      query: "name=sys_script_include",
    });
    const tableCountResult = await server.invoke("sn.table.count", {
      table: "sys_script_include",
    });
    const scriptGetResult = await server.invoke("sn.script.get", {
      name: "x_demo_utility",
    });
    const scriptListResult = await server.invoke("sn.script.list", {
      limit: 2,
      offset: 0,
    });
    const scriptSearchResult = await server.invoke("sn.script.search", {
      term: "eval",
      limit: 5,
      offset: 0,
    });
    const scriptRefsResult = await server.invoke("sn.script.refs", {
      name: "x_demo_utility",
    });
    const scriptDepsResult = await server.invoke("sn.script.deps", {
      name: "x_demo_utility",
    });
    const scriptHistoryResult = await server.invoke("sn.script.history", {
      name: "x_demo_utility",
      limit: 2,
      offset: 0,
    });
    const scriptDiffResult = await server.invoke("sn.script.diff", {
      name: "x_demo_utility",
    });
    const changesetListResult = await server.invoke("sn.changeset.list", {
      limit: 2,
      offset: 0,
    });
    const changesetGetResult = await server.invoke("sn.changeset.get", {
      name: "u_demo_changeset",
    });
    const changesetContentsResult = await server.invoke("sn.changeset.contents", {
      changeset_sys_id: "a1111111b2222222c3333333d4444444",
      limit: 2,
      offset: 0,
    });
    const changesetExportResult = await server.invoke("sn.changeset.export", {
      sys_id: "a1111111b2222222c3333333d4444444",
      format: "xml",
    });
    const changesetGapsResult = await server.invoke("sn.changeset.gaps", {
      changeset_sys_id: "a1111111b2222222c3333333d4444444",
      limit: 5,
      offset: 0,
    });
    const captureVerifyResult = await server.invoke("sn.updateset.capture.verify", {
      table: "sys_script_include",
      sys_id: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
      changeset_sys_id: "a1111111b2222222c3333333d4444444",
    });
    const previewChangesetSysId =
      changesetGetResult?.data?.record?.sys_id ||
      changesetListResult?.data?.records?.[0]?.sys_id ||
      "a1111111b2222222c3333333d4444444";
    const commitPreviewResult = await server.invoke("sn.changeset.commit.preview", {
      changeset_sys_id: previewChangesetSysId,
      include_conflicts: true,
    });
    const rollbackPlanResult = await server.invoke("sn.rollback.plan.generate", {
      changeset_sys_id: previewChangesetSysId,
    });
    const controlledCommitResult = await server.invoke("sn.changeset.commit", {
      changeset_sys_id: previewChangesetSysId,
      confirm: true,
      reason: "Gate G5 controlled commit contract validation",
    });
    const flowListResult = await server.invoke("sn.flow.list", {
      limit: 2,
      offset: 0,
    });
    const flowGetResult = await server.invoke("sn.flow.get", {
      name: "x_demo_incident_flow",
    });
    const flowValidateResult = await server.invoke("sn.flow.validate", {
      name: "x_demo_scheduled_flow",
    });
    const workflowListResult = await server.invoke("sn.workflow.list", {
      limit: 2,
      offset: 0,
    });
    const workflowGetResult = await server.invoke("sn.workflow.get", {
      name: "x_demo_workflow",
    });
    const workflowValidateResult = await server.invoke("sn.workflow.validate", {
      name: "x_demo_wait_workflow",
    });
    const validateScriptIncludeResult = await server.invoke("sn.validate.script_include", {
      name: "x_demo_utility",
    });
    const validateBusinessRuleResult = await server.invoke("sn.validate.business_rule", {
      name: "x_demo_business_rule",
    });
    const validateClientScriptResult = await server.invoke("sn.validate.client_script", {
      name: "x_demo_client_script",
    });
    const validateUiScriptResult = await server.invoke("sn.validate.ui_script", {
      name: "x_demo_ui_script",
    });
    const validateFlowResult = await server.invoke("sn.validate.flow", {
      name: "x_demo_scheduled_flow",
    });
    const validateWorkflowResult = await server.invoke("sn.validate.workflow", {
      name: "x_demo_wait_workflow",
    });
    const validateCatalogPolicyResult = await server.invoke("sn.validate.catalog_policy", {
      name: "x_demo_catalog_policy",
    });
    const validateFixResult = await server.invoke("sn.validate.fix", {
      name: "x_demo_fix_script",
    });
    const aclTraceResult = await server.invoke("sn.acl.trace", {
      table: "incident",
      operation: "read",
      user: "mock-user",
    });
    const scriptCreateBlocked = await server.invoke("sn.script.create", {
      name: "x_demo_created_blocked",
      scope: "x_demo_scope",
      script: "function run(input) { return eval(input); }",
    });
    const scriptCreateAllowed = await server.invoke("sn.script.create", {
      name: "x_demo_created_allowed",
      scope: "x_demo_scope",
      script: "var gr = new GlideRecord('incident');\ngr.query();",
      acknowledged_findings: ["SCRIPT_GLIDERECORD_USAGE"],
    });
    const tierBlocked = await server.invoke("sn.script.update", {
      scope: "x_demo_scope",
      sys_id: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
      script: "function run(input) { return eval(input); }",
    });
    const scriptUpdateAllowed = await server.invoke("sn.script.update", {
      scope: "x_demo_scope",
      sys_id: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
      script: "var gr = new GlideRecord('incident');\ngr.query();",
      acknowledged_findings: ["SCRIPT_GLIDERECORD_USAGE"],
    });
    const t3Blocked = await server.invoke("sn.changeset.commit", {
      changeset: "u_demo_changeset",
    });
    const policyBlocked = await server.invoke("sn.script.update", {
      scope: "global",
      sys_id: "abc124",
      break_glass: false,
    });
    const breakGlassAllowed = await server.invoke("sn.script.update", {
      scope: "global",
      sys_id: "abc125",
      break_glass: true,
      break_glass_reason: "Emergency fix approved",
      reason: "Emergency fix approved",
    });

    const smokeSummary = {
      d1_runtime_deterministic: Boolean(scriptGetResult?.validation_summary?.deterministic),
      d2_rulepack_versioned: Boolean(scriptGetResult?.validation_summary?.rulepack?.version),
      d3_critical_blocks_write:
        (tierBlocked?.errors || []).some((entry) => entry.code === "VALIDATION_BLOCKED_CRITICAL") ||
        (scriptCreateBlocked?.errors || []).some((entry) => entry.code === "VALIDATION_BLOCKED_CRITICAL"),
      d3_high_ack_required_or_satisfied:
        (scriptCreateAllowed?.errors || []).length === 0 &&
        (scriptUpdateAllowed?.errors || []).length === 0,
      e1_get_list_search_available:
        scriptGetResult?.tool === "sn.script.get" &&
        scriptListResult?.tool === "sn.script.list" &&
        scriptSearchResult?.tool === "sn.script.search",
      e2_refs_deps_evidence_available:
        Array.isArray(scriptRefsResult?.data?.references) &&
        Array.isArray(scriptDepsResult?.data?.dependencies),
      r2_diagnostics_tools_available:
        healthCheckResult?.tool === "sn.health.check" &&
        configGetResult?.tool === "sn.config.get" &&
        policyTestResult?.tool === "sn.policy.test" &&
        auditPingResult?.tool === "sn.audit.ping",
      r2_instance_metadata_tools_available:
        instanceCapabilitiesResult?.tool === "sn.instance.capabilities.get" &&
        instancePluginsResult?.tool === "sn.instance.plugins.list" &&
        tableGetResult?.tool === "sn.table.get" &&
        tableCountResult?.tool === "sn.table.count",
      r2_script_parity_tools_available:
        scriptHistoryResult?.tool === "sn.script.history" &&
        scriptDiffResult?.tool === "sn.script.diff",
      e3_create_update_auditable:
        Boolean(scriptCreateAllowed?.data?.audit?.action) &&
        Boolean(scriptUpdateAllowed?.data?.audit?.action),
      f1_changeset_read_tools_available:
        changesetListResult?.tool === "sn.changeset.list" &&
        changesetGetResult?.tool === "sn.changeset.get" &&
        changesetContentsResult?.tool === "sn.changeset.contents" &&
        changesetExportResult?.tool === "sn.changeset.export",
      f2_changeset_gap_detection_available:
        changesetGapsResult?.tool === "sn.changeset.gaps" &&
        Array.isArray(changesetGapsResult?.data?.hard_dependencies) &&
        Array.isArray(changesetGapsResult?.data?.soft_dependencies) &&
        Array.isArray(changesetGapsResult?.data?.heuristic_candidates),
      f3_capture_verify_reason_codes_deterministic:
        captureVerifyResult?.tool === "sn.updateset.capture.verify" &&
        ["CAPTURED_IN_TARGET_SET", "CAPTURED_IN_DIFFERENT_SET", "NOT_CAPTURED"].includes(
          captureVerifyResult?.data?.reason_code,
        ),
      f4_commit_preview_dry_run_available:
        commitPreviewResult?.tool === "sn.changeset.commit.preview" &&
        commitPreviewResult?.data?.preview_generated === true &&
        commitPreviewResult?.data?.write_side_effects === false &&
        Array.isArray(commitPreviewResult?.data?.recommended_mitigations),
      f5_controlled_commit_contract_available:
        controlledCommitResult?.tool === "sn.changeset.commit" &&
        controlledCommitResult?.data?.commit_requested === true &&
        Boolean(controlledCommitResult?.data?.snapshot_coverage_matrix) &&
        Boolean(controlledCommitResult?.data?.high_risk_audit_trace),
      f6_rollback_plan_generator_available:
        rollbackPlanResult?.tool === "sn.rollback.plan.generate" &&
        rollbackPlanResult?.data?.generated === true &&
        Array.isArray(rollbackPlanResult?.data?.restorable) &&
        Array.isArray(rollbackPlanResult?.data?.non_restorable) &&
        rollbackPlanResult?.data?.declarations?.contains_non_restorable !== undefined,
      e4_flow_list_get_validate_available:
        flowListResult?.tool === "sn.flow.list" &&
        flowGetResult?.tool === "sn.flow.get" &&
        flowValidateResult?.tool === "sn.flow.validate" &&
        flowValidateResult?.validation_summary?.rulepack?.id === "flows-v1",
      e5_workflow_list_get_validate_available:
        workflowListResult?.tool === "sn.workflow.list" &&
        workflowGetResult?.tool === "sn.workflow.get" &&
        workflowValidateResult?.tool === "sn.workflow.validate" &&
        workflowValidateResult?.validation_summary?.rulepack?.id === "workflows-v1",
      d5_validate_family_available:
        validateScriptIncludeResult?.tool === "sn.validate.script_include" &&
        validateBusinessRuleResult?.tool === "sn.validate.business_rule" &&
        validateClientScriptResult?.tool === "sn.validate.client_script" &&
        validateUiScriptResult?.tool === "sn.validate.ui_script" &&
        validateFlowResult?.tool === "sn.validate.flow" &&
        validateWorkflowResult?.tool === "sn.validate.workflow" &&
        validateCatalogPolicyResult?.tool === "sn.validate.catalog_policy" &&
        validateFixResult?.tool === "sn.validate.fix",
    };

    const smokePayload = {
      tools: server.listTools(),
      health_check_result: healthCheckResult,
      config_get_result: configGetResult,
      policy_test_result: policyTestResult,
      audit_ping_result: auditPingResult,
      smoke_summary: smokeSummary,
      smoke_result: result,
      instance_capabilities_result: instanceCapabilitiesResult,
      instance_plugins_result: instancePluginsResult,
      table_list_result: paged,
      table_get_result: tableGetResult,
      table_count_result: tableCountResult,
      script_get_result: scriptGetResult,
      script_list_result: scriptListResult,
      script_search_result: scriptSearchResult,
      script_refs_result: scriptRefsResult,
      script_deps_result: scriptDepsResult,
      script_history_result: scriptHistoryResult,
      script_diff_result: scriptDiffResult,
      changeset_list_result: changesetListResult,
      changeset_get_result: changesetGetResult,
      changeset_contents_result: changesetContentsResult,
      changeset_export_result: changesetExportResult,
      changeset_gaps_result: changesetGapsResult,
      capture_verify_result: captureVerifyResult,
      commit_preview_result: commitPreviewResult,
      rollback_plan_result: rollbackPlanResult,
      controlled_commit_result: controlledCommitResult,
      flow_list_result: flowListResult,
      flow_get_result: flowGetResult,
      flow_validate_result: flowValidateResult,
      workflow_list_result: workflowListResult,
      workflow_get_result: workflowGetResult,
      workflow_validate_result: workflowValidateResult,
      validate_script_include_result: validateScriptIncludeResult,
      validate_business_rule_result: validateBusinessRuleResult,
      validate_client_script_result: validateClientScriptResult,
      validate_ui_script_result: validateUiScriptResult,
      validate_flow_result: validateFlowResult,
      validate_workflow_result: validateWorkflowResult,
      validate_catalog_policy_result: validateCatalogPolicyResult,
      validate_fix_result: validateFixResult,
      acl_trace_result: aclTraceResult,
      script_create_blocked_result: scriptCreateBlocked,
      script_create_allowed_result: scriptCreateAllowed,
      tier_blocked_result: tierBlocked,
      script_update_allowed_result: scriptUpdateAllowed,
      t3_blocked_result: t3Blocked,
      policy_blocked_result: policyBlocked,
      break_glass_result: breakGlassAllowed,
    };

    if (isSmokeSummaryMode) {
      console.log(JSON.stringify({
        smoke_summary: smokeSummary,
        tools_registered_count: smokePayload.tools.length,
        tools_registered: smokePayload.tools.map((entry) => entry.name),
      }, null, 2));
    } else {
      console.log(JSON.stringify(smokePayload, null, 2));
    }
    await server.stop();
    return;
  }

  runtimeLogger.info("ServiceNow MCP Server scaffold is running.");
  runtimeLogger.info(`ServiceNow target instance URL: ${config.instanceUrl}`);
  if (config.transport === "http-sse") {
    const host = config.server?.host || "localhost";
    const port = config.server?.port || 3001;
    const path = config.server?.path || "/mcp";
    runtimeLogger.info(`MCP endpoint URL: http://${host}:${port}${path}`);
    runtimeLogger.info(`MCP SSE URL: http://${host}:${port}${path}/sse`);
    runtimeLogger.info("MCP transport: http-sse (default)");
  } else {
    runtimeLogger.info("MCP transport: stdio");
    runtimeLogger.info(`MCP launch command: node ${process.argv[1]}`);
  }
  runtimeLogger.info(`Registered tools: ${server.listTools().map((t) => t.name).join(", ")}`);
}

main().catch((error) => {
  console.error("[mcp] fatal error", error);
  process.exit(1);
});
