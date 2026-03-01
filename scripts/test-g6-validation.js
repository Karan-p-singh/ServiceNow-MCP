import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../src/config.js";

function resolveSmokeEnvForGate(gateId) {
  const config = loadConfig();
  const target = String(process.env.GATE_TEST_TARGET || "mock").trim().toLowerCase();
  if (target === "live") {
    if (String(process.env.ALLOW_LIVE_GATE_TESTS || "").toLowerCase() !== "true") {
      throw new Error(
        `${gateId} live validation requires ALLOW_LIVE_GATE_TESTS=true to avoid accidental live-instance execution.`,
      );
    }

    const instanceUrl = String(process.env.SN_INSTANCE_URL || config.instanceUrl || "").trim();
    if (!instanceUrl) {
      throw new Error(`${gateId} live validation requires SN_INSTANCE_URL in environment.`);
    }
    if (instanceUrl.includes("example.service-now.com")) {
      throw new Error(
        `${gateId} live validation refused: SN_INSTANCE_URL points to mock placeholder (${instanceUrl}).`,
      );
    }
    if (String(process.env.ALLOW_LIVE_GATE_WRITES || "").toLowerCase() !== "true") {
      throw new Error(
        `${gateId} live validation requires ALLOW_LIVE_GATE_WRITES=true because smoke checks invoke write-path probes.`,
      );
    }

    return {
      ...process.env,
      SN_INSTANCE_KEY: process.env.SN_INSTANCE_KEY || "default",
      SN_INSTANCE_URL: instanceUrl,
      MCP_TIER_MAX: process.env.MCP_TIER_MAX || "T3",
      MCP_ALLOWED_SCOPES: "x_demo_scope,global",
      MCP_DENY_GLOBAL_WRITES: "false",
      MCP_ENFORCE_CHANGESET_SCOPE: "false",
    };
  }

  return {
    ...process.env,
    SN_INSTANCE_KEY: "default",
    SN_INSTANCE_URL: "https://example.service-now.com",
    SN_AUTH_MODE: "basic",
    SN_USERNAME: "mock",
    SN_PASSWORD: "mock",
    MCP_TIER_MAX: "T3",
    MCP_ALLOWED_SCOPES: "x_demo_scope,global",
    MCP_DENY_GLOBAL_WRITES: "false",
    MCP_ENFORCE_CHANGESET_SCOPE: "false",
  };
}

function runSmokeForG6() {
  const smokeEnv = resolveSmokeEnvForGate("G6");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/index.js", "--smoke"], {
      env: smokeEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Smoke run failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (error) {
        reject(new Error(`Unable to parse smoke output as JSON: ${error.message}`));
      }
    });
  });
}

function evaluateGateCriteria(payload) {
  const toolNames = (payload.tools || []).map((entry) => entry.name);

  return [
    {
      id: "E4",
      label: "Flow list/get/validate tooling available with validation summary",
      passed:
        payload?.smoke_summary?.e4_flow_list_get_validate_available === true &&
        ["sn.flow.list", "sn.flow.get", "sn.flow.validate"].every((name) => toolNames.includes(name)) &&
        payload?.flow_validate_result?.validation_summary?.rulepack?.id === "flows-v1",
    },
    {
      id: "E5",
      label: "Workflow list/get/validate tooling available with validation summary",
      passed:
        payload?.smoke_summary?.e5_workflow_list_get_validate_available === true &&
        ["sn.workflow.list", "sn.workflow.get", "sn.workflow.validate"].every((name) => toolNames.includes(name)) &&
        payload?.workflow_validate_result?.validation_summary?.rulepack?.id === "workflows-v1",
    },
    {
      id: "D-COVERAGE",
      label: "Validation coverage expanded with flow/workflow rulepack versions",
      passed:
        payload?.flow_validate_result?.validation_summary?.rulepack?.version === "1.0.0" &&
        payload?.workflow_validate_result?.validation_summary?.rulepack?.version === "1.0.0",
    },
  ];
}

function printChecklist(criteria) {
  console.log("\n=== Gate G6 End-User Validation ===");
  for (const item of criteria) {
    console.log(`${item.passed ? "✅" : "❌"} ${item.id}: ${item.label}`);
  }
  const passedCount = criteria.filter((item) => item.passed).length;
  const total = criteria.length;
  console.log(`\nSummary: ${passedCount}/${total} criteria passed`);
}

async function writeSummaryArtifact({ criteria, payload }) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const outputPath = path.join(artifactsDir, "g6-validation-summary.json");

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G6",
    passed: criteria.every((item) => item.passed),
    criteria,
    evidence: {
      smoke_summary: payload?.smoke_summary || {},
      tools_registered: (payload?.tools || []).map((entry) => entry.name),
      flow_validation: payload?.flow_validate_result || null,
      workflow_validation: payload?.workflow_validate_result || null,
    },
  };

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const payload = await runSmokeForG6();
  const criteria = evaluateGateCriteria(payload);
  printChecklist(criteria);
  const artifactPath = await writeSummaryArtifact({ criteria, payload });

  const failed = criteria.filter((item) => !item.passed);
  if (failed.length > 0) {
    console.log("\nGuidance: One or more Gate G6 checks failed.");
    for (const item of failed) {
      console.log(`- ${item.id}: inspect smoke output + ${artifactPath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Gate G6 validation succeeded.");
  console.log(`Report artifact: ${artifactPath}`);
}

main().catch((error) => {
  console.error("❌ Gate G6 validation script failed");
  console.error(error);
  process.exit(1);
});
