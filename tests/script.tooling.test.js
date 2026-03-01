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
