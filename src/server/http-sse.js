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

function buildToolInputSchema(toolName) {
  if (toolName === "sn.instance.info") {
    return {
      type: "object",
      properties: {
        instance_key: {
          type: "string",
          description: "Optional configured ServiceNow instance key",
        },
      },
      additionalProperties: false,
    };
  }

  if (toolName === "sn.table.list") {
    return {
      type: "object",
      properties: {
        table: { type: "string" },
        limit: { type: "number" },
        offset: { type: "number" },
        query: { type: "string" },
        instance_key: { type: "string" },
      },
      additionalProperties: true,
    };
  }

  return {
    type: "object",
    additionalProperties: true,
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
      const tools = this.mcpServer.listTools().map((tool) => ({
        name: tool.name,
        description: `ServiceNow MCP tool (${tool.tier})`,
        inputSchema: buildToolInputSchema(tool.name),
      }));
      return jsonRpcSuccess(id, { tools });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const toolInput = params?.arguments || {};

      if (!toolName) {
        return jsonRpcError(id, -32602, "Invalid params", {
          reason: "tools/call requires params.name",
        });
      }

      try {
        const envelope = await this.mcpServer.invoke(toolName, toolInput);
        return jsonRpcSuccess(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(envelope, null, 2),
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
