import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { loadConfig } from "../../src/config.js";

export function resolveSmokeEnvForGate(gateId) {
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

export function runSmokeForGate(gateId) {
  const smokeEnv = resolveSmokeEnvForGate(gateId);
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
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Unable to parse smoke output as JSON: ${error.message}`));
      }
    });
  });
}

export function printChecklist(gateId, criteria) {
  console.log(`\n=== Gate ${gateId} End-User Validation ===`);
  for (const item of criteria) {
    console.log(`${item.passed ? "✅" : "❌"} ${item.id}: ${item.label}`);
  }
  const passedCount = criteria.filter((item) => item.passed).length;
  const total = criteria.length;
  console.log(`\nSummary: ${passedCount}/${total} criteria passed`);
}

export async function writeSummaryArtifact({ gateId, outputFileName, criteria, payload, evidence }) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const outputPath = path.join(artifactsDir, outputFileName);

  const report = {
    generated_at: new Date().toISOString(),
    gate: gateId,
    passed: criteria.every((item) => item.passed),
    criteria,
    evidence,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

export function reportGateResult({ gateId, criteria, artifactPath }) {
  const failed = criteria.filter((item) => !item.passed);
  if (failed.length > 0) {
    console.log(`\nGuidance: One or more Gate ${gateId} checks failed.`);
    for (const item of failed) {
      console.log(`- ${item.id}: inspect smoke output + ${artifactPath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ Gate ${gateId} validation succeeded.`);
  console.log(`Report artifact: ${artifactPath}`);
}
