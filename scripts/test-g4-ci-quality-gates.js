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
  const outputPath = path.join(artifactsDir, "g4-ci-quality-summary.json");
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const checks = [
    { id: "UNIT", label: "Unit tests", args: ["run", "test"] },
    { id: "G2-VALIDATION", label: "Gate G2 checklist", args: ["run", "test:g2"] },
    { id: "G2-INTEGRATION", label: "Gate G2 integration", args: ["run", "test:g2:integration"] },
    { id: "G3-FIXTURES", label: "Gate G3 golden fixtures", args: ["run", "test:g3:fixtures"] },
    { id: "G4-VALIDATION", label: "Gate G4 checklist", args: ["run", "test:g4"] },
    { id: "G5-VALIDATION", label: "Gate G5 checklist", args: ["run", "test:g5"] },
    { id: "G6-VALIDATION", label: "Gate G6 checklist", args: ["run", "test:g6"] },
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

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G4",
    validation_type: "ci_quality_gates",
    passed: results.every((item) => item.passed),
    checks: results.map((item) => ({
      id: item.id,
      label: item.label,
      passed: item.passed,
      exit_code: item.exit_code,
    })),
  };

  const artifactPath = await writeArtifact(report);
  console.log("\n=== Gate G4 CI Quality Validation Summary ===");
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
    gate: "G4",
    validation_type: "ci_quality_gates",
    passed: false,
    error: {
      message: error?.message || String(error),
    },
  };
  const artifactPath = await writeArtifact(report);
  console.error("❌ Gate G4 CI quality validation failed");
  console.error(error);
  console.error(`Report artifact: ${artifactPath}`);
  process.exit(1);
});
