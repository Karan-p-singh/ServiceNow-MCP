import { evaluateScriptRulepackV1 } from "./rulepacks/scripts-v1.js";
import { evaluateFlowRulepackV1 } from "./rulepacks/flows-v1.js";
import { evaluateWorkflowRulepackV1 } from "./rulepacks/workflows-v1.js";

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function severityCounts(findings = []) {
  const counts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const finding of findings) {
    const severity = String(finding?.severity || "").toUpperCase();
    if (Object.prototype.hasOwnProperty.call(counts, severity)) {
      counts[severity] += 1;
    }
  }

  return counts;
}

function normalizeAcknowledgedFindings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
}

export function evaluateScriptValidation({ script = "", record = {} } = {}) {
  const startedAt = Date.now();
  const rulepackResult = evaluateScriptRulepackV1({ script, record });
  const durationMs = Date.now() - startedAt;
  const findings = rulepackResult.findings || [];

  return {
    findings,
    summary: {
      findings_count_by_severity: severityCounts(findings),
      blocked: false,
      source: "validation-runtime",
      rulepack: rulepackResult.rulepack,
      execution_ms: durationMs,
      deterministic: true,
    },
  };
}

function evaluateScriptLikeValidation({
  script = "",
  record = {},
  rulepackId = "scripts-v1",
  artifactType = "sys_script_include",
} = {}) {
  const startedAt = Date.now();
  const rulepackResult = evaluateScriptRulepackV1({ script, record });
  const durationMs = Date.now() - startedAt;
  const findings = rulepackResult.findings || [];

  return {
    findings,
    summary: {
      findings_count_by_severity: severityCounts(findings),
      blocked: false,
      source: "validation-runtime",
      rulepack: {
        id: rulepackId,
        version: rulepackResult?.rulepack?.version || "1.0.0",
        artifact_type: artifactType,
      },
      execution_ms: durationMs,
      deterministic: true,
    },
  };
}

export function evaluateBusinessRuleValidation({ businessRule = {}, record = {} } = {}) {
  const mergedRecord = { ...record, ...businessRule };
  const script = [mergedRecord?.condition, mergedRecord?.script].filter(Boolean).join("\n");
  return evaluateScriptLikeValidation({
    script,
    record: mergedRecord,
    rulepackId: "business-rules-v1",
    artifactType: "sys_script",
  });
}

export function evaluateClientScriptValidation({ clientScript = {}, record = {} } = {}) {
  const mergedRecord = { ...record, ...clientScript };
  return evaluateScriptLikeValidation({
    script: String(mergedRecord?.script || ""),
    record: mergedRecord,
    rulepackId: "client-scripts-v1",
    artifactType: "sys_script_client",
  });
}

export function evaluateUiScriptValidation({ uiScript = {}, record = {} } = {}) {
  const mergedRecord = { ...record, ...uiScript };
  return evaluateScriptLikeValidation({
    script: String(mergedRecord?.script || ""),
    record: mergedRecord,
    rulepackId: "ui-scripts-v1",
    artifactType: "sys_ui_script",
  });
}

export function evaluateCatalogPolicyValidation({ catalogPolicy = {}, record = {} } = {}) {
  const mergedRecord = { ...record, ...catalogPolicy };
  const script = [mergedRecord?.script_true, mergedRecord?.script_false, mergedRecord?.script].filter(Boolean).join("\n");
  return evaluateScriptLikeValidation({
    script,
    record: mergedRecord,
    rulepackId: "catalog-policies-v1",
    artifactType: "catalog_ui_policy",
  });
}

export function evaluateFixValidation({ fixScript = {}, record = {} } = {}) {
  const mergedRecord = { ...record, ...fixScript };
  return evaluateScriptLikeValidation({
    script: String(mergedRecord?.script || ""),
    record: mergedRecord,
    rulepackId: "fix-scripts-v1",
    artifactType: "sys_script_fix",
  });
}

export function evaluateFlowValidation({ flow = {}, record = {} } = {}) {
  const startedAt = Date.now();
  const rulepackResult = evaluateFlowRulepackV1({ flow, record });
  const durationMs = Date.now() - startedAt;
  const findings = rulepackResult.findings || [];

  return {
    findings,
    summary: {
      findings_count_by_severity: severityCounts(findings),
      blocked: false,
      source: "validation-runtime",
      rulepack: rulepackResult.rulepack,
      execution_ms: durationMs,
      deterministic: true,
    },
  };
}

export function evaluateWorkflowValidation({ workflow = {}, record = {} } = {}) {
  const startedAt = Date.now();
  const rulepackResult = evaluateWorkflowRulepackV1({ workflow, record });
  const durationMs = Date.now() - startedAt;
  const findings = rulepackResult.findings || [];

  return {
    findings,
    summary: {
      findings_count_by_severity: severityCounts(findings),
      blocked: false,
      source: "validation-runtime",
      rulepack: rulepackResult.rulepack,
      execution_ms: durationMs,
      deterministic: true,
    },
  };
}

export function evaluateWriteGate({ findings = [], acknowledgedFindings = [] } = {}) {
  const acknowledgedSet = new Set(normalizeAcknowledgedFindings(acknowledgedFindings));

  const criticalFindings = findings.filter((finding) => String(finding?.severity || "").toUpperCase() === "CRITICAL");
  if (criticalFindings.length > 0) {
    return {
      blocked: true,
      code: "VALIDATION_BLOCKED_CRITICAL",
      message: "Write blocked due to CRITICAL validation findings.",
      missing_acknowledgments: [],
    };
  }

  const highFindings = findings.filter((finding) => String(finding?.severity || "").toUpperCase() === "HIGH");
  const missingHighAcknowledgments = highFindings
    .map((finding) => finding.id)
    .filter((id) => !acknowledgedSet.has(String(id)));

  if (missingHighAcknowledgments.length > 0) {
    return {
      blocked: true,
      code: "VALIDATION_ACK_REQUIRED_HIGH",
      message: "Write requires acknowledgment for HIGH severity findings.",
      missing_acknowledgments: missingHighAcknowledgments,
    };
  }

  return {
    blocked: false,
    code: null,
    message: "Validation write gate passed.",
    missing_acknowledgments: [],
  };
}

export function buildValidationSummaryFromFindings({ findings = [], rulepack, executionMs = 0, blocked = false } = {}) {
  const summary = {
    findings_count_by_severity: severityCounts(findings),
    blocked,
    source: "validation-runtime",
    execution_ms: executionMs,
    deterministic: true,
  };

  if (rulepack) {
    summary.rulepack = rulepack;
  }

  return summary;
}

export function supportedValidationSeverities() {
  return [...SEVERITIES];
}
