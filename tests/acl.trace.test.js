import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runSmoke(extraEnv = {}) {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["src/index.js", "--smoke"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SN_INSTANCE_URL: "https://example.service-now.com",
        SN_AUTH_MODE: "basic",
        SN_USERNAME: "mock",
        SN_PASSWORD: "mock",
        ...extraEnv,
      },
      maxBuffer: 1024 * 1024 * 4,
    },
  );

  return JSON.parse(stdout);
}

test("sn.acl.trace returns discovery mode when companion is disabled", async () => {
  const payload = await runSmoke({
    SN_COMPANION_ENABLED: "false",
  });

  assert.equal(payload.acl_trace_result.tool, "sn.acl.trace");
  assert.equal(payload.acl_trace_result.data.mode, "discovery");
  assert.equal(payload.acl_trace_result.data.degraded_reason_code, "COMPANION_DISABLED_BY_CONFIG");
  assert.equal(Array.isArray(payload.acl_trace_result.data.limitations), true);
});

test("sn.acl.trace returns authoritative mode when companion is enabled and compatible", async () => {
  const payload = await runSmoke({
    SN_COMPANION_ENABLED: "true",
    SN_COMPANION_MIN_VERSION: "1.0.0",
  });

  assert.equal(payload.acl_trace_result.tool, "sn.acl.trace");
  assert.equal(payload.acl_trace_result.data.mode, "authoritative");
  assert.equal(payload.acl_trace_result.data.confidence, "high");
  assert.equal(Array.isArray(payload.acl_trace_result.data.evaluated_acls), true);
});

test("sn.acl.trace falls back to discovery for outdated companion", async () => {
  const payload = await runSmoke({
    SN_COMPANION_ENABLED: "true",
    SN_COMPANION_MIN_VERSION: "2.0.0",
  });

  assert.equal(payload.acl_trace_result.data.mode, "discovery");
  assert.equal(payload.acl_trace_result.data.degraded_reason_code, "COMPANION_OUTDATED");
});
