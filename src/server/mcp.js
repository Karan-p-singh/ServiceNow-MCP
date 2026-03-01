import { createRequestContext } from "./request-context.js";
import { ToolRegistry } from "./tool-registry.js";

export class MCPServer {
  constructor({ config, logger = console } = {}) {
    this.config = config;
    this.logger = logger;
    this.registry = new ToolRegistry();
    this.started = false;
  }

  registerTool(tool) {
    this.registry.register(tool);
  }

  listTools() {
    return this.registry.list();
  }

  async start() {
    this.started = true;
    this.logger.info?.("[mcp] server started", {
      edition: this.config?.edition,
      tier_max: this.config?.tierMax,
      instance: this.config?.instanceUrl,
      tools_registered: this.listTools().length,
    });
  }

  async stop() {
    this.started = false;
    this.logger.info?.("[mcp] server stopped");
  }

  async invoke(toolName, input = {}) {
    if (!this.started) {
      throw new Error("MCP server is not started");
    }

    const tool = this.registry.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const requestContext = createRequestContext(input);
    const runtimeContext = {
      request: requestContext,
      config: this.config,
      tool: {
        name: tool.name,
        tier: tool.tier,
      },
    };

    this.logger.info?.("[mcp] invoke", {
      request_id: requestContext.request_id,
      correlation_id: requestContext.correlation_id,
      tool: tool.name,
      tier: tool.tier,
    });

    const data = await tool.handler(input, runtimeContext);

    return {
      request_id: requestContext.request_id,
      correlation_id: requestContext.correlation_id,
      instance: this.config?.instanceUrl,
      edition: this.config?.edition,
      tool: tool.name,
      tier: tool.tier,
      data,
      errors: [],
    };
  }
}
