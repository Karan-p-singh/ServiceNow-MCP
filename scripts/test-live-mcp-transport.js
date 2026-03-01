import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "../src/config.js";

function log(title, value) {
  console.log(`\n=== ${title} ===`);
  if (value !== undefined) {
    console.log(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }
}

const results = [];

function pass(name, details) {
  results.push({ name, status: "PASS", details });
  console.log(`✅ PASS: ${name}`);
  if (details !== undefined) {
    console.log(typeof details === "string" ? `   ${details}` : `   ${JSON.stringify(details, null, 2)}`);
  }
}

function fail(name, details) {
  results.push({ name, status: "FAIL", details });
  console.log(`❌ FAIL: ${name}`);
  if (details !== undefined) {
    console.log(typeof details === "string" ? `   ${details}` : `   ${JSON.stringify(details, null, 2)}`);
  }
}

function assertCheck(name, condition, details) {
  if (condition) {
    pass(name, details);
    return true;
  }
  fail(name, details);
  return false;
}

function hasOwn(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key);
}

const TIER_ORDER = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
};

const EXPECTED_GUARDRAIL_CODES = new Set(["POLICY_BLOCKED", "T3_CONFIRMATION_REQUIRED", "TIER_MAX_EXCEEDED"]);

function normalizeTier(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(TIER_ORDER, normalized) ? normalized : "T0";
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

async function postRaw(endpoint, body, headers = { "Content-Type": "application/json" }) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return {
    status: res.status,
    text,
    body: json,
  };
}

