import { loadConfig } from "./config.js";
import { MCPServer } from "./server/mcp.js";

function registerBaselineTools(server) {
  server.registerTool({
    name: "sn.instance.info",
    tier: "T0",
    handler: async (_input, context) => {
      return {
        instance: context.config.instanceUrl,
        edition: context.config.edition,
        tier_max: context.config.tierMax,
        status: "ok",
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
  const server = new MCPServer({ config });

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
