import { spawn } from "node:child_process";

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function parseArgs(argv = []) {
  const groupIndex = argv.indexOf("--group");
  const suiteIndex = argv.indexOf("--suite");
  const gateIndex = argv.indexOf("--gate");

  const group = groupIndex >= 0
    ? argv[groupIndex + 1]
    : suiteIndex >= 0
      ? argv[suiteIndex + 1]
      : "ci";

  const gate = gateIndex >= 0 ? argv[gateIndex + 1] : "";

  return {
    group: String(group || "ci").trim().toLowerCase(),
    gate: String(gate || "").trim().toLowerCase(),
  };
}

function runStep(step) {
  return new Promise((resolve) => {
    if (step.kind === "node") {
      const child = process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", step.command], {
            env: process.env,
            shell: false,
            stdio: "inherit",
          })
        : spawn("sh", ["-lc", step.command], {
            env: process.env,
            shell: false,
            stdio: "inherit",
          });

      child.on("close", (code) => {
        resolve({
          label: step.label,
          passed: code === 0,
          exitCode: code,
        });
      });
      return;
    }

    const child = spawn(npmExecutable(), ["run", step.script], {
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("close", (code) => {
      resolve({
        label: step.label,
        passed: code === 0,
        exitCode: code,
      });
    });
  });
}

function getGroupSteps(group) {
  const map = {
    fast: [
      { kind: "npm", script: "test:unit", label: "npm run test:unit" },
      { kind: "npm", script: "smoke:summary", label: "npm run smoke:summary" },
    ],
    ci: [
      { kind: "npm", script: "test:unit", label: "npm run test:unit" },
      { kind: "node", command: "node scripts/test-g2-validation.js", label: "node scripts/test-g2-validation.js" },
      { kind: "node", command: "node scripts/test-g2-integration.js", label: "node scripts/test-g2-integration.js" },
      { kind: "node", command: "node scripts/test-g3-fixtures.js", label: "node scripts/test-g3-fixtures.js" },
      { kind: "node", command: "node scripts/test-g4-validation.js", label: "node scripts/test-g4-validation.js" },
      { kind: "node", command: "node scripts/test-g5-validation.js", label: "node scripts/test-g5-validation.js" },
      { kind: "node", command: "node scripts/test-g6-validation.js", label: "node scripts/test-g6-validation.js" },
      {
        kind: "node",
        label: "coverage:tools (isolated port)",
        command: process.platform === "win32"
          ? "set MCP_SERVER_PORT=3015&& node scripts/test-tool-coverage.js"
          : "MCP_SERVER_PORT=3015 node scripts/test-tool-coverage.js",
      },
    ],
    gates: [
      { kind: "node", command: "node scripts/test-g4-ci-quality-gates.js", label: "node scripts/test-g4-ci-quality-gates.js" },
      {
        kind: "node",
        label: "coverage:tools (isolated port)",
        command: process.platform === "win32"
          ? "set MCP_SERVER_PORT=3015&& node scripts/test-tool-coverage.js"
          : "MCP_SERVER_PORT=3015 node scripts/test-tool-coverage.js",
      },
      { kind: "node", command: "node scripts/test-g7-readiness.js", label: "node scripts/test-g7-readiness.js" },
    ],
    live: [
      { kind: "node", command: "node scripts/test-live-connection.js", label: "node scripts/test-live-connection.js" },
      { kind: "node", command: "node scripts/test-live-mcp-transport.js", label: "node scripts/test-live-mcp-transport.js" },
      {
        kind: "node",
        label: "live gate: g2",
        command: process.platform === "win32"
          ? "set GATE_TEST_TARGET=live&&set ALLOW_LIVE_GATE_TESTS=true&&set ALLOW_LIVE_GATE_WRITES=true&&node scripts/test-g2-validation.js"
          : "GATE_TEST_TARGET=live ALLOW_LIVE_GATE_TESTS=true ALLOW_LIVE_GATE_WRITES=true node scripts/test-g2-validation.js",
      },
      {
        kind: "node",
        label: "live gate: g4 validation",
        command: process.platform === "win32"
          ? "set GATE_TEST_TARGET=live&&set ALLOW_LIVE_GATE_TESTS=true&&set ALLOW_LIVE_GATE_WRITES=true&&node scripts/test-g4-validation.js"
          : "GATE_TEST_TARGET=live ALLOW_LIVE_GATE_TESTS=true ALLOW_LIVE_GATE_WRITES=true node scripts/test-g4-validation.js",
      },
      { kind: "node", command: "node scripts/test-g4-integration-live.js", label: "node scripts/test-g4-integration-live.js" },
      {
        kind: "node",
        label: "live gate: g5",
        command: process.platform === "win32"
          ? "set GATE_TEST_TARGET=live&&set ALLOW_LIVE_GATE_TESTS=true&&set ALLOW_LIVE_GATE_WRITES=true&&node scripts/test-g5-validation.js"
          : "GATE_TEST_TARGET=live ALLOW_LIVE_GATE_TESTS=true ALLOW_LIVE_GATE_WRITES=true node scripts/test-g5-validation.js",
      },
      {
        kind: "node",
        label: "live gate: g6",
        command: process.platform === "win32"
          ? "set GATE_TEST_TARGET=live&&set ALLOW_LIVE_GATE_TESTS=true&&set ALLOW_LIVE_GATE_WRITES=true&&node scripts/test-g6-validation.js"
          : "GATE_TEST_TARGET=live ALLOW_LIVE_GATE_TESTS=true ALLOW_LIVE_GATE_WRITES=true node scripts/test-g6-validation.js",
      },
    ],
  };

  const steps = map[group];
  if (!steps) {
    throw new Error(`Unknown group '${group}'. Valid values: fast | ci | gates | live`);
  }
  return steps;
}

function gateToScript(gate) {
  const map = {
    g2: { kind: "node", command: "node scripts/test-g2-validation.js", label: "node scripts/test-g2-validation.js" },
    g4: { kind: "node", command: "node scripts/test-g4-validation.js", label: "node scripts/test-g4-validation.js" },
    g5: { kind: "node", command: "node scripts/test-g5-validation.js", label: "node scripts/test-g5-validation.js" },
    g6: { kind: "node", command: "node scripts/test-g6-validation.js", label: "node scripts/test-g6-validation.js" },
    g7: { kind: "node", command: "node scripts/test-g7-readiness.js", label: "node scripts/test-g7-readiness.js" },
  };
  return map[gate] || null;
}

async function runSteps(title, steps) {
  console.log(`\n=== ${title} ===`);
  for (const step of steps) {
    console.log(`\n--- Running: ${step.label} ---`);
    const result = await runStep(step);
    if (!result.passed) {
      console.error(`\n❌ ${title} failed at step: ${step.label}`);
      process.exit(result.exitCode || 1);
      return;
    }
  }
  console.log(`\n✅ ${title} completed successfully.`);
}

async function main() {
  const { group, gate } = parseArgs(process.argv.slice(2));

  if (gate) {
    const step = gateToScript(gate);
    if (!step) {
      throw new Error("Unknown gate. Valid values: g2 | g4 | g5 | g6 | g7");
    }
    await runSteps(`Gate ${gate.toUpperCase()} Runner`, [step]);
    return;
  }

  const steps = getGroupSteps(group);
  await runSteps(`Test Group: ${group}`, steps);
}

main().catch((error) => {
  console.error("❌ Unified test runner failed");
  console.error(error);
  process.exit(1);
});
