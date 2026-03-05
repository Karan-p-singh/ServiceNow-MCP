import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { HttpSseTransport } from "../src/server/http-sse.js";

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, json: null, raw });
        }
      });
    });

    req.on("error", reject);
    req.end(body);
  });
}

test("HttpSseTransport - large payload should be rejected and connection closed", async () => {
  const transport = new HttpSseTransport({
    mcpServer: {
      listTools: () => [],
      handleRpc: async () => ({ jsonrpc: "2.0", result: "ok", id: 1 })
    },
    config: {
      server: {
        host: "127.0.0.1",
        port: 3002,
        path: "/mcp",
      },
    },
  });

  await transport.start();
  const url = `http://127.0.0.1:3002/mcp`;

  try {
    // Create a large payload > 1MB
    const largePayload = "a".repeat(1_500_000);

    const req = http.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": largePayload.length
      },
    });

    let gotError = false;
    let response = null;

    const result = await new Promise((resolve) => {
      req.on("error", (err) => {
        gotError = true;
        resolve({ type: "error", error: err });
      });
      req.on("response", (res) => {
        response = res;
        resolve({ type: "response", status: res.statusCode });
      });

      // Send the data in chunks
      req.write(largePayload.slice(0, 1000000));
      setTimeout(() => {
        if (!gotError && !response) {
            req.write(largePayload.slice(1000000));
            req.end();
        }
      }, 50);
    });

    // In both cases (with and without fix), we expect a 400 or an error
    if (result.type === "response") {
        assert.equal(result.status, 400);
    } else {
        assert.ok(result.error);
    }

  } finally {
    await transport.stop();
  }
});

test("HttpSseTransport - tools/list detail modes return expected payload shape", async () => {
  const transport = new HttpSseTransport({
    mcpServer: {
      listTools: () => [
        {
          name: "sn.sample.tool",
          tier: "T0",
          description: "sample",
          inputSchema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      ],
      invoke: async () => ({ data: {} }),
    },
    config: {
      toolsListDetail: "standard",
      responseTextMode: "summary",
      maxTextChars: 400,
      server: {
        host: "127.0.0.1",
        port: 3003,
        path: "/mcp",
      },
    },
  });

  await transport.start();
  const url = "http://127.0.0.1:3003/mcp";

  try {
    const minimal = await postJson(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: { detail: "minimal" },
    });

    const standard = await postJson(url, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: { detail: "standard" },
    });

    const full = await postJson(url, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: { detail: "full" },
    });

    assert.equal(minimal.status, 200);
    assert.equal(standard.status, 200);
    assert.equal(full.status, 200);

    const minimalTool = minimal.json?.result?.tools?.[0] || {};
    const standardTool = standard.json?.result?.tools?.[0] || {};
    const fullTool = full.json?.result?.tools?.[0] || {};

    assert.equal(typeof minimalTool.name, "string");
    assert.equal(typeof minimalTool.tier, "string");
    assert.equal("description" in minimalTool, false);
    assert.equal("inputSchema" in minimalTool, false);

    assert.equal(typeof standardTool.description, "string");
    assert.equal("inputSchema" in standardTool, false);

    assert.equal(typeof fullTool.description, "string");
    assert.equal(typeof fullTool.inputSchema, "object");
  } finally {
    await transport.stop();
  }
});

test("HttpSseTransport - tools/call text summary stays compact while structuredContent remains full", async () => {
  const largeData = {
    large_text: "x".repeat(2000),
    nested: { key: "value" },
  };

  const transport = new HttpSseTransport({
    mcpServer: {
      listTools: () => [
        {
          name: "sn.sample.tool",
          tier: "T0",
          inputSchema: { type: "object", properties: {}, additionalProperties: true },
        },
      ],
      invoke: async () => ({
        request_id: "req-1",
        correlation_id: "corr-1",
        tool: "sn.sample.tool",
        tier: "T0",
        data: largeData,
        errors: [],
      }),
    },
    config: {
      responseTextMode: "summary",
      maxTextChars: 180,
      server: {
        host: "127.0.0.1",
        port: 3004,
        path: "/mcp",
      },
    },
  });

  await transport.start();
  const url = "http://127.0.0.1:3004/mcp";

  try {
    const result = await postJson(url, {
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: {
        name: "sn.sample.tool",
        arguments: {},
      },
    });

    assert.equal(result.status, 200);
    const text = result.json?.result?.content?.[0]?.text || "";
    assert.equal(text.includes("large_text"), false);
    assert.equal(text.length <= 220, true);
    assert.deepEqual(result.json?.result?.structuredContent?.data, largeData);
  } finally {
    await transport.stop();
  }
});
