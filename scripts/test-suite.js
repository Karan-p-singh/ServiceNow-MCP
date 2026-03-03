import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv = []) {
  const suiteFlagIndex = argv.indexOf("--suite");
  const suite = suiteFlagIndex >= 0 ? argv[suiteFlagIndex + 1] : null;

  const gateFlagIndex = argv.indexOf("--gate");
  const gate = gateFlagIndex >= 0 ? argv[gateFlagIndex + 1] : null;

  const isLive = argv.includes("--live");

  return {
    suite: suite ? String(suite).trim().toLowerCase() : (gate ? null : "ci"),
    gate: gate ? String(gate).trim().toLowerCase() : null,
    isLive,
  };
}

const STEP_DEFINITIONS = {
  "test": { cmd: process.execPath, args: ["--test", "tests/**/*.test.js"] },
  "smoke:summary": { cmd: process.execPath, args: ["src/index.js", "--smoke-summary"] },
  "test:coverage:tools": {
    cmd: process.execPath,
    args: ["scripts/test-tool-coverage.js"],
    env: { MCP_SERVER_PORT: "3015" }
  },
  "test:g2": { cmd: process.execPath, args: ["scripts/test-g2-validation.js"] },
  "test:g2:integration": { cmd: process.execPath, args: ["scripts/test-g2-integration.js"] },
  "test:g3:fixtures": { cmd: process.execPath, args: ["scripts/test-g3-fixtures.js"] },
  "test:g4": { cmd: process.execPath, args: ["scripts/test-g4-validation.js"] },
  "test:g4:ci": { cmd: process.execPath, args: ["scripts/test-g4-ci-quality-gates.js"] },
  "test:g4:live:gate": { cmd: process.execPath, args: ["scripts/test-g4-validation.js"], liveEnv: true },
  "test:g4:live": { cmd: process.execPath, args: ["scripts/test-g4-integration-live.js"] },
  "test:g5": { cmd: process.execPath, args: ["scripts/test-g5-validation.js"] },
  "test:g6": { cmd: process.execPath, args: ["scripts/test-g6-validation.js"] },
  "test:g7": { cmd: process.execPath, args: ["scripts/test-g7-readiness.js"] },
  "test:live": { cmd: process.execPath, args: ["scripts/test-live-connection.js"] },
  "test:live:mcp": { cmd: process.execPath, args: ["scripts/test-live-mcp-transport.js"] },
};

function runStep(stepName, forceLive = false) {
  return new Promise((resolve) => {
    const stepDef = STEP_DEFINITIONS[stepName];
    if (!stepDef) {
      console.error(`Unknown step definition: ${stepName}`);
      resolve({ stepName, passed: false, exitCode: 1 });
      return;
    }

    const env = { ...process.env, ...(stepDef.env || {}) };
    if (forceLive || stepDef.liveEnv) {
      env.GATE_TEST_TARGET = "live";
      env.ALLOW_LIVE_GATE_TESTS = "true";
      env.ALLOW_LIVE_GATE_WRITES = "true";
    }

    const child = spawn(stepDef.cmd, stepDef.args, {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("close", (code) => {
      resolve({
        stepName,
        passed: code === 0,
        exitCode: code,
      });
    });
  });
}

function getSuiteSteps(suite) {
  if (suite === "fast") {
    return ["test", "smoke:summary"];
  }

  if (suite === "ci") {
    return [
      "test",
      "test:g2",
      "test:g2:integration",
      "test:g3:fixtures",
      "test:g4",
      "test:g5",
      "test:g6",
      "test:coverage:tools",
    ];
  }

  if (suite === "gates") {
    return ["test:g4:ci", "test:coverage:tools", "test:g7"];
  }

  if (suite === "live") {
    // Corresponds to legacy test:gates:g1-g6:live
    return [
      { name: "test:live" },
      { name: "test:live:mcp" },
      { name: "test:g2", live: true },
      { name: "test:g4:live:gate" },
      { name: "test:g4:live" },
      { name: "test:g5", live: true },
      { name: "test:g6", live: true }
    ];
  }

  throw new Error(`Unknown suite '${suite}'. Valid values: fast | ci | gates | live`);
}

async function main() {
  const { suite, gate, isLive } = parseArgs(process.argv.slice(2));

  let steps = [];
  if (gate) {
    const stepName = `test:${gate}`;
    if (!STEP_DEFINITIONS[stepName]) {
      console.error(`❌ Unknown gate '${gate}'. Step '${stepName}' not found.`);
      process.exit(1);
    }
    steps = [{ name: stepName, live: isLive }];
    console.log(`\n=== Running Gate: ${gate}${isLive ? " (LIVE)" : ""} ===`);
  } else if (suite) {
    const rawSteps = getSuiteSteps(suite);
    steps = rawSteps.map(s => (typeof s === "string" ? { name: s, live: false } : s));
    console.log(`\n=== Test Suite: ${suite} ===`);
  } else {
    console.error("❌ No valid suite or gate specified.");
    process.exit(1);
  }

  for (const step of steps) {
    const liveSuffix = step.live || STEP_DEFINITIONS[step.name].liveEnv ? " (LIVE)" : "";
    console.log(`\n--- Running: ${step.name}${liveSuffix} ---`);
    const result = await runStep(step.name, step.live);
    if (!result.passed) {
      console.error(`\n❌ Failed at step: ${step.name}`);
      process.exit(result.exitCode || 1);
      return;
    }
  }

  if (suite) {
    console.log(`\n✅ Suite '${suite}' completed successfully.`);
  } else if (gate) {
    console.log(`\n✅ Gate '${gate}' completed successfully.`);
  }
}

main().catch((error) => {
  console.error("❌ Test suite runner failed");
  console.error(error);
  process.exit(1);
});
