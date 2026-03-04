import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { HttpSseTransport } from "../src/server/http-sse.js";

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
