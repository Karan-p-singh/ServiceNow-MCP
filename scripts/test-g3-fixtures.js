import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const FIXTURE_PATH = path.join(process.cwd(), "tests", "fixtures", "g3-smoke-contract.snapshot.json");

function runSmoke() {
  const env = {
    ...process.env,
    SN_INSTANCE_KEY: "default",
    SN_INSTANCE_URL: "https://example.service-now.com",
    SN_AUTH_MODE: "basic",
    SN_USERNAME: "mock",
    SN_PASSWORD: "mock",
    MCP_TIER_MAX: "T3",
    MCP_ALLOWED_SCOPES: "x_demo_scope",
    MCP_DENY_GLOBAL_WRITES: "true",
    MCP_ENFORCE_CHANGESET_SCOPE: "false",
    SN_COMPANION_ENABLED: "false",
    SN_COMPANION_MODE: "none",
  };

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/index.js", "--smoke"], {
      env,
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
        reject(new Error(`Failed to parse smoke output JSON: ${error.message}`));
      }
    });
  });
}

function buildContractSnapshot(smokePayload) {
  const toolNames = (smokePayload?.tools || []).map((tool) => tool.name);
  const smokeSummary = smokePayload?.smoke_summary || {};
  const smokeSummaryKeys = Object.keys(smokeSummary).sort();

  return {
    tools_registered: toolNames,
    smoke_summary_keys: smokeSummaryKeys,
    smoke_summary_type_contract: Object.fromEntries(
      smokeSummaryKeys.map((key) => [key, typeof smokeSummary[key]]),
    ),
    envelope_keys: Object.keys(smokePayload?.smoke_result || {}).sort(),
    deterministic_error_codes: {
      policy_blocked: (smokePayload?.policy_blocked_result?.errors || []).map((entry) => entry.code),
      t3_blocked: (smokePayload?.t3_blocked_result?.errors || []).map((entry) => entry.code),
      script_create_blocked: (smokePayload?.script_create_blocked_result?.errors || []).map((entry) => entry.code),
    },
    rulepack_contract: {
      script: smokePayload?.script_get_result?.validation_summary?.rulepack || null,
      flow: smokePayload?.flow_validate_result?.validation_summary?.rulepack || null,
      workflow: smokePayload?.workflow_validate_result?.validation_summary?.rulepack || null,
    },
  };
}

async function writeArtifact(report) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const outputPath = path.join(artifactsDir, "g3-fixtures-summary.json");
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const smokePayload = await runSmoke();
  const currentSnapshot = buildContractSnapshot(smokePayload);

  let expectedSnapshot = null;
  try {
    expectedSnapshot = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
  } catch {
    expectedSnapshot = null;
  }

  const updateFixtures = String(process.env.UPDATE_G3_FIXTURES || "").toLowerCase() === "true";
  if (!expectedSnapshot || updateFixtures) {
    await fs.mkdir(path.dirname(FIXTURE_PATH), { recursive: true });
    await fs.writeFile(FIXTURE_PATH, `${JSON.stringify(currentSnapshot, null, 2)}\n`, "utf8");
    expectedSnapshot = currentSnapshot;
  }

  let passed = true;
  let mismatch = null;
  try {
    assert.deepEqual(currentSnapshot, expectedSnapshot);
  } catch (error) {
    passed = false;
    mismatch = error?.message || String(error);
  }

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G3",
    validation_type: "golden_fixtures",
    fixture_path: FIXTURE_PATH,
    passed,
    mismatch,
    current_snapshot: currentSnapshot,
  };

  const artifactPath = await writeArtifact(report);
  console.log("\n=== Gate G3 Fixture Validation ===");
  console.log(`${passed ? "✅" : "❌"} Snapshot comparison against ${FIXTURE_PATH}`);
  console.log(`Report artifact: ${artifactPath}`);

  if (!passed) {
    console.log("\nTip: set UPDATE_G3_FIXTURES=true to refresh snapshots after intentional contract changes.");
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const report = {
    generated_at: new Date().toISOString(),
    gate: "G3",
    validation_type: "golden_fixtures",
    passed: false,
    error: {
      message: error?.message || String(error),
    },
  };
  const artifactPath = await writeArtifact(report);
  console.error("❌ Gate G3 fixture validation failed");
  console.error(error);
  console.error(`Report artifact: ${artifactPath}`);
  process.exit(1);
});
