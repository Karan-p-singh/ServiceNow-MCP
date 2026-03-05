/**
 * @typedef {"T0"|"T1"|"T2"|"T3"} ToolTier
 */

/**
 * @typedef ToolDefinition
 * @property {string} name
 * @property {ToolTier} tier
 * @property {(input: any, context: any) => Promise<any> | any} handler
 */

export class ToolRegistry {
  constructor() {
    /** @type {Map<string, ToolDefinition>} */
    this.tools = new Map();
  }

  /** @param {ToolDefinition} tool */
  register(tool) {
    if (!tool?.name) {
      throw new Error("Tool registration failed: missing tool.name");
    }
    if (!tool?.tier) {
      throw new Error(`Tool registration failed for ${tool.name}: missing tool.tier`);
    }
    if (typeof tool?.handler !== "function") {
      throw new Error(`Tool registration failed for ${tool.name}: missing tool.handler`);
    }
    this.tools.set(tool.name, tool);
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      tier: tool.tier,
      description: tool.description,
      inputSchema: tool.inputSchema || tool.parameters,
    }));
  }

  get(name) {
    return this.tools.get(name);
  }
}
