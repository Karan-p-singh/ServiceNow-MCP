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

function runSmokeForG5() {
  const smokeEnv = resolveSmokeEnvForGate("G5");
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
      id: "F5",
      label: "Controlled T3 commit emits confirmation-aware high-risk audit trace and snapshot matrix",
      passed:
        payload?.smoke_summary?.f5_controlled_commit_contract_available === true &&
        toolNames.includes("sn.changeset.commit") &&
        payload?.controlled_commit_result?.data?.high_risk_audit_trace?.tier === "T3" &&
        Boolean(payload?.controlled_commit_result?.data?.snapshot_coverage_matrix),
    },
    {
      id: "F6",
      label: "Rollback plan generator splits restorable vs non-restorable and includes manual guidance",
      passed:
        payload?.smoke_summary?.f6_rollback_plan_generator_available === true &&
        toolNames.includes("sn.rollback.plan.generate") &&
        Array.isArray(payload?.rollback_plan_result?.data?.restorable) &&
        Array.isArray(payload?.rollback_plan_result?.data?.non_restorable) &&
        Array.isArray(payload?.rollback_plan_result?.data?.manual_steps),
    },
    {
      id: "G5-AUDIT",
      label: "High-risk operation audit trace includes operation/tier/confirm contract",
      passed:
        payload?.controlled_commit_result?.data?.high_risk_audit_trace?.operation === "sn.changeset.commit" &&
        payload?.controlled_commit_result?.data?.high_risk_audit_trace?.confirm_required === true &&
        payload?.controlled_commit_result?.data?.high_risk_audit_trace?.confirm_received === true &&
        typeof payload?.controlled_commit_result?.data?.high_risk_audit_trace?.reason === "string",
    },
  ];
}

function printChecklist(criteria) {
  console.log("\n=== Gate G5 End-User Validation ===");
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
  const outputPath = path.join(artifactsDir, "g5-validation-summary.json");

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G5",
    passed: criteria.every((item) => item.passed),
    criteria,
    evidence: {
      smoke_summary: payload?.smoke_summary || {},
      tools_registered: (payload?.tools || []).map((entry) => entry.name),
      controlled_commit: payload?.controlled_commit_result?.data || null,
      rollback_plan: payload?.rollback_plan_result?.data || null,
    },
  };

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const payload = await runSmokeForG5();
  const criteria = evaluateGateCriteria(payload);
  printChecklist(criteria);
  const artifactPath = await writeSummaryArtifact({ criteria, payload });

  const failed = criteria.filter((item) => !item.passed);
  if (failed.length > 0) {
    console.log("\nGuidance: One or more Gate G5 checks failed.");
    for (const item of failed) {
      console.log(`- ${item.id}: inspect smoke output + ${artifactPath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Gate G5 validation succeeded.");
  console.log(`Report artifact: ${artifactPath}`);
}

main().catch((error) => {
  console.error("❌ Gate G5 validation script failed");
  console.error(error);
  process.exit(1);
});
