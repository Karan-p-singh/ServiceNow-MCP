import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function runSmokeForG4() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/index.js", "--smoke"], {
      env: {
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
      },
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
  const validReasonCodes = ["CAPTURED_IN_TARGET_SET", "CAPTURED_IN_DIFFERENT_SET", "NOT_CAPTURED"];

  return [
    {
      id: "F1",
      label: "Changeset read tooling list/get/contents/export is registered and smoke-available",
      passed:
        payload?.smoke_summary?.f1_changeset_read_tools_available === true &&
        ["sn.changeset.list", "sn.changeset.get", "sn.changeset.contents", "sn.changeset.export"]
          .every((name) => toolNames.includes(name)),
    },
    {
      id: "F2",
      label: "Gap detection exposes confidence-tier evidence buckets",
      passed:
        payload?.smoke_summary?.f2_changeset_gap_detection_available === true &&
        toolNames.includes("sn.changeset.gaps") &&
        Array.isArray(payload?.changeset_gaps_result?.data?.hard_dependencies) &&
        Array.isArray(payload?.changeset_gaps_result?.data?.soft_dependencies) &&
        Array.isArray(payload?.changeset_gaps_result?.data?.heuristic_candidates),
    },
    {
      id: "F3",
      label: "Capture verification emits deterministic reason codes",
      passed:
        payload?.smoke_summary?.f3_capture_verify_reason_codes_deterministic === true &&
        toolNames.includes("sn.updateset.capture.verify") &&
        validReasonCodes.includes(payload?.capture_verify_result?.data?.reason_code),
    },
  ];
}

function printChecklist(criteria) {
  console.log("\n=== Gate G4 End-User Validation ===");
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
  const outputPath = path.join(artifactsDir, "g4-validation-summary.json");

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G4",
    passed: criteria.every((item) => item.passed),
    criteria,
    evidence: {
      smoke_summary: payload?.smoke_summary || {},
      tools_registered: (payload?.tools || []).map((entry) => entry.name),
      changeset_gaps_counts: {
        hard: payload?.changeset_gaps_result?.data?.hard_dependencies?.length || 0,
        soft: payload?.changeset_gaps_result?.data?.soft_dependencies?.length || 0,
        heuristic: payload?.changeset_gaps_result?.data?.heuristic_candidates?.length || 0,
      },
      capture_verify: payload?.capture_verify_result?.data || null,
    },
  };

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const payload = await runSmokeForG4();
  const criteria = evaluateGateCriteria(payload);
  printChecklist(criteria);
  const artifactPath = await writeSummaryArtifact({ criteria, payload });

  const failed = criteria.filter((item) => !item.passed);
  if (failed.length > 0) {
    console.log("\nGuidance: One or more Gate G4 checks failed.");
    for (const item of failed) {
      console.log(`- ${item.id}: inspect smoke output + ${artifactPath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Gate G4 validation succeeded.");
  console.log(`Report artifact: ${artifactPath}`);
}

main().catch((error) => {
  console.error("❌ Gate G4 validation script failed");
  console.error(error);
  process.exit(1);
});
