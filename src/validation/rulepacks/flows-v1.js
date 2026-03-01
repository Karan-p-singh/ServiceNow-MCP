const RULEPACK_ID = "flows-v1";
const RULEPACK_VERSION = "1.0.0";

function buildFinding({ id, severity, message, evidence = [] }) {
  return {
    id,
    severity,
    message,
    evidence,
  };
}

function normalizeSteps(flow = {}) {
  const candidates = flow?.steps || flow?.actions || flow?.definition?.steps || [];
  return Array.isArray(candidates) ? candidates : [];
}

export function evaluateFlowRulepackV1({ flow = {}, record = {} } = {}) {
  const findings = [];
  const steps = normalizeSteps(flow);
  const status = String(flow?.status || record?.status || "").toLowerCase();
  const triggerType = String(flow?.trigger_type || record?.trigger_type || "").toLowerCase();

  if (!String(flow?.name || record?.name || "").trim()) {
    findings.push(
      buildFinding({
        id: "FLOW_MISSING_NAME",
        severity: "HIGH",
        message: "Flow is missing a stable name identifier.",
      }),
    );
  }

  if (!String(flow?.description || record?.description || "").trim()) {
    findings.push(
      buildFinding({
        id: "FLOW_MISSING_DESCRIPTION",
        severity: "LOW",
        message: "Flow is missing description metadata.",
      }),
    );
  }

  if (steps.length === 0) {
    findings.push(
      buildFinding({
        id: "FLOW_NO_STEPS",
        severity: "MEDIUM",
        message: "Flow does not define executable steps/actions.",
      }),
    );
  }

  if (status && !["published", "active", "draft", "inactive"].includes(status)) {
    findings.push(
      buildFinding({
        id: "FLOW_UNKNOWN_STATUS",
        severity: "LOW",
        message: "Flow has an unknown lifecycle status; verify release compatibility.",
        evidence: [{ type: "status", value: status }],
      }),
    );
  }

  if (triggerType && ["schedule", "timer"].includes(triggerType)) {
    findings.push(
      buildFinding({
        id: "FLOW_SCHEDULED_TRIGGER",
        severity: "MEDIUM",
        message: "Scheduled flow trigger detected; verify execution windows and safeguards.",
        evidence: [{ type: "trigger_type", value: triggerType }],
      }),
    );
  }

  return {
    rulepack: {
      id: RULEPACK_ID,
      version: RULEPACK_VERSION,
      artifact_type: "sys_hub_flow",
    },
    findings,
  };
}
