const RULEPACK_ID = "workflows-v1";
const RULEPACK_VERSION = "1.0.0";

function buildFinding({ id, severity, message, evidence = [] }) {
  return {
    id,
    severity,
    message,
    evidence,
  };
}

function normalizeActivities(workflow = {}) {
  const candidates = workflow?.activities || workflow?.stages || workflow?.definition?.activities || [];
  return Array.isArray(candidates) ? candidates : [];
}

export function evaluateWorkflowRulepackV1({ workflow = {}, record = {} } = {}) {
  const findings = [];
  const activities = normalizeActivities(workflow);
  const active = String(workflow?.active ?? record?.active ?? "").toLowerCase();

  if (!String(workflow?.name || record?.name || "").trim()) {
    findings.push(
      buildFinding({
        id: "WORKFLOW_MISSING_NAME",
        severity: "HIGH",
        message: "Workflow is missing a stable name identifier.",
      }),
    );
  }

  if (!String(workflow?.description || record?.description || "").trim()) {
    findings.push(
      buildFinding({
        id: "WORKFLOW_MISSING_DESCRIPTION",
        severity: "LOW",
        message: "Workflow is missing description metadata.",
      }),
    );
  }

  if (activities.length === 0) {
    findings.push(
      buildFinding({
        id: "WORKFLOW_NO_ACTIVITIES",
        severity: "MEDIUM",
        message: "Workflow has no modeled activities/stages.",
      }),
    );
  }

  if (active && !["true", "false", "1", "0"].includes(active)) {
    findings.push(
      buildFinding({
        id: "WORKFLOW_UNKNOWN_ACTIVE_FLAG",
        severity: "LOW",
        message: "Workflow active flag is non-standard; verify instance data normalization.",
        evidence: [{ type: "active", value: active }],
      }),
    );
  }

  const hasWaitLike = activities.some((entry) => {
    const text = JSON.stringify(entry || {}).toLowerCase();
    return text.includes("wait") || text.includes("timer");
  });
  if (hasWaitLike) {
    findings.push(
      buildFinding({
        id: "WORKFLOW_WAIT_ACTIVITY_PRESENT",
        severity: "MEDIUM",
        message: "Workflow contains wait/timer style activity; verify timeout and deadlock handling.",
      }),
    );
  }

  return {
    rulepack: {
      id: RULEPACK_ID,
      version: RULEPACK_VERSION,
      artifact_type: "wf_workflow",
    },
    findings,
  };
}
