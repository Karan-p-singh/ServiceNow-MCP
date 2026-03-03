import { spawn } from "node:child_process";

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function parseArgs(argv = []) {
  const suiteFlagIndex = argv.indexOf("--suite");
  const suite = suiteFlagIndex >= 0 ? argv[suiteFlagIndex + 1] : "ci";
  return {
    suite: String(suite || "ci").trim().toLowerCase(),
  };
}

function runNpmScript(scriptName) {
  return new Promise((resolve) => {
    const isCoverageStep = scriptName === "test:coverage:tools";
    const child = isCoverageStep
      ? process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", "set MCP_SERVER_PORT=3015&& node scripts/test-tool-coverage.js"], {
            env: process.env,
            shell: false,
            stdio: "inherit",
          })
        : spawn("sh", ["-lc", "MCP_SERVER_PORT=3015 node scripts/test-tool-coverage.js"], {
            env: process.env,
            shell: false,
            stdio: "inherit",
          })
      : spawn(npmExecutable(), ["run", scriptName], {
          env: process.env,
          shell: process.platform === "win32",
          stdio: "inherit",
        });

    child.on("close", (code) => {
      resolve({
        scriptName,
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
    return ["test", "test:g2", "test:g2:integration", "test:g3:fixtures", "test:g4", "test:g5", "test:g6", "test:coverage:tools"];
  }

  if (suite === "gates") {
    return ["test:g4:ci", "test:coverage:tools", "test:g7"];
  }

  if (suite === "live") {
    return ["test:gates:g1-g6:live"];
  }

  throw new Error(
    `Unknown suite '${suite}'. Valid values: fast | ci | gates | live`,
  );
}

async function main() {
  const { suite } = parseArgs(process.argv.slice(2));
  const steps = getSuiteSteps(suite);

  console.log(`\n=== Test Suite: ${suite} ===`);

  for (const step of steps) {
    console.log(`\n--- Running: npm run ${step} ---`);
    const result = await runNpmScript(step);
    if (!result.passed) {
      console.error(`\n❌ Suite '${suite}' failed at step: npm run ${step}`);
      process.exit(result.exitCode || 1);
      return;
    }
  }

  console.log(`\n✅ Suite '${suite}' completed successfully.`);
}

main().catch((error) => {
  console.error("❌ Test suite runner failed");
  console.error(error);
  process.exit(1);
});
