import test from "node:test";
import assert from "node:assert/strict";
import { CompanionClient, compareSemver } from "../src/servicenow/companion-client.js";
import { ServiceNowClient } from "../src/servicenow/client.js";

function createMockServiceNowClient() {
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

test("compareSemver compares version tuples deterministically", () => {
  assert.equal(compareSemver("1.2.0", "1.0.0"), 1);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.equal(compareSemver("0.9.9", "1.0.0"), -1);
  assert.equal(compareSemver("invalid", "1.0.0"), null);
});

test("CompanionClient getStatus returns disabled when companion is off", async () => {
  const companion = new CompanionClient({
    serviceNowClient: createMockServiceNowClient(),
    config: {
      companion: {
        enabled: false,
        minVersion: "1.0.0",
      },
    },
  });

  const status = await companion.getStatus();
  assert.equal(status.enabled, false);
  assert.equal(status.status, "disabled");
  assert.equal(status.degraded_reason_code, "COMPANION_DISABLED_BY_CONFIG");
});

test("CompanionClient getStatus resolves available for compatible health payload", async () => {
  const companion = new CompanionClient({
    serviceNowClient: createMockServiceNowClient(),
    config: {
      companion: {
        enabled: true,
        minVersion: "1.0.0",
        basePath: "/api/x_mcp_companion/v1",
      },
    },
  });

  const status = await companion.getStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.status, "available");
  assert.equal(status.compatible, true);
  assert.equal(status.version, "1.2.0");
  assert.equal(status.degraded_reason_code, null);
});

test("CompanionClient evaluateAcl returns authoritative contract", async () => {
  const companion = new CompanionClient({
    serviceNowClient: createMockServiceNowClient(),
    config: {
      companion: {
        enabled: true,
        minVersion: "1.0.0",
        basePath: "/api/x_mcp_companion/v1",
      },
    },
  });

  const result = await companion.evaluateAcl({
    input: {
      table: "incident",
      operation: "read",
      user: "mock-user",
    },
  });

  assert.equal(result.mode, "authoritative");
  assert.equal(result.confidence, "high");
  assert.equal(["allow", "deny", "indeterminate"].includes(result.decision), true);
  assert.equal(Array.isArray(result.evaluated_acls), true);
});
