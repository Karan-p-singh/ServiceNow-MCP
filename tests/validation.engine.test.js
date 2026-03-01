import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateBusinessRuleValidation,
  evaluateCatalogPolicyValidation,
  evaluateClientScriptValidation,
  evaluateFixValidation,
  evaluateFlowValidation,
  evaluateScriptValidation,
  evaluateUiScriptValidation,
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

test("evaluateBusinessRuleValidation returns remapped artifact rulepack metadata", () => {
  const businessRule = {
    name: "x_demo_business_rule",
    description: "demo",
    condition: "current.active == true",
    script: "if (current.short_description) { gs.info(current.short_description); }",
  };

  const result = evaluateBusinessRuleValidation({ businessRule, record: businessRule });
  assert.equal(result.summary.rulepack.id, "business-rules-v1");
  assert.equal(result.summary.rulepack.artifact_type, "sys_script");
  assert.equal(result.summary.deterministic, true);
});

test("evaluateClientScriptValidation returns remapped artifact rulepack metadata", () => {
  const clientScript = {
    name: "x_demo_client_script",
    description: "demo",
    script: "function onLoad(){ var gr = new GlideRecord('incident'); gr.query(); }",
  };

  const result = evaluateClientScriptValidation({ clientScript, record: clientScript });
  assert.equal(result.summary.rulepack.id, "client-scripts-v1");
  assert.equal(result.summary.rulepack.artifact_type, "sys_script_client");
  assert.equal(result.summary.deterministic, true);
});

test("evaluateUiScriptValidation returns remapped artifact rulepack metadata", () => {
  const uiScript = {
    name: "x_demo_ui_script",
    description: "demo",
    script: "function run(input){ return eval(input); }",
  };

  const result = evaluateUiScriptValidation({ uiScript, record: uiScript });
  assert.equal(result.summary.rulepack.id, "ui-scripts-v1");
  assert.equal(result.summary.rulepack.artifact_type, "sys_ui_script");
  assert.equal(result.summary.deterministic, true);
  assert.equal(result.findings.some((entry) => entry.id === "SCRIPT_EVAL_USAGE"), true);
});

test("evaluateCatalogPolicyValidation returns remapped artifact rulepack metadata", () => {
  const catalogPolicy = {
    name: "x_demo_catalog_policy",
    description: "demo",
    script_true: "if (g_form.getValue('short_description')) { g_form.setMandatory('category', true); }",
    script_false: "g_form.setMandatory('category', false);",
  };

  const result = evaluateCatalogPolicyValidation({ catalogPolicy, record: catalogPolicy });
  assert.equal(result.summary.rulepack.id, "catalog-policies-v1");
  assert.equal(result.summary.rulepack.artifact_type, "catalog_ui_policy");
  assert.equal(result.summary.deterministic, true);
});

test("evaluateFixValidation returns remapped artifact rulepack metadata", () => {
  const fixScript = {
    name: "x_demo_fix_script",
    description: "demo",
    script: "var gr = new GlideRecord('incident'); gr.query();",
  };

  const result = evaluateFixValidation({ fixScript, record: fixScript });
  assert.equal(result.summary.rulepack.id, "fix-scripts-v1");
  assert.equal(result.summary.rulepack.artifact_type, "sys_script_fix");
  assert.equal(result.summary.deterministic, true);
});
