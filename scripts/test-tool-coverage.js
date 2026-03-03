import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { loadConfig } from "../src/config.js";

function waitForHttp(url, attempts = 20, delayMs = 500) {
  return (async () => {
    for (let i = 0; i < attempts; i += 1) {
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.ok) return;
      } catch {
        // retry
      }
      await sleep(delayMs);
    }
    throw new Error(`Endpoint not ready: ${url}`);
  })();
}

function unwrapSysId(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.value || value.display_value || null;
  return null;
}

async function rpcCall(endpoint, id, method, params = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    signal: controller.signal,
  });
  clearTimeout(timeout);
  const body = await response.json();
  return { status: response.status, body };
}

async function writeArtifact(report) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const outputPath = path.join(artifactsDir, "tool-coverage-summary.json");
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

const EXPECTED_BLOCKED_CODES = new Set([
  "POLICY_BLOCKED",
  "T3_CONFIRMATION_REQUIRED",
  "TIER_MAX_EXCEEDED",
  "TOOL_DISABLED_BY_BUNDLE",
]);

const EXPECTED_JSONRPC_ERROR_CODES = new Set([-32000, -32602]);

function classifyToolCall({ toolName, response }) {
  const structured = response?.body?.result?.structuredContent;
  const jsonRpcError = response?.body?.error;
  const jsonRpcErrorCode = jsonRpcError?.code;

  const envelopeTool = structured?.tool;
  const envelopeErrors = Array.isArray(structured?.errors) ? structured.errors : [];
  const envelopeErrorCodes = envelopeErrors.map((entry) => entry?.code).filter(Boolean);

  const hasStructuredToolMatch = envelopeTool === toolName;
  const hasEnvelopeErrors = envelopeErrors.length > 0;

  // Invocation coverage: tool responded through envelope OR expected JSON-RPC contract error.
  const isInvocationCovered =
    hasStructuredToolMatch || EXPECTED_JSONRPC_ERROR_CODES.has(jsonRpcErrorCode);

  if (!isInvocationCovered) {
    return {
      tool: toolName,
      invocation_covered: false,
      category: "NOT_COVERED",
      error_code: jsonRpcErrorCode || envelopeErrorCodes[0] || null,
      error_codes: envelopeErrorCodes,
      notes: "No structured tool envelope match and no expected JSON-RPC contract error.",
    };
  }

  if (hasStructuredToolMatch && !hasEnvelopeErrors) {
    return {
      tool: toolName,
      invocation_covered: true,
      category: "LIVE_SUCCESS",
      error_code: null,
      error_codes: [],
      notes: "Tool invocation succeeded without envelope errors.",
    };
  }

  if (hasStructuredToolMatch && hasEnvelopeErrors) {
    const allExpectedBlocked = envelopeErrorCodes.every((code) => EXPECTED_BLOCKED_CODES.has(code));
    if (allExpectedBlocked) {
      return {
        tool: toolName,
        invocation_covered: true,
        category: "EXPECTED_BLOCKED",
        error_code: envelopeErrorCodes[0] || null,
        error_codes: envelopeErrorCodes,
        notes: "Tool reached expected governance/policy gate.",
      };
    }

    return {
      tool: toolName,
      invocation_covered: true,
      category: "UNEXPECTED_FAILURE",
      error_code: envelopeErrorCodes[0] || null,
      error_codes: envelopeErrorCodes,
      notes: "Tool reached MCP envelope but failed with unexpected runtime/service error.",
    };
  }

  return {
    tool: toolName,
    invocation_covered: true,
    category: "EXPECTED_BLOCKED",
    error_code: jsonRpcErrorCode || null,
    error_codes: jsonRpcErrorCode ? [jsonRpcErrorCode] : [],
    notes: "Expected JSON-RPC invocation error for coverage contract.",
  };
}

