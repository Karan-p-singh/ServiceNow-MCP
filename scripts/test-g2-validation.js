import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function runSmokeForG2() {
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
  const expectedTools = [
    "sn.script.get",
    "sn.script.list",
    "sn.script.search",
    "sn.script.refs",
    "sn.script.deps",
    "sn.script.create",
    "sn.script.update",
  ];
  const toolNames = (payload.tools || []).map((entry) => entry.name);

  const criteria = [
    {
      id: "D1",
      label: "Validation runtime is deterministic",
      passed:
        payload?.smoke_summary?.d1_runtime_deterministic === true &&
        payload?.script_get_result?.validation_summary?.deterministic === true,
    },
    {
      id: "D2",
      label: "Script rulepack v1 metadata/version is attached",
      passed:
        payload?.smoke_summary?.d2_rulepack_versioned === true &&
        payload?.script_get_result?.validation_summary?.rulepack?.id === "scripts-v1" &&
        payload?.script_get_result?.validation_summary?.rulepack?.version === "1.0.0",
    },
    {
      id: "D3-CRITICAL",
      label: "CRITICAL findings block writes",
      passed: payload?.smoke_summary?.d3_critical_blocks_write === true,
    },
    {
      id: "D3-HIGH",
      label: "HIGH findings require/satisfy acknowledgment",
      passed: payload?.smoke_summary?.d3_high_ack_required_or_satisfied === true,
    },
    {
      id: "E1",
      label: "Script read/list/search lifecycle is available",
      passed:
        payload?.smoke_summary?.e1_get_list_search_available === true &&
        expectedTools.every((name) => toolNames.includes(name)),
    },
    {
      id: "E2",
      label: "refs/deps include evidence arrays",
      passed:
        payload?.smoke_summary?.e2_refs_deps_evidence_available === true &&
        Array.isArray(payload?.script_refs_result?.data?.references) &&
        Array.isArray(payload?.script_deps_result?.data?.dependencies),
    },
    {
      id: "E3",
      label: "create/update include audit metadata",
      passed:
        payload?.smoke_summary?.e3_create_update_auditable === true &&
        Boolean(payload?.script_create_allowed_result?.data?.audit?.action) &&
        Boolean(payload?.script_update_allowed_result?.data?.audit?.action),
    },
  ];

  return criteria;
}

function printChecklist(criteria) {
  console.log("\n=== Gate G2 End-User Validation ===");
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
  const outputPath = path.join(artifactsDir, "g2-validation-summary.json");

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G2",
    passed: criteria.every((item) => item.passed),
    criteria,
    evidence: {
      smoke_summary: payload?.smoke_summary || {},
      tools_registered: (payload?.tools || []).map((entry) => entry.name),
      validation_rulepack: payload?.script_get_result?.validation_summary?.rulepack || null,
      sample_error_codes: {
        script_create_blocked: (payload?.script_create_blocked_result?.errors || []).map((entry) => entry.code),
        script_update_blocked: (payload?.tier_blocked_result?.errors || []).map((entry) => entry.code),
      },
    },
  };

  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const payload = await runSmokeForG2();
  const criteria = evaluateGateCriteria(payload);
  printChecklist(criteria);
  const artifactPath = await writeSummaryArtifact({ criteria, payload });

  const failed = criteria.filter((item) => !item.passed);
  if (failed.length > 0) {
    console.log("\nGuidance: One or more Gate G2 checks failed.");
    for (const item of failed) {
      console.log(`- ${item.id}: inspect smoke output + ${artifactPath}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Gate G2 validation succeeded.");
  console.log(`Report artifact: ${artifactPath}`);
}

main().catch((error) => {
  console.error("❌ Gate G2 validation script failed");
  console.error(error);
  process.exit(1);
});
