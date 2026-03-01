import test from "node:test";
import assert from "node:assert/strict";
import { AuditWebhookSink } from "../src/server/audit-webhook.js";

test("AuditWebhookSink returns disabled when not configured", async () => {
  const sink = new AuditWebhookSink({
    config: {
      enabled: false,
      url: "",
    },
  });

  const result = await sink.send({ stage: "pre_handler", write_operation: true });
  assert.deepEqual(result, { sent: false, reason: "DISABLED" });
});

test("AuditWebhookSink filters non-write events by default", async () => {
  const sink = new AuditWebhookSink({
    config: {
      enabled: true,
      url: "https://example.com/hook",
      filter: "writes",
    },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });

  const result = await sink.send({ stage: "pre_handler", write_operation: false });
  assert.deepEqual(result, { sent: false, reason: "FILTERED" });
});

test("AuditWebhookSink sends write events with payload envelope", async () => {
  const calls = [];
  const sink = new AuditWebhookSink({
    config: {
      enabled: true,
      url: "https://example.com/hook",
      timeoutMs: 1000,
      filter: "writes",
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 202 };
    },
  });

  const event = {
    stage: "post_handler_success",
    write_operation: true,
    tier: "T2",
  };
  const result = await sink.send(event);

  assert.equal(result.sent, true);
  assert.equal(result.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.com/hook");

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.event_type, "mcp.audit.webhook");
  assert.deepEqual(body.payload, event);
});

test("AuditWebhookSink high_risk filter sends CRITICAL/HIGH events", async () => {
  const sink = new AuditWebhookSink({
    config: {
      enabled: true,
      url: "https://example.com/hook",
      filter: "high_risk",
    },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });

  const result = await sink.send({
    stage: "post_handler_success",
    write_operation: false,
    tier: "T0",
    validation_summary: {
      findings_count_by_severity: {
        CRITICAL: 1,
        HIGH: 0,
      },
    },
  });

  assert.equal(result.sent, true);
});