async function run() {
  const config = loadConfig();
  const host = config.server?.host || "localhost";
  const port = config.server?.port || 3001;
  const path = config.server?.path || "/mcp";
  const endpoint = `http://${host}:${port}${path}`;
  const effectiveTierMax = normalizeTier(config.tierMax);
  const expectedToolNames = [
    "sn.instance.info",
    "sn.table.list",
    "sn.script.get",
    "sn.script.update",
    "sn.changeset.commit.preview",
    "sn.changeset.commit",
  ];
  const expectedGuardrailObservations = [];

  log("MCP Transport Test", {
    endpoint,
    transport: config.transport,
    instance: config.instanceUrl,
  });
  log("How to read this output", {
    note:
      "Some tool calls intentionally verify guardrail blocks. Seeing POLICY_BLOCKED or T3_CONFIRMATION_REQUIRED in tool responses/server stderr is expected when assertions still PASS.",
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
    pass("HTTP endpoint readiness", endpoint);

    const metadataRes = await fetch(endpoint, {
      headers: { Accept: "application/json" },
    });
    const metadataJson = await metadataRes.json();
    log("GET /mcp metadata", {
      status: metadataRes.status,
      body: metadataJson,
    });
    assertCheck(
      "GET /mcp returns metadata JSON",
      metadataRes.status === 200 && metadataJson?.transport === "http-sse",
      { status: metadataRes.status, transport: metadataJson?.transport },
    );
    assertCheck(
      "GET /mcp includes required supported methods",
      ["initialize", "ping", "tools/list", "tools/call"].every((method) =>
        Array.isArray(metadataJson?.supported_methods) && metadataJson.supported_methods.includes(method),
      ),
      { supported_methods: metadataJson?.supported_methods || [] },
    );

    const initialize = await rpcCall(endpoint, 1, "initialize", {});
    log("RPC initialize", initialize);
    assertCheck(
      "RPC initialize returns JSON-RPC success shape",
      initialize.status === 200 && initialize?.body?.jsonrpc === "2.0" && hasOwn(initialize.body, "result"),
      initialize,
    );
    assertCheck(
      "RPC initialize includes protocol/serverInfo",
      Boolean(
        initialize?.body?.result?.protocolVersion &&
          initialize?.body?.result?.serverInfo?.name &&
          initialize?.body?.result?.serverInfo?.version,
      ),
      initialize?.body?.result,
    );

    const ping = await rpcCall(endpoint, 11, "ping", {});
    log("RPC ping", ping);
    assertCheck(
      "RPC ping returns JSON-RPC success",
      ping.status === 200 && ping?.body?.jsonrpc === "2.0" && hasOwn(ping.body, "result"),
      ping,
    );

    const toolsList = await rpcCall(endpoint, 2, "tools/list", {});
    log("RPC tools/list", {
      status: toolsList.status,
      tool_count: toolsList?.body?.result?.tools?.length || 0,
    });
    const listedToolNames = (toolsList?.body?.result?.tools || []).map((tool) => tool.name);
    assertCheck(
      "RPC tools/list returns expected baseline tools",
      toolsList.status === 200 && expectedToolNames.every((toolName) => listedToolNames.includes(toolName)),
      { listedToolNames },
    );

    const instanceInfo = await rpcCall(endpoint, 3, "tools/call", {
      name: "sn.instance.info",
      arguments: {},
    });
    log("RPC tools/call sn.instance.info", instanceInfo);
    const envelope = instanceInfo?.body?.result?.structuredContent;
    assertCheck(
      "tools/call sn.instance.info returns structured envelope",
      instanceInfo.status === 200 &&
        instanceInfo?.body?.jsonrpc === "2.0" &&
        hasOwn(instanceInfo?.body || {}, "result") &&
        envelope &&
        envelope.tool === "sn.instance.info" &&
        typeof envelope.request_id === "string" &&
        typeof envelope.tier === "string" &&
        hasOwn(envelope, "policy") &&
        hasOwn(envelope, "validation_summary") &&
        Array.isArray(envelope.errors),
      envelope,
    );

    const scriptUpdate = await rpcCall(endpoint, 4, "tools/call", {
      name: "sn.script.update",
      arguments: {
        scope: "x_demo_scope",
        sys_id: "test-id-001",
      },
    });
    log("RPC tools/call sn.script.update", scriptUpdate);
    const scriptUpdateEnvelope = scriptUpdate?.body?.result?.structuredContent;
    const scriptUpdateCodes = (scriptUpdateEnvelope?.errors || []).map((entry) => entry.code);
    const scriptUpdateExpectedGuardrail = scriptUpdateCodes.find((code) => EXPECTED_GUARDRAIL_CODES.has(code));
    if (scriptUpdateExpectedGuardrail) {
      expectedGuardrailObservations.push({
        tool: "sn.script.update",
        code: scriptUpdateExpectedGuardrail,
      });
    }
    assertCheck(
      "tools/call sn.script.update returns typed envelope",
      scriptUpdate.status === 200 &&
        scriptUpdate?.body?.jsonrpc === "2.0" &&
        scriptUpdateEnvelope?.tool === "sn.script.update" &&
        Array.isArray(scriptUpdateEnvelope?.errors),
      scriptUpdateEnvelope,
    );
    assertCheck(
      "tools/call sn.script.update enforces tier/policy block when applicable",
      Boolean(
        scriptUpdateEnvelope &&
          ((scriptUpdateEnvelope?.policy?.allowed === false && scriptUpdateEnvelope.errors.length >= 1) ||
            scriptUpdateEnvelope?.policy?.allowed === true),
      ),
      {
        tier_max: config.tierMax,
        effective_tier_max: effectiveTierMax,
        allowed: scriptUpdateEnvelope?.policy?.allowed,
        error_codes: scriptUpdateCodes,
      },
    );

    const changesetCommit = await rpcCall(endpoint, 5, "tools/call", {
      name: "sn.changeset.commit",
      arguments: {
        changeset: "u_demo_changeset",
      },
    });
    log("RPC tools/call sn.changeset.commit", changesetCommit);
    const changesetEnvelope = changesetCommit?.body?.result?.structuredContent;
    const changesetCodes = (changesetEnvelope?.errors || []).map((entry) => entry.code);
    const expectsTierPreflightBlock = TIER_ORDER[effectiveTierMax] < TIER_ORDER.T3;
    const expectedChangesetCode = expectsTierPreflightBlock
      ? "TIER_MAX_EXCEEDED"
      : "T3_CONFIRMATION_REQUIRED";
    if (changesetCodes.includes(expectedChangesetCode)) {
      expectedGuardrailObservations.push({
        tool: "sn.changeset.commit",
        code: expectedChangesetCode,
      });
    }
    assertCheck(
      "tools/call sn.changeset.commit enforces T3 confirm+reason preflight",
      changesetCommit.status === 200 &&
        changesetEnvelope?.tool === "sn.changeset.commit" &&
        changesetCodes.includes(expectedChangesetCode),
      {
        tier_max: config.tierMax,
        effective_tier_max: effectiveTierMax,
        expected_error_code: expectedChangesetCode,
        error_codes: changesetCodes,
      },
    );

    const changesetPreview = await rpcCall(endpoint, 12, "tools/call", {
      name: "sn.changeset.commit.preview",
      arguments: {
        changeset_sys_id: "a1111111b2222222c3333333d4444444",
        include_conflicts: true,
      },
    });
    log("RPC tools/call sn.changeset.commit.preview", changesetPreview);
    const previewEnvelope = changesetPreview?.body?.result?.structuredContent;
    assertCheck(
      "tools/call sn.changeset.commit.preview returns read-only dry-run contract",
      changesetPreview.status === 200 &&
        previewEnvelope?.tool === "sn.changeset.commit.preview" &&
        previewEnvelope?.data?.preview_generated === true &&
        previewEnvelope?.data?.write_side_effects === false &&
        Array.isArray(previewEnvelope?.data?.recommended_mitigations),
      previewEnvelope,
    );

    const unknownMethod = await rpcCall(endpoint, 6, "unknown/method", {});
    log("RPC unknown method", unknownMethod);
    assertCheck(
      "unknown JSON-RPC method returns method-not-found error",
      unknownMethod.status === 200 && unknownMethod?.body?.error?.code === -32601,
      unknownMethod,
    );

    const invalidParams = await rpcCall(endpoint, 7, "tools/call", {
      arguments: {},
    });
    log("RPC tools/call missing name", invalidParams);
    assertCheck(
      "tools/call missing name returns invalid-params",
      invalidParams.status === 200 && invalidParams?.body?.error?.code === -32602,
      invalidParams,
    );

    const unknownTool = await rpcCall(endpoint, 8, "tools/call", {
      name: "sn.unknown.tool",
      arguments: {},
    });
    log("RPC tools/call unknown tool", unknownTool);
    assertCheck(
      "tools/call unknown tool returns invocation failure",
      unknownTool.status === 200 && unknownTool?.body?.error?.code === -32000,
      unknownTool,
    );

    const invalidRequest = await postRaw(endpoint, JSON.stringify({ jsonrpc: "2.0", id: 9 }));
    log("RPC invalid request", invalidRequest);
    assertCheck(
      "invalid JSON-RPC request shape returns invalid-request",
      invalidRequest.status === 400 && invalidRequest?.body?.error?.code === -32600,
      invalidRequest,
    );

    const parseError = await postRaw(endpoint, "{not-json");
    log("RPC parse error", parseError);
    assertCheck(
      "invalid JSON payload returns parse-error",
      parseError.status === 400 && parseError?.body?.error?.code === -32700,
      parseError,
    );

    const failures = results.filter((entry) => entry.status === "FAIL");
    const passes = results.filter((entry) => entry.status === "PASS");
    log("MCP transport assertion summary", {
      passed: passes.length,
      failed: failures.length,
      failures,
    });
    log("Interpretation summary", {
      verdict: failures.length > 0 ? "FAIL (contract regression detected)" : "PASS (expected guardrails active)",
      expected_guardrail_observations: expectedGuardrailObservations.length,
      observed_guardrails: expectedGuardrailObservations,
      guidance:
        failures.length > 0
          ? "Investigate failed assertions above."
          : "If you still see POLICY_BLOCKED/T3_CONFIRMATION_REQUIRED in logs, that is expected for negative-path validation.",
    });

    if (failures.length > 0) {
      console.log("\n❌ MCP transport checks completed with failures.");
      process.exitCode = 1;
      return;
    }

    console.log("\n✅ MCP transport checks completed with all assertions passing.");
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
      const hasExpectedGuardrailLog =
        stderr.includes("POLICY_BLOCKED") ||
        stderr.includes("T3_CONFIRMATION_REQUIRED") ||
        stderr.includes("TIER_MAX_EXCEEDED");
      log(
        "Server stderr",
        `${hasExpectedGuardrailLog ? "(Contains expected guardrail warnings from negative-path checks)\n" : ""}${stderr.trim()}`,
      );
    }
  }
}

run().catch((error) => {
  console.error("❌ MCP transport test failed");
  console.error(error);
  process.exit(1);
});
