import { evaluateScriptRulepackV1 } from "./rulepacks/scripts-v1.js";

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
