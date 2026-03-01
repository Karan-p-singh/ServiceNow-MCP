import { loadConfig } from "./config.js";
import { MCPServer } from "./server/mcp.js";
import { ServiceNowClient } from "./servicenow/client.js";

function registerBaselineTools(server) {
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
      return {
        data: {
          updated: true,
          table: "sys_script_include",
          sys_id: input?.sys_id || "mock-sys-id",
          scope: input?.scope || "global",
          actor: "mcp",
        },
        validation_summary: {
          findings_count_by_severity: {
            CRITICAL: 0,
            HIGH: 0,
            MEDIUM: 0,
            LOW: 0,
          },
          blocked: false,
        },
        policy: {
          evaluated: true,
          allowed: true,
          decisions: [
            {
              check: "mock_write_path",
              passed: true,
              details: {
                tool: context.tool.name,
              },
            },
          ],
        },
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
  const config = loadConfig();
  const serviceNow = new ServiceNowClient({ config });
  const server = new MCPServer({
    config,
    services: {
      serviceNow,
    },
  });

  registerBaselineTools(server);
  await server.start();

  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (process.argv.includes("--smoke")) {
    const result = await server.invoke("sn.instance.info", {});
    const paged = await server.invoke("sn.table.list", {
      table: "sys_plugins",
      limit: 2,
      offset: 0,
    });
    const tierBlocked = await server.invoke("sn.script.update", {
      scope: "x_demo_scope",
      sys_id: "abc123",
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

    console.log(JSON.stringify({
      tools: server.listTools(),
      smoke_result: result,
      table_list_result: paged,
      tier_blocked_result: tierBlocked,
      t3_blocked_result: t3Blocked,
      policy_blocked_result: policyBlocked,
      break_glass_result: breakGlassAllowed,
    }, null, 2));
    await server.stop();
    return;
  }

  console.log("ServiceNow MCP Server scaffold is running.");
  console.log("Registered tools:", server.listTools().map((t) => t.name).join(", "));
}

main().catch((error) => {
  console.error("[mcp] fatal error", error);
  process.exit(1);
});
