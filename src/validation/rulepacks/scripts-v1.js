const RULEPACK_ID = "scripts-v1";
const RULEPACK_VERSION = "1.0.0";

function buildFinding({ id, severity, category, message, evidence = [] }) {
  return {
    id,
    severity,
    category,
    message,
    evidence,
  };
}

function countLines(text) {
  if (!text) {
    return 0;
  }
  return String(text).split(/\r?\n/).length;
}

export function evaluateScriptRulepackV1({ script = "", record = {} } = {}) {
  const findings = [];
  const source = String(script || "");
  const lines = source.split(/\r?\n/);

  const evalRegex = /\beval\s*\(/;
  if (evalRegex.test(source)) {
    const lineIndex = lines.findIndex((line) => evalRegex.test(line));
    findings.push(
      buildFinding({
        id: "SCRIPT_EVAL_USAGE",
        severity: "CRITICAL",
        category: "SECURITY",
        message: "Avoid eval(); use safer parsing/execution alternatives.",
        evidence: [{ type: "line", line: lineIndex + 1 }],
      }),
    );
  }

  const glideRecordRegex = /\bnew\s+GlideRecord\s*\(/;
  if (glideRecordRegex.test(source)) {
    const lineIndex = lines.findIndex((line) => glideRecordRegex.test(line));
    findings.push(
      buildFinding({
        id: "SCRIPT_GLIDERECORD_USAGE",
        severity: "HIGH",
        category: "PERFORMANCE",
        message: "GlideRecord usage detected; verify query constraints and performance impacts.",
        evidence: [{ type: "line", line: lineIndex + 1 }],
      }),
    );
  }

  const lineCount = countLines(source);
  if (lineCount > 200) {
    findings.push(
      buildFinding({
        id: "SCRIPT_LONG_BODY",
        severity: "MEDIUM",
        category: "BEST_PRACTICE",
        message: "Script body exceeds 200 lines; consider decomposition.",
        evidence: [{ type: "metric", key: "line_count", value: lineCount }],
      }),
    );
  }

  if (!String(record.description || "").trim()) {
    findings.push(
      buildFinding({
        id: "SCRIPT_MISSING_DESCRIPTION",
        severity: "LOW",
        category: "BEST_PRACTICE",
        message: "Script include is missing description metadata.",
      }),
    );
  }

  return {
    rulepack: {
      id: RULEPACK_ID,
      version: RULEPACK_VERSION,
      artifact_type: "sys_script_include",
    },
    findings,
  };
}
