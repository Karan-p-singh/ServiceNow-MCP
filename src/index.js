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
    console.log(JSON.stringify({
      tools: server.listTools(),
      smoke_result: result,
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
