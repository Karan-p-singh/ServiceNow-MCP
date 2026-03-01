import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFlowValidation,
  evaluateScriptValidation,
  evaluateWorkflowValidation,
  evaluateWriteGate,
} from "../src/validation/engine.js";

test("evaluateScriptValidation returns deterministic summary and rulepack metadata", () => {
  const script = "var gr = new GlideRecord('incident');\ngr.query();";
  const record = { description: "demo" };

  const first = evaluateScriptValidation({ script, record });
  const second = evaluateScriptValidation({ script, record });

  assert.deepEqual(first.findings, second.findings);
  assert.equal(first.summary.rulepack.id, "scripts-v1");
  assert.equal(first.summary.rulepack.version, "1.0.0");
  assert.equal(first.summary.findings_count_by_severity.HIGH, 1);
  assert.equal(first.summary.deterministic, true);
});

test("evaluateWriteGate blocks on CRITICAL findings", () => {
  const gate = evaluateWriteGate({
    findings: [{ id: "SCRIPT_EVAL_USAGE", severity: "CRITICAL" }],
    acknowledgedFindings: ["SCRIPT_EVAL_USAGE"],
  });

  assert.equal(gate.blocked, true);
  assert.equal(gate.code, "VALIDATION_BLOCKED_CRITICAL");
});

test("evaluateWriteGate requires acknowledgments for HIGH findings", () => {
  const blocked = evaluateWriteGate({
    findings: [{ id: "SCRIPT_GLIDERECORD_USAGE", severity: "HIGH" }],
    acknowledgedFindings: [],
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.code, "VALIDATION_ACK_REQUIRED_HIGH");
  assert.deepEqual(blocked.missing_acknowledgments, ["SCRIPT_GLIDERECORD_USAGE"]);

  const allowed = evaluateWriteGate({
    findings: [{ id: "SCRIPT_GLIDERECORD_USAGE", severity: "HIGH" }],
    acknowledgedFindings: ["SCRIPT_GLIDERECORD_USAGE"],
  });
  assert.equal(allowed.blocked, false);
});

test("evaluateFlowValidation returns rulepack metadata and deterministic output", () => {
  const flow = {
    name: "x_demo_flow",
    description: "demo",
    status: "published",
    trigger_type: "record",
    steps: [{ id: "step_1", type: "action" }],
  };

  const first = evaluateFlowValidation({ flow, record: flow });
  const second = evaluateFlowValidation({ flow, record: flow });

  assert.deepEqual(first.findings, second.findings);
  assert.equal(first.summary.rulepack.id, "flows-v1");
  assert.equal(first.summary.rulepack.version, "1.0.0");
  assert.equal(first.summary.deterministic, true);
});

test("evaluateWorkflowValidation returns rulepack metadata and deterministic output", () => {
  const workflow = {
    name: "x_demo_workflow",
    description: "demo",
    active: "true",
    activities: [{ id: "activity_1", type: "task" }],
  };

  const first = evaluateWorkflowValidation({ workflow, record: workflow });
  const second = evaluateWorkflowValidation({ workflow, record: workflow });

  assert.deepEqual(first.findings, second.findings);
  assert.equal(first.summary.rulepack.id, "workflows-v1");
  assert.equal(first.summary.rulepack.version, "1.0.0");
  assert.equal(first.summary.deterministic, true);
});
