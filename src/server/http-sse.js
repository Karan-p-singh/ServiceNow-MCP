import http from "node:http";

function jsonRpcSuccess(id, result) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      data,
    },
  };
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed);
      } catch {
        reject(new Error("Invalid JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeToolInputSchema(schema) {
  function normalizePropertyDefinition(definition) {
    if (!definition || typeof definition !== "object") {
      return { type: "string" };
    }

    const normalized = { ...definition };

    if (normalized.type === "array") {
      const rawItems = normalized.items;
      if (!rawItems || typeof rawItems !== "object") {
        normalized.items = { type: "string" };
      } else {
        normalized.items = normalizePropertyDefinition(rawItems);
      }
    }

    if (normalized.type === "object") {
      const rawProps =
        normalized.properties && typeof normalized.properties === "object"
          ? normalized.properties
          : {};
      const properties = {};
      for (const [key, childDefinition] of Object.entries(rawProps)) {
        properties[key] = normalizePropertyDefinition(childDefinition);
      }
      normalized.properties = properties;
      if (!Array.isArray(normalized.required)) {
        normalized.required = [];
      }
      if (normalized.additionalProperties === undefined) {
        normalized.additionalProperties = true;
      }
    }

    return normalized;
  }

  if (!schema || typeof schema !== "object") {
    return {
      type: "object",
      additionalProperties: true,
    };
  }

  const normalizedProperties = {};
  for (const [field, definition] of Object.entries(schema.properties || {})) {
    normalizedProperties[field] = normalizePropertyDefinition(definition);
  }

  return {
    type: "object",
    properties: normalizedProperties,
    required: Array.isArray(schema.required) ? schema.required : [],
    additionalProperties:
      schema.additionalProperties === undefined ? true : schema.additionalProperties,
  };
}

function validateToolInput(schema, input) {
  const normalizedSchema = normalizeToolInputSchema(schema);
  const args = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const errors = [];

  for (const requiredKey of normalizedSchema.required || []) {
    if (args[requiredKey] === undefined) {
      errors.push({ code: "MISSING_REQUIRED_FIELD", field: requiredKey });
    }
  }

  if (normalizedSchema.additionalProperties === false) {
    const allowed = new Set(Object.keys(normalizedSchema.properties || {}));
    for (const key of Object.keys(args)) {
      if (!allowed.has(key)) {
        errors.push({ code: "UNKNOWN_FIELD", field: key });
      }
    }
  }

  for (const [field, definition] of Object.entries(normalizedSchema.properties || {})) {
    const value = args[field];
    if (value === undefined || !definition || typeof definition !== "object") {
      continue;
    }
    if (definition.type === "string" && typeof value !== "string") {
      errors.push({ code: "INVALID_FIELD_TYPE", field, expected: "string" });
    }
    if (definition.type === "number" && typeof value !== "number") {
      errors.push({ code: "INVALID_FIELD_TYPE", field, expected: "number" });
    }
    if (definition.type === "boolean" && typeof value !== "boolean") {
      errors.push({ code: "INVALID_FIELD_TYPE", field, expected: "boolean" });
    }
    if (definition.type === "array" && !Array.isArray(value)) {
      errors.push({ code: "INVALID_FIELD_TYPE", field, expected: "array" });
    }
    if (
      definition.type === "object" &&
      (value === null || typeof value !== "object" || Array.isArray(value))
    ) {
      errors.push({ code: "INVALID_FIELD_TYPE", field, expected: "object" });
    }
    if (
      Array.isArray(definition.enum) &&
      definition.enum.length > 0 &&
      !definition.enum.includes(value)
    ) {
      errors.push({ code: "INVALID_ENUM_VALUE", field, allowed: definition.enum });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function toCodexSafeToolName(name) {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function truncateText(text, maxChars) {
  const source = String(text || "");
  const limit = Number.isFinite(maxChars) ? Math.max(80, Number(maxChars)) : 800;
  if (source.length <= limit) {
    return source;
  }
  return `${source.slice(0, limit)}… [truncated ${source.length - limit} chars]`;
}

function buildToolCallText({ envelope, requestedToolName, textMode, maxTextChars }) {
  if (String(textMode || "summary").toLowerCase() === "full") {
    return truncateText(JSON.stringify(envelope), maxTextChars);
  }

  const summary = {
    tool: envelope?.tool || requestedToolName || null,
    tier: envelope?.tier || null,
    request_id: envelope?.request_id || null,
    correlation_id: envelope?.correlation_id || null,
    error_count: Array.isArray(envelope?.errors) ? envelope.errors.length : 0,
    blocked:
      envelope?.policy?.allowed === false ||
      envelope?.validation_summary?.blocked === true,
  };

  return truncateText(JSON.stringify(summary), maxTextChars);
}

function buildToolNameMaps(tools) {
  const internalToExternal = new Map();
  const externalToInternal = new Map();
  const usedExternalNames = new Set();

  for (const tool of tools) {
    const internalName = String(tool?.name || "").trim();
    if (!internalName) {
      continue;
    }

    let externalName = toCodexSafeToolName(internalName) || "tool";
    let suffix = 2;
    while (usedExternalNames.has(externalName)) {
      externalName = `${toCodexSafeToolName(internalName) || "tool"}_${suffix}`;
      suffix += 1;
    }

    usedExternalNames.add(externalName);
    internalToExternal.set(internalName, externalName);
    externalToInternal.set(externalName, internalName);
  }

  return {
    internalToExternal,
    externalToInternal,
  };
}

export class HttpSseTransport {
  constructor({ mcpServer, config, logger = console } = {}) {
    this.mcpServer = mcpServer;
    this.config = config;
    this.logger = logger;
    this.httpServer = null;
    this.sseClients = new Set();
  }

  endpointUrl() {
    const host = this.config?.server?.host || "localhost";
    const port = this.config?.server?.port || 3001;
    const path = this.config?.server?.path || "/mcp";
    return `http://${host}:${port}${path}`;
  }

  sseUrl() {
    return `${this.endpointUrl()}/sse`;
  }

  async start() {
    const host = this.config?.server?.host || "localhost";
    const port = this.config?.server?.port || 3001;
    const basePath = this.config?.server?.path || "/mcp";

    this.httpServer = http.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
      const normalizedPath = url.pathname.endsWith("/") && url.pathname.length > 1
        ? url.pathname.slice(0, -1)
        : url.pathname;

      if (req.method === "GET" && normalizedPath === basePath) {
        const acceptHeader = String(req.headers.accept || "").toLowerCase();
        const explicitlyJson = acceptHeader.includes("application/json") && !acceptHeader.includes("text/html");

        if (!explicitlyJson) {
          const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>ServiceNow MCP HTTP/SSE Endpoint</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 860px; margin: 32px auto; line-height: 1.45; }
      code, pre { background: #f5f5f5; padding: 2px 6px; border-radius: 4px; }
      pre { padding: 10px; overflow-x: auto; }
    </style>
  </head>
  <body>
    <h1>ServiceNow MCP Endpoint</h1>
    <p>This is a JSON-RPC MCP endpoint.</p>
    <ul>
      <li><strong>Endpoint:</strong> <code>${this.endpointUrl()}</code></li>
      <li><strong>SSE stream:</strong> <code>${this.sseUrl()}</code></li>
    </ul>
    <p>Browser GET is for metadata/health. MCP clients use <code>POST /mcp</code> with JSON-RPC.</p>
    <pre>{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}</pre>
  </body>
</html>`;

          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(html);
          return;
        }

        const response = {
          status: "ok",
          transport: "http-sse",
          endpoint: this.endpointUrl(),
          sse_endpoint: this.sseUrl(),
          protocol: "jsonrpc-2.0",
          supported_methods: ["initialize", "ping", "tools/list", "tools/call"],
        };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
        return;
      }

      if (req.method === "GET" && normalizedPath === `${basePath}/sse`) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        res.write(`event: ready\ndata: ${JSON.stringify({ endpoint: this.endpointUrl() })}\n\n`);
        this.sseClients.add(res);

        req.on("close", () => {
          this.sseClients.delete(res);
        });
        return;
      }

      if (req.method === "POST" && normalizedPath === basePath) {
        try {
          const payload = await parseJsonBody(req);

          if (!payload || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify(jsonRpcError(null, -32600, "Invalid Request")));
            return;
          }

          const rpcResponse = await this.handleRpc(payload);
          this.broadcastSse({ method: payload.method, id: payload.id, response: rpcResponse });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(rpcResponse));
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(jsonRpcError(null, -32700, "Parse error", { message })));
          return;
        }
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    await new Promise((resolve, reject) => {
      this.httpServer.once("error", reject);
      this.httpServer.listen(port, host, resolve);
    });

    this.logger.info?.("[mcp] http-sse transport started", {
      endpoint: this.endpointUrl(),
      sse_endpoint: this.sseUrl(),
    });
  }

  async stop() {
    for (const client of this.sseClients) {
      try {
        client.end();
      } catch {
        // no-op
      }
    }
    this.sseClients.clear();

    if (!this.httpServer) {
      return;
    }

    await new Promise((resolve) => {
      this.httpServer.close(() => resolve());
    });
    this.httpServer = null;
  }

  broadcastSse(event) {
    const line = `event: message\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(line);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  async handleRpc(payload) {
    const { id, method, params = {} } = payload;

    if (method === "initialize") {
      return jsonRpcSuccess(id, {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "servicenow-mcp-server",
          version: "0.1.0",
        },
        capabilities: {
          tools: {},
        },
      });
    }

    if (method === "ping") {
      return jsonRpcSuccess(id, {});
    }

    if (method === "tools/list") {
      const registeredTools = this.mcpServer.listTools();
      const maps = buildToolNameMaps(registeredTools);
      const requestedDetail = String(
        params?.detail || this.config?.toolsListDetail || "standard",
      ).toLowerCase();
      const detail = ["minimal", "standard", "full"].includes(requestedDetail)
        ? requestedDetail
        : "standard";

      const tools = registeredTools.map((tool) => {
        const base = {
          name: maps.internalToExternal.get(tool.name) || tool.name,
          tier: tool.tier,
        };

        if (detail === "minimal") {
          return base;
        }

        const withDescription = {
          ...base,
          description: tool.description || `ServiceNow MCP tool (${tool.tier})`,
        };

        if (detail === "full") {
          return {
            ...withDescription,
            inputSchema: normalizeToolInputSchema(tool.inputSchema),
          };
        }

        return withDescription;
      });
      return jsonRpcSuccess(id, { tools });
    }

    if (method === "tools/call") {
      const requestedToolName = params?.name;
      const toolInput = params?.arguments || {};

      if (!requestedToolName) {
        return jsonRpcError(id, -32602, "Invalid params", {
          reason: "tools/call requires params.name",
        });
      }

      try {
        const registeredTools = this.mcpServer.listTools();
        const maps = buildToolNameMaps(registeredTools);
        const toolName =
          maps.externalToInternal.get(requestedToolName) ||
          String(requestedToolName);
        const toolDefinition = registeredTools.find((entry) => entry.name === toolName);
        const validation = validateToolInput(toolDefinition?.inputSchema, toolInput);
        if (!validation.valid) {
          return jsonRpcError(id, -32602, "Invalid params", {
            code: "INVALID_TOOL_INPUT",
            tool: toolName,
            issues: validation.errors,
          });
        }

        const envelope = await this.mcpServer.invoke(toolName, toolInput);
        const textMode = String(this.config?.responseTextMode || "summary").toLowerCase();
        const maxTextChars = Number(this.config?.maxTextChars || 800);
        const text = buildToolCallText({
          envelope,
          requestedToolName,
          textMode,
          maxTextChars,
        });
        return jsonRpcSuccess(id, {
          content: [
            {
              type: "text",
              text,
            },
          ],
          isError: Array.isArray(envelope?.errors) && envelope.errors.length > 0,
          structuredContent: envelope,
        });
      } catch (error) {
        return jsonRpcError(id, -32000, "Tool invocation failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return jsonRpcError(id, -32601, "Method not found", { method });
  }
}
