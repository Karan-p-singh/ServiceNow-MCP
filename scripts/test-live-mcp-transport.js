import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "../src/config.js";

function log(title, value) {
  console.log(`\n=== ${title} ===`);
  if (value !== undefined) {
    console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }
}

async function waitForHttp(url, attempts = 20, delayMs = 500) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        return;
      }
    } catch {
      // retry
    }
    await sleep(delayMs);
  }
  throw new Error(`MCP endpoint did not become ready: ${url}`);
}

async function rpcCall(endpoint, id, method, params = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function run() {
  const config = loadConfig();
  const host = config.server?.host || "localhost";
  const port = config.server?.port || 3001;
  const path = config.server?.path || "/mcp";
  const endpoint = `http://${host}:${port}${path}`;

  log("MCP Transport Test", {
    endpoint,
    transport: config.transport,
    instance: config.instanceUrl,
  });

  const child = spawn(process.execPath, ["src/index.js"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (buf) => {
    stdout += buf.toString();
  });
  child.stderr.on("data", (buf) => {
    stderr += buf.toString();
  });

  try {
    await waitForHttp(endpoint);
    log("Endpoint Ready", endpoint);

    const metadataRes = await fetch(endpoint, {
      headers: { Accept: "application/json" },
    });
    const metadataJson = await metadataRes.json();
    log("GET /mcp metadata", {
      status: metadataRes.status,
      body: metadataJson,
    });

    const initialize = await rpcCall(endpoint, 1, "initialize", {});
    log("RPC initialize", initialize);

    const toolsList = await rpcCall(endpoint, 2, "tools/list", {});
    log("RPC tools/list", {
      status: toolsList.status,
      tool_count: toolsList?.body?.result?.tools?.length || 0,
    });

    const instanceInfo = await rpcCall(endpoint, 3, "tools/call", {
      name: "sn.instance.info",
      arguments: {},
    });
    log("RPC tools/call sn.instance.info", instanceInfo);

    console.log("\n✅ MCP transport checks completed.");
  } finally {
    child.kill("SIGTERM");
    await sleep(400);
    if (!child.killed) {
      child.kill("SIGKILL");
    }

    if (stdout.trim()) {
      log("Server stdout", stdout.trim());
    }
    if (stderr.trim()) {
      log("Server stderr", stderr.trim());
    }
  }
}

run().catch((error) => {
  console.error("❌ MCP transport test failed");
  console.error(error);
  process.exit(1);
});
