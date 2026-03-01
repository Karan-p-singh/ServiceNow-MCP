import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEndpoint(url, attempts = 30, delayMs = 300) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (response.ok) {
        return true;
      }
    } catch {
      // retry
    }
    await delay(delayMs);
  }
  return false;
}

async function rpcCall(endpoint, id, method, params = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return response.json();
}

async function runServerScenario({ name, env, execute }) {
  const server = spawn(process.execPath, ["src/index.js"], {
    env: {
      ...process.env,
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  server.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const endpoint = `http://${env.MCP_SERVER_HOST || "localhost"}:${env.MCP_SERVER_PORT || "3011"}${env.MCP_SERVER_PATH || "/mcp"}`;

  try {
    const ready = await waitForEndpoint(endpoint);
    if (!ready) {
      throw new Error(`Scenario ${name}: MCP endpoint did not become ready (${endpoint})`);
    }
    return await execute(endpoint);
  } finally {
    server.kill("SIGTERM");
    await delay(250);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
    if (stderr.trim()) {
      console.log(`[${name}] server stderr:`);
      console.log(stderr.trim());
    }
    if (stdout.trim()) {
      console.log(`[${name}] server stdout:`);
      console.log(stdout.trim());
    }
  }
}

async function writeArtifact(report) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const outputPath = path.join(artifactsDir, "g2-integration-summary.json");
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const criteria = [];
  const baseEnv = {
    MCP_TRANSPORT: "http-sse",
    MCP_SERVER_HOST: "localhost",
    MCP_SERVER_PORT: "3011",
    MCP_SERVER_PATH: "/mcp",
    SN_INSTANCE_KEY: "default",
    SN_INSTANCE_URL: "https://example.service-now.com",
    SN_AUTH_MODE: "basic",
    SN_USERNAME: "mock",
    SN_PASSWORD: "mock",
    MCP_ALLOWED_SCOPES: "x_demo_scope",
    MCP_DENY_GLOBAL_WRITES: "true",
    MCP_ENFORCE_CHANGESET_SCOPE: "false",
    SN_COMPANION_ENABLED: "false",
    SN_COMPANION_MODE: "none",
  };

  const scenarioTier = await runServerScenario({
    name: "g2-tier-policy",
    env: {
      ...baseEnv,
      MCP_TIER_MAX: "T1",
    },
    execute: async (endpoint) => {
      const initialize = await rpcCall(endpoint, 1, "initialize", {});
      const list = await rpcCall(endpoint, 2, "tools/list", {});
      const tierBlocked = await rpcCall(endpoint, 3, "tools/call", {
        name: "sn.script.update",
        arguments: {
          scope: "x_demo_scope",
          sys_id: "abc",
          script: "function x(){}",
        },
      });
      const aclTrace = await rpcCall(endpoint, 4, "tools/call", {
        name: "sn.acl.trace",
        arguments: { table: "incident", operation: "read" },
      });
      return {
        initialize,
        list,
        tierBlocked,
        aclTrace,
      };
    },
  });

  const tierErrorCodes =
    scenarioTier?.tierBlocked?.result?.structuredContent?.errors?.map((entry) => entry.code) || [];
  criteria.push({
    id: "G2-INT-1",
    label: "Tier contract blocks T2 tool when tier_max=T1",
    passed: tierErrorCodes.includes("TIER_MAX_EXCEEDED"),
  });

  const discoveryMode = scenarioTier?.aclTrace?.result?.structuredContent?.data?.mode;
  criteria.push({
    id: "G2-INT-2",
    label: "Companion-disabled ACL trace returns discovery mode",
    passed: discoveryMode === "discovery",
  });

  const scenarioPolicy = await runServerScenario({
    name: "g2-policy-bundle",
    env: {
      ...baseEnv,
      MCP_TIER_MAX: "T3",
      MCP_DEPLOY_PROFILE: "dev_safe",
    },
    execute: async (endpoint) => {
      const policyBlocked = await rpcCall(endpoint, 5, "tools/call", {
        name: "sn.script.update",
        arguments: {
          scope: "global",
          sys_id: "abc",
          script: "var gr = new GlideRecord('incident');",
          acknowledged_findings: ["SCRIPT_GLIDERECORD_USAGE"],
        },
      });
      const bundleBlocked = await rpcCall(endpoint, 6, "tools/call", {
        name: "sn.changeset.commit",
        arguments: {
          changeset_sys_id: "a1111111b2222222c3333333d4444444",
          confirm: true,
          reason: "integration bundle check",
        },
      });
      return {
        policyBlocked,
        bundleBlocked,
      };
    },
  });

  const policyCodes =
    scenarioPolicy?.policyBlocked?.result?.structuredContent?.errors?.map((entry) => entry.code) || [];
  criteria.push({
    id: "G2-INT-3",
    label: "Policy contract blocks denied global writes",
    passed: policyCodes.includes("POLICY_BLOCKED"),
  });

  const bundleCodes =
    scenarioPolicy?.bundleBlocked?.result?.structuredContent?.errors?.map((entry) => entry.code) || [];
  criteria.push({
    id: "G2-INT-4",
    label: "Deploy profile/bundle policy can disable high-risk tools",
    passed: bundleCodes.includes("TOOL_DISABLED_BY_BUNDLE"),
  });

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G2",
    validation_type: "integration",
    passed: criteria.every((item) => item.passed),
    criteria,
    evidence: {
      tier_policy_scenario: {
        initialize_ok: Boolean(scenarioTier?.initialize?.result),
        listed_tools_count: scenarioTier?.list?.result?.tools?.length || 0,
        tier_error_codes: tierErrorCodes,
        acl_mode: discoveryMode,
      },
      policy_bundle_scenario: {
        policy_error_codes: policyCodes,
        bundle_error_codes: bundleCodes,
      },
    },
  };

  const artifactPath = await writeArtifact(report);

  console.log("\n=== Gate G2 Integration Validation ===");
  for (const criterion of criteria) {
    console.log(`${criterion.passed ? "✅" : "❌"} ${criterion.id}: ${criterion.label}`);
  }
  console.log(`\nReport artifact: ${artifactPath}`);

  if (!report.passed) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  const report = {
    generated_at: new Date().toISOString(),
    gate: "G2",
    validation_type: "integration",
    passed: false,
    error: {
      message: error?.message || String(error),
    },
  };
  const artifactPath = await writeArtifact(report);
  console.error("❌ Gate G2 integration validation failed");
  console.error(error);
  console.error(`Report artifact: ${artifactPath}`);
  process.exit(1);
});
