import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: process.env,
      shell: process.platform === "win32",
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

    child.on("close", (code) => {
      resolve({
        passed: code === 0,
        exit_code: code,
        stdout,
        stderr,
      });
    });
  });
}

async function writeArtifact(report) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const outputPath = path.join(artifactsDir, "g7-readiness-summary.json");
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const checks = [
    { id: "G4-CI", label: "CI quality gate aggregation", args: ["run", "test:g4:ci"] },
    { id: "G7-DOCS", label: "Gate 7 docs package exists", args: ["run", "test", "--", "tests/tooling.policy.test.js"] },
  ];

  const results = [];
  for (const check of checks) {
    console.log(`\n=== ${check.id}: ${check.label} ===`);
    const result = await runCommand(npmExecutable(), check.args);
    results.push({
      id: check.id,
      label: check.label,
      ...result,
    });
    console.log(`${result.passed ? "✅" : "❌"} ${check.id}`);
    if (!result.passed) {
      console.log(result.stderr || result.stdout);
    }
  }

  const requiredDocs = [
    "docs/SECURITY_MODEL_AND_GOVERNANCE.md",
    "docs/OPERATIONS_AND_RELEASE.md",
    "docs/PRODUCT_AND_DELIVERY_MASTER.md",
  ];
  const docsStatus = [];
  for (const docPath of requiredDocs) {
    try {
      await fs.access(path.join(process.cwd(), docPath));
      docsStatus.push({ path: docPath, present: true });
    } catch {
      docsStatus.push({ path: docPath, present: false });
    }
  }

  const docsPassed = docsStatus.every((entry) => entry.present);
  results.push({
    id: "DOCS-PACK",
    label: "H3/H4 docs pack files present",
    passed: docsPassed,
    exit_code: docsPassed ? 0 : 1,
  });

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G7",
    validation_type: "enterprise_readiness",
    passed: results.every((item) => item.passed),
    checks: results.map((item) => ({
      id: item.id,
      label: item.label,
      passed: item.passed,
      exit_code: item.exit_code,
    })),
    docs_status: docsStatus,
  };

  const artifactPath = await writeArtifact(report);

  console.log("\n=== Gate G7 Readiness Summary ===");
  for (const check of report.checks) {
    console.log(`${check.passed ? "✅" : "❌"} ${check.id}: ${check.label}`);
  }
  console.log(`\nReport artifact: ${artifactPath}`);

  if (!report.passed) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const report = {
    generated_at: new Date().toISOString(),
    gate: "G7",
    validation_type: "enterprise_readiness",
    passed: false,
    error: {
      message: error?.message || String(error),
    },
  };
  const artifactPath = await writeArtifact(report);
  console.error("❌ Gate G7 readiness validation failed");
  console.error(error);
  console.error(`Report artifact: ${artifactPath}`);
  process.exit(1);
});
