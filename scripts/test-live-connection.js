import { loadConfig } from "../src/config.js";
import { ServiceNowClient } from "../src/servicenow/client.js";

function section(title) {
  console.log("\n" + "=".repeat(80));
  console.log(title);
  console.log("=".repeat(80));
}

function pass(label, details = "") {
  console.log(`✅ PASS: ${label}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

function fail(label, details = "") {
  console.log(`❌ FAIL: ${label}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function assertPass(label, details = "") {
  pass(label, details);
  return true;
}

function assertFail(label, details = "") {
  fail(label, details);
  return false;
}

function check(condition, label, details = "") {
  if (condition) {
    return assertPass(label, details);
  }
  return assertFail(label, details);
}

function classifyError(error) {
  const code = error?.code || "UNKNOWN";
  if (code === "SN_AUTH_UNAUTHORIZED") return "auth_invalid";
  if (code === "SN_AUTH_FORBIDDEN") return "authz_or_acl";
  if (code === "SN_RATE_LIMITED") return "rate_limited";
  if (code === "SN_SERVER_ERROR") return "server_error";
  return "other";
}

function printRemediation(error) {
  section("Remediation Guidance");

  if (!error || typeof error !== "object") {
    console.log("- Unknown error shape. Re-run with verbose logging.");
    return;
  }

  const code = error.code || "UNKNOWN";
  if (code === "SN_AUTH_UNAUTHORIZED") {
    console.log("- Credentials/token are invalid or expired.");
    console.log("- Verify SN_AUTH_MODE and matching credentials in .env.");
    console.log("- If using OAuth token, refresh SN_OAUTH_ACCESS_TOKEN.");
    return;
  }

  if (code === "SN_AUTH_FORBIDDEN") {
    console.log("- Authenticated but not authorized for this API/table.");
    console.log("- Grant ServiceNow roles/ACLs required for Table API access.");
    console.log("- Ensure account can read target tables (e.g., v_plugin/sys_plugins, sys_script_include).");
    return;
  }

  if (code === "SN_RATE_LIMITED") {
    console.log("- Instance rate-limited request(s).");
    console.log("- Retry later or reduce request frequency.");
    return;
  }

  if (code === "SN_SERVER_ERROR") {
    console.log("- ServiceNow returned 5xx.");
    console.log("- Check instance health and retry.");
    return;
  }

  console.log("- Review error details below and adjust instance auth/policy accordingly:");
  console.log(pretty(error));
}

async function run() {
  const config = loadConfig();
  const client = new ServiceNowClient({ config });

  section("ServiceNow MCP Live Connectivity Test Script");
  console.log(`Instance URL: ${config.instanceUrl}`);
  console.log(`Default Instance Key: ${config.defaultInstance}`);
  console.log(`Tier Max: ${config.tierMax}`);
  console.log(`Auth Mode: ${config.instances?.[config.defaultInstance]?.auth?.mode || "unknown"}`);

  const results = {
    instanceInfo: false,
    tableAccess: false,
    scriptIncludeRead: false,
    authHandshake: false,
    statsEndpoint: false,
    metadataRead: false,
    paginationSemantics: false,
    capabilityConsistency: false,
    errorShapeContract: false,
  };

  let firstError = null;
  const diagnostics = [];

  async function runCheck({ key, name, runCheckFn }) {
    section(name);
    try {
      const output = await runCheckFn();
      results[key] = true;
      pass(name);
      if (output !== undefined) {
        console.log(pretty(output));
      }
      diagnostics.push({ key, status: "PASS", output });
    } catch (error) {
      firstError ??= error;
      const kind = classifyError(error);
      fail(name, `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`);
      console.log(pretty(error));
      diagnostics.push({ key, status: "FAIL", kind, error });
    }
  }

  await runCheck({
    key: "authHandshake",
    name: "Test 1: Basic Auth Handshake via sys_user",
    runCheckFn: async () => {
      const response = await client.request({
        method: "GET",
        path: "/api/now/table/sys_user",
        query: {
          sysparm_limit: 1,
          sysparm_fields: "sys_id,user_name,active",
        },
      });
      return {
        status: response.status,
        returned: Array.isArray(response?.data?.result) ? response.data.result.length : 0,
      };
    },
  });

  await runCheck({
    key: "statsEndpoint",
    name: "Test 2: REST Stats Endpoint (/api/now/stats/sys_user)",
    runCheckFn: async () => {
      const response = await client.request({
        method: "GET",
        path: "/api/now/stats/sys_user",
        query: {
          sysparm_count: true,
        },
      });
      return {
        status: response.status,
        keys: Object.keys(response?.data || {}),
      };
    },
  });

  await runCheck({
    key: "instanceInfo",
    name: "Test 3: Instance Info Capability Probe",
    runCheckFn: async () => {
      const info = await client.getInstanceInfo({});
      return {
        connectivity_source: info?.connectivity?.source || "unknown",
        plugin_count: Array.isArray(info?.capabilities?.plugins)
          ? info.capabilities.plugins.length
          : 0,
      };
    },
  });

  await runCheck({
    key: "tableAccess",
    name: "Test 4: Table API Access (v_plugin preferred, sys_plugins fallback)",
    runCheckFn: async () => {
      const candidates = ["v_plugin", "sys_plugins"];
      const failures = [];

      for (const tableName of candidates) {
        try {
          const table = await client.listTable({ table: tableName, limit: 3, offset: 0 });
          return {
            mode: "direct",
            table: tableName,
            returned: table.records.length,
            page: table.page,
          };
        } catch (error) {
          if (error?.code === "SN_AUTH_FORBIDDEN") {
            failures.push({
              table: tableName,
              code: error.code,
              message: error.message,
              status: error.status,
              path: error?.details?.path,
            });
            continue;
          }
          throw error;
        }
      }

      return {
        mode: "restricted_acl",
        warning:
          "ServiceNow account is authenticated but cannot read v_plugin/sys_plugins. Continuing with limited-access profile.",
        attempted_tables: candidates,
        failures,
      }
    },
  });

  await runCheck({
    key: "metadataRead",
    name: "Test 5: Metadata Read (sys_db_object)",
    runCheckFn: async () => {
      const table = await client.listTable({ table: "sys_db_object", limit: 2, offset: 0 });
      return {
        returned: table.records.length,
        page: table.page,
      };
    },
  });

  await runCheck({
    key: "scriptIncludeRead",
    name: "Test 6: Script Include Read (sys_script_include)",
    runCheckFn: async () => {
      const scriptByName = await client.getScriptInclude({ name: "x_demo_utility" });
      if (scriptByName.found) {
        return {
          mode: "name_lookup",
          found: true,
          query: scriptByName.query,
        };
      }

      const fallback = await client.listTable({ table: "sys_script_include", limit: 1, offset: 0 });
      return {
        mode: "fallback_limit_1",
        found: fallback.records.length > 0,
        returned: fallback.records.length,
      };
    },
  });

  section("Test 7: Pagination Semantics (sys_db_object limit=1 offset=0)");
  try {
    const page = await client.listTable({ table: "sys_db_object", limit: 1, offset: 0 });
    const pageMeta = page?.page || {};
    const expectedNext = pageMeta.has_more ? pageMeta.offset + pageMeta.returned : null;
    const ok =
      Number(pageMeta.limit) === 1 &&
      Number(pageMeta.offset) === 0 &&
      Number.isInteger(pageMeta.returned) &&
      pageMeta.returned >= 0 &&
      pageMeta.next_offset === expectedNext;

    results.paginationSemantics = ok;
    check(ok, "Pagination metadata contract", pageMeta);
    diagnostics.push({
      key: "paginationSemantics",
      status: ok ? "PASS" : "FAIL",
      output: pageMeta,
    });
  } catch (error) {
    firstError ??= error;
    results.paginationSemantics = false;
    assertFail(
      "Pagination metadata contract",
      `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`,
    );
    diagnostics.push({
      key: "paginationSemantics",
      status: "FAIL",
      kind: classifyError(error),
      error,
    });
  }

  section("Test 8: Capability Probe Consistency");
  try {
    const info = await client.getInstanceInfo({});
    const supports = info?.capabilities?.supports || {};
    const probes = info?.capabilities?.probes || {};
    const source = info?.connectivity?.source;
    const sourceValid = source === "mock" || source === "live";
    const supportsValid =
      typeof supports.oauth === "boolean" &&
      typeof supports.basic === "boolean" &&
      typeof supports.table_api === "boolean" &&
      typeof supports.pagination === "boolean";
    const tableProbeValid = !probes.table_api || ["ok", "failed"].includes(probes?.table_api?.status);
    const pluginsProbeValid = !probes.plugins || ["ok", "failed"].includes(probes?.plugins?.status);
    const ok = sourceValid && supportsValid && tableProbeValid && pluginsProbeValid;

    results.capabilityConsistency = ok;
    check(ok, "Capability probe contract", {
      source,
      supports,
      probes,
    });
    diagnostics.push({
      key: "capabilityConsistency",
      status: ok ? "PASS" : "FAIL",
      output: { source, supports, probes },
    });
  } catch (error) {
    firstError ??= error;
    results.capabilityConsistency = false;
    assertFail(
      "Capability probe contract",
      `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`,
    );
    diagnostics.push({
      key: "capabilityConsistency",
      status: "FAIL",
      kind: classifyError(error),
      error,
    });
  }

  section("Test 9: Error Shape Contract for Failed Checks");
  try {
    const failedDiagnostics = diagnostics.filter((entry) => entry.status === "FAIL");
    const shapeIssues = [];

    for (const entry of failedDiagnostics) {
      const error = entry.error;
      const hasCode = typeof error?.code === "string" && error.code.length > 0;
      const hasMessage = typeof error?.message === "string" && error.message.length > 0;
      const hasDetails = error?.details && typeof error.details === "object";
      const hasInstance = Boolean(error?.details?.instance);
      const hasPath = Boolean(error?.details?.path);
      if (!hasCode || !hasMessage || !hasDetails || !hasInstance || !hasPath) {
        shapeIssues.push({
          key: entry.key,
          hasCode,
          hasMessage,
          hasDetails,
          hasInstance,
          hasPath,
          error,
        });
      }
    }

    const ok = shapeIssues.length === 0;
    results.errorShapeContract = ok;
    check(ok, "Normalized error shape contract", {
      failed_checks: failedDiagnostics.length,
      shape_issues: shapeIssues,
    });
    diagnostics.push({
      key: "errorShapeContract",
      status: ok ? "PASS" : "FAIL",
      output: {
        failed_checks: failedDiagnostics.length,
        shape_issues: shapeIssues,
      },
    });
  } catch (error) {
    firstError ??= error;
    results.errorShapeContract = false;
    assertFail(
      "Normalized error shape contract",
      `${error?.code || "UNKNOWN"}: ${error?.message || String(error)}`,
    );
    diagnostics.push({
      key: "errorShapeContract",
      status: "FAIL",
      kind: classifyError(error),
      error,
    });
  }

  section("Summary");
  console.log(pretty(results));
  console.log(pretty({
    diagnostics,
  }));

  const allPassed = Object.values(results).every(Boolean);
  if (!allPassed) {
    printRemediation(firstError);
    process.exitCode = 1;
    return;
  }

  pass("All live connectivity tests passed");
}

run().catch((error) => {
  fail("Unhandled runner error", error instanceof Error ? error.message : String(error));
  console.log(pretty(error));
  process.exit(1);
});
