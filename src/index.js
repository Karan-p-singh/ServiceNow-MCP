import { loadConfig } from "./config.js";
import { HttpSseTransport } from "./server/http-sse.js";
import { MCPServer } from "./server/mcp.js";
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
      const details = await client.getInstanceInfo({
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
          edition: context.config.edition,
          tier_max: context.config.tierMax,
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
  const isSmokeMode = process.argv.includes("--smoke");
  const config = loadConfig();
  const smokeLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
  const runtimeLogger = isSmokeMode ? smokeLogger : console;
  const serviceNow = new ServiceNowClient({ config, logger: runtimeLogger });
  const server = new MCPServer({
    config,
    logger: runtimeLogger,
    services: {
      serviceNow,
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
    };

    console.log(JSON.stringify({
      tools: server.listTools(),
      smoke_summary: smokeSummary,
      smoke_result: result,
      table_list_result: paged,
      script_get_result: scriptGetResult,
      script_list_result: scriptListResult,
      script_search_result: scriptSearchResult,
      script_refs_result: scriptRefsResult,
      script_deps_result: scriptDepsResult,
      script_create_blocked_result: scriptCreateBlocked,
      script_create_allowed_result: scriptCreateAllowed,
      tier_blocked_result: tierBlocked,
      script_update_allowed_result: scriptUpdateAllowed,
      t3_blocked_result: t3Blocked,
      policy_blocked_result: policyBlocked,
      break_glass_result: breakGlassAllowed,
    }, null, 2));
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
