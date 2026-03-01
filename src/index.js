import { loadConfig } from "./config.js";
import { HttpSseTransport } from "./server/http-sse.js";
import { MCPServer } from "./server/mcp.js";
import { CompanionClient } from "./servicenow/companion-client.js";
import { ServiceNowClient } from "./servicenow/client.js";
import { evaluateScriptValidation, evaluateWriteGate } from "./validation/engine.js";

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
          edition: context.config.edition,
          tier_max: context.config.tierMax,
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
    name: "sn.script.update",
    tier: "T2",
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
    handler: async (input) => {
      return {
        committed: true,
        changeset: input?.changeset || "mock-changeset",
      };
    },
  });
}

async function main() {
  const isSmokeSummaryMode = process.argv.includes("--smoke-summary");
  const isSmokeMode = process.argv.includes("--smoke") || isSmokeSummaryMode;
  const config = loadConfig();
  const smokeLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  const runtimeLogger = isSmokeMode ? smokeLogger : console;
  const serviceNow = new ServiceNowClient({ config, logger: runtimeLogger });
  const companion = new CompanionClient({ serviceNowClient: serviceNow, config });
  const server = new MCPServer({
    config,
    logger: runtimeLogger,
    services: {
      serviceNow,
      companion,
    },
  });
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
    const result = await server.invoke("sn.instance.info", {});
    const paged = await server.invoke("sn.table.list", {
      table: "sys_plugins",
      limit: 2,
      offset: 0,
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
    };

    const smokePayload = {
      tools: server.listTools(),
      smoke_summary: smokeSummary,
      smoke_result: result,
      table_list_result: paged,
      script_get_result: scriptGetResult,
      script_list_result: scriptListResult,
      script_search_result: scriptSearchResult,
      script_refs_result: scriptRefsResult,
      script_deps_result: scriptDepsResult,
      changeset_list_result: changesetListResult,
      changeset_get_result: changesetGetResult,
      changeset_contents_result: changesetContentsResult,
      changeset_export_result: changesetExportResult,
      changeset_gaps_result: changesetGapsResult,
      capture_verify_result: captureVerifyResult,
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

  console.log("ServiceNow MCP Server scaffold is running.");
  console.log(`ServiceNow target instance URL: ${config.instanceUrl}`);
  if (config.transport === "http-sse") {
    const host = config.server?.host || "localhost";
    const port = config.server?.port || 3001;
    const path = config.server?.path || "/mcp";
    console.log(`MCP endpoint URL: http://${host}:${port}${path}`);
    console.log(`MCP SSE URL: http://${host}:${port}${path}/sse`);
    console.log("MCP transport: http-sse (default)");
  } else {
    console.log("MCP transport: stdio");
    console.log(`MCP launch command: node ${process.argv[1]}`);
  }
  console.log("Registered tools:", server.listTools().map((t) => t.name).join(", "));
}

main().catch((error) => {
  console.error("[mcp] fatal error", error);
  process.exit(1);
});