async function main() {
  const config = loadConfig();
  const host = config.server?.host || "localhost";
  const port = config.server?.port || 3001;
  const basePath = config.server?.path || "/mcp";
  const endpoint = `http://${host}:${port}${basePath}`;

  const child = spawn(process.execPath, ["src/index.js"], {
    env: process.env,
    // Ignore stdout to avoid pipe backpressure deadlocks during large coverage runs.
    stdio: ["ignore", "ignore", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHttp(endpoint);
    const toolsList = await rpcCall(endpoint, 1, "tools/list", {});
    const tools = toolsList?.body?.result?.tools || [];
    const toolNames = tools.map((tool) => tool.name);

    const changesetList = await rpcCall(endpoint, 2, "tools/call", {
      name: "sn.changeset.list",
      arguments: { limit: 1, offset: 0 },
    });
    const discoveredChangesetSysId = unwrapSysId(
      changesetList?.body?.result?.structuredContent?.data?.records?.[0]?.sys_id,
    );

    const argumentMap = {
      "sn.script.get": { name: "x_demo_utility" },
      "sn.script.list": { limit: 1, offset: 0 },
      "sn.script.search": { term: "eval", limit: 1, offset: 0 },
      "sn.script.refs": { name: "x_demo_utility" },
      "sn.script.deps": { name: "x_demo_utility" },
      "sn.script.history": { name: "x_demo_utility", limit: 1, offset: 0 },
      "sn.script.diff": { name: "x_demo_utility" },
      "sn.script.update": {
        scope: "x_demo_scope",
        sys_id: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
        script: "var gr = new GlideRecord('incident'); gr.query();",
        acknowledged_findings: ["SCRIPT_GLIDERECORD_USAGE"],
      },
      "sn.script.create": {
        name: "x_demo_created_allowed",
        scope: "x_demo_scope",
        script: "var gr = new GlideRecord('incident'); gr.query();",
        acknowledged_findings: ["SCRIPT_GLIDERECORD_USAGE"],
      },
      "sn.acl.trace": { table: "incident", operation: "read", user: "mock-user" },
      "sn.table.list": { table: "sys_plugins", limit: 1, offset: 0 },
      "sn.table.get": { table: "sys_db_object", query: "name=sys_script_include" },
      "sn.table.count": { table: "sys_script_include" },
      "sn.changeset.list": { limit: 1, offset: 0 },
      "sn.changeset.get": { name: "u_demo_changeset" },
      "sn.changeset.contents": {
        changeset_sys_id: discoveredChangesetSysId || "a1111111b2222222c3333333d4444444",
        limit: 1,
        offset: 0,
      },
      "sn.changeset.export": { sys_id: discoveredChangesetSysId || "a1111111b2222222c3333333d4444444", format: "xml" },
      "sn.changeset.gaps": { changeset_sys_id: discoveredChangesetSysId || "a1111111b2222222c3333333d4444444", limit: 1, offset: 0 },
      "sn.updateset.capture.verify": {
        table: "sys_script_include",
        sys_id: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
        changeset_sys_id: discoveredChangesetSysId || "a1111111b2222222c3333333d4444444",
      },
      "sn.changeset.commit.preview": {
        changeset_sys_id: discoveredChangesetSysId || "a1111111b2222222c3333333d4444444",
        include_conflicts: true,
      },
      "sn.changeset.commit": {
        changeset_sys_id: discoveredChangesetSysId || "a1111111b2222222c3333333d4444444",
        confirm: true,
        reason: "tool-coverage-contract",
      },
      "sn.rollback.plan.generate": { changeset_sys_id: discoveredChangesetSysId || "a1111111b2222222c3333333d4444444" },
      "sn.flow.list": { limit: 1, offset: 0 },
      "sn.flow.get": { name: "x_demo_incident_flow" },
      "sn.flow.validate": { name: "x_demo_scheduled_flow" },
      "sn.workflow.list": { limit: 1, offset: 0 },
      "sn.workflow.get": { name: "x_demo_workflow" },
      "sn.workflow.validate": { name: "x_demo_wait_workflow" },
      "sn.validate.script_include": { name: "x_demo_utility" },
      "sn.validate.business_rule": { name: "x_demo_business_rule" },
      "sn.validate.client_script": { name: "x_demo_client_script" },
      "sn.validate.ui_script": { name: "x_demo_ui_script" },
      "sn.validate.flow": { name: "x_demo_scheduled_flow" },
      "sn.validate.workflow": { name: "x_demo_wait_workflow" },
      "sn.validate.catalog_policy": { name: "x_demo_catalog_policy" },
      "sn.validate.fix": { name: "x_demo_fix_script" },
    };

    const covered = [];
    const notCovered = [];
    const successful = [];
    const expectedBlocked = [];
    const unexpectedFailures = [];

    for (let i = 0; i < toolNames.length; i += 1) {
      const toolName = toolNames[i];
      const args = argumentMap[toolName] || {};
      const response = await rpcCall(endpoint, 1000 + i, "tools/call", {
        name: toolName,
        arguments: args,
      });

      const classification = classifyToolCall({ toolName, response });

      if (classification.invocation_covered) {
        covered.push({
          tool: classification.tool,
          status: classification.category,
          error_code: classification.error_code,
          error_codes: classification.error_codes,
          notes: classification.notes,
        });

        if (classification.category === "LIVE_SUCCESS") {
          successful.push(classification);
        } else if (classification.category === "EXPECTED_BLOCKED") {
          expectedBlocked.push(classification);
        } else if (classification.category === "UNEXPECTED_FAILURE") {
          unexpectedFailures.push(classification);
        }
      } else {
        notCovered.push({
          tool: classification.tool,
          status: "NOT_COVERED",
          error_code: classification.error_code,
          error_codes: classification.error_codes,
          notes: classification.notes,
        });
      }
    }

    const coveragePct = toolNames.length === 0 ? 0 : Math.round((covered.length / toolNames.length) * 10000) / 100;
    const successPct = toolNames.length === 0 ? 0 : Math.round((successful.length / toolNames.length) * 10000) / 100;
    const strictOperational = String(process.env.COVERAGE_STRICT_OPERATIONAL || "").toLowerCase() === "true";
    const contractPassed = notCovered.length === 0;
    const operationalPassed = unexpectedFailures.length === 0;
    const report = {
      generated_at: new Date().toISOString(),
      category: "tool_coverage_contract",
      passed: strictOperational ? contractPassed && operationalPassed : contractPassed,
      contract_passed: contractPassed,
      operational_passed: operationalPassed,
      strict_operational_mode: strictOperational,
      tools_registered_count: toolNames.length,
      covered_count: covered.length,
      not_covered_count: notCovered.length,
      coverage_percent: coveragePct,
      successful_count: successful.length,
      expected_blocked_count: expectedBlocked.length,
      unexpected_failure_count: unexpectedFailures.length,
      success_percent: successPct,
      covered,
      not_covered: notCovered,
      successful,
      expected_blocked: expectedBlocked,
      unexpected_failures: unexpectedFailures,
    };

    const artifactPath = await writeArtifact(report);
    console.log("\n=== Tool Coverage Summary ===");
    console.log(`Registered: ${report.tools_registered_count}`);
    console.log(`Covered: ${report.covered_count}`);
    console.log(`Not covered: ${report.not_covered_count}`);
    console.log(`Coverage: ${report.coverage_percent}%`);
    console.log(`Live success: ${report.successful_count}`);
    console.log(`Expected blocked: ${report.expected_blocked_count}`);
    console.log(`Unexpected failures: ${report.unexpected_failure_count}`);
    console.log(`Operational pass: ${report.operational_passed}`);
    if (!report.operational_passed) {
      console.log("⚠️  Unexpected runtime failures were detected. Review artifact for details.");
    }
    console.log(`Artifact: ${artifactPath}`);

    if (!report.passed) {
      process.exitCode = 1;
    }
  } finally {
    child.kill("SIGTERM");
    await sleep(400);
    if (!child.killed) {
      child.kill("SIGKILL");
    }

    if (stderr.trim()) {
      console.log("\n--- Server stderr (coverage run) ---");
      console.log(stderr.trim());
    }
  }
}

main().catch(async (error) => {
  const report = {
    generated_at: new Date().toISOString(),
    category: "tool_coverage_contract",
    passed: false,
    error: { message: error?.message || String(error) },
  };
  const artifactPath = await writeArtifact(report);
  console.error("❌ Tool coverage contract run failed");
  console.error(error);
  console.error(`Artifact: ${artifactPath}`);
  process.exit(1);
});
