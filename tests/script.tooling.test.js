import test from "node:test";
import assert from "node:assert/strict";
import { ServiceNowClient } from "../src/servicenow/client.js";

function createMockClient() {
  return new ServiceNowClient({
    config: {
      defaultInstance: "default",
      instances: {
        default: {
          key: "default",
          instanceUrl: "https://example.service-now.com",
          auth: {
            mode: "basic",
            username: "mock",
            password: "mock",
          },
        },
      },
      retry: {
        maxAttempts: 1,
        baseDelayMs: 1,
        requestTimeoutMs: 1000,
      },
    },
  });
}

test("script tooling list/search/get returns paginated mock data", async () => {
  const client = createMockClient();

  const listPage = await client.listScriptIncludes({ limit: 1, offset: 0 });
  assert.equal(listPage.records.length, 1);
  assert.equal(listPage.page.limit, 1);
  assert.equal(listPage.page.has_more, true);

  const searchPage = await client.searchScriptIncludes({ term: "eval", limit: 5, offset: 0 });
  assert.equal(searchPage.records.length >= 1, true);
  assert.equal(searchPage.records.some((record) => String(record.script || "").includes("eval(")), true);

  const script = await client.getScriptInclude({ name: "x_demo_utility" });
  assert.equal(script.found, true);
  assert.equal(script.script.name, "x_demo_utility");
});

test("script tooling create/update returns auditable record payloads", async () => {
  const client = createMockClient();

  const created = await client.createScriptInclude({
    record: {
      name: "x_created_sample",
      script: "gs.info('hello');",
      description: "created in test",
      scope: "x_demo_scope",
    },
  });

  assert.equal(created.created, true);
  assert.equal(created.record.sys_id, "mock-created-script-include");
  assert.equal(created.record.name, "x_created_sample");

  const updated = await client.updateScriptInclude({
    sysId: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
    changes: {
      script: "gs.info('updated');",
      description: "updated in test",
    },
  });

  assert.equal(updated.updated, true);
  assert.equal(updated.record.sys_id, "9f2b2d3fdb001010a1b2c3d4e5f6a7b8");
  assert.equal(updated.record.description, "updated in test");
});

test("changeset read tooling list/get/contents/export returns structured mock payloads", async () => {
  const client = createMockClient();

  const listPage = await client.listChangesets({ limit: 1, offset: 0 });
  assert.equal(listPage.records.length, 1);
  assert.equal(listPage.page.limit, 1);
  assert.equal(listPage.page.has_more, true);

  const getByName = await client.getChangeset({ name: "u_demo_changeset" });
  assert.equal(getByName.found, true);
  assert.equal(getByName.record.name, "u_demo_changeset");

  const getById = await client.getChangeset({
    sysId: "a1111111b2222222c3333333d4444444",
  });
  assert.equal(getById.found, true);
  assert.equal(getById.record.sys_id, "a1111111b2222222c3333333d4444444");

  const contents = await client.listChangesetContents({
    changesetSysId: "a1111111b2222222c3333333d4444444",
    limit: 10,
    offset: 0,
  });
  assert.equal(contents.records.length >= 1, true);
  assert.equal(contents.records.every((record) => record.update_set === "a1111111b2222222c3333333d4444444"), true);

  const exported = await client.exportChangeset({
    sysId: "a1111111b2222222c3333333d4444444",
    format: "xml",
  });
  assert.equal(exported.exported, true);
  assert.equal(exported.format, "xml");
  assert.equal(exported.download_url.includes("sys_update_set.do?XML"), true);
});

test("changeset gap detection returns confidence-tier dependency buckets", async () => {
  const client = createMockClient();

  const result = await client.detectChangesetGaps({
    changesetSysId: "a1111111b2222222c3333333d4444444",
    limit: 20,
    offset: 0,
  });

  assert.equal(result.changeset_sys_id, "a1111111b2222222c3333333d4444444");
  assert.equal(result.scanned_entries >= 1, true);
  assert.equal(Array.isArray(result.hard_dependencies), true);
  assert.equal(Array.isArray(result.soft_dependencies), true);
  assert.equal(Array.isArray(result.heuristic_candidates), true);

  assert.equal(
    result.hard_dependencies.some(
      (entry) => entry.reason_code === "XML_TARGET_REFERENCE" && entry.confidence === "high",
    ),
    true,
  );
  assert.equal(
    result.soft_dependencies.some(
      (entry) => entry.reason_code === "SCRIPT_INCLUDE_NAME_PATTERN" && entry.confidence === "medium",
    ),
    true,
  );
  assert.equal(
    result.heuristic_candidates.some(
      (entry) => entry.reason_code === "GENERIC_SYS_ID_PATTERN" && entry.confidence === "low",
    ),
    true,
  );
});

test("changeset capture verification returns deterministic reason codes", async () => {
  const client = createMockClient();

  const capturedInTarget = await client.verifyChangesetCapture({
    table: "sys_script_include",
    sysId: "9f2b2d3fdb001010a1b2c3d4e5f6a7b8",
    changesetSysId: "a1111111b2222222c3333333d4444444",
  });
  assert.equal(capturedInTarget.captured, true);
  assert.equal(capturedInTarget.captured_in_target_set, true);
  assert.equal(capturedInTarget.reason_code, "CAPTURED_IN_TARGET_SET");

  const capturedInDifferent = await client.verifyChangesetCapture({
    table: "sys_properties",
    sysId: "1234567890abcdef1234567890abcdef",
    changesetSysId: "a1111111b2222222c3333333d4444444",
  });
  assert.equal(capturedInDifferent.captured, true);
  assert.equal(capturedInDifferent.captured_in_target_set, false);
  assert.equal(capturedInDifferent.reason_code, "CAPTURED_IN_DIFFERENT_SET");

  const notCaptured = await client.verifyChangesetCapture({
    table: "sys_script_include",
    sysId: "ffffffffffffffffffffffffffffffff",
    changesetSysId: "a1111111b2222222c3333333d4444444",
  });
  assert.equal(notCaptured.captured, false);
  assert.equal(notCaptured.captured_in_target_set, false);
  assert.equal(notCaptured.reason_code, "NOT_CAPTURED");
});
