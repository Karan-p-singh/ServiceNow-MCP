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
  const source = String(text);
  let count = 1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      count++;
    }
  }
  return count;
}

export function evaluateScriptRulepackV1({ script = "", record = {} } = {}) {
  const findings = [];
  const source = String(script || "");

  const evalRegex = /\beval\s*\(/;
  const evalMatch = source.match(evalRegex);
  if (evalMatch) {
    let line = 1;
    for (let i = 0; i < evalMatch.index; i++) {
      if (source[i] === "\n") {
        line++;
      }
    }
    findings.push(
      buildFinding({
        id: "SCRIPT_EVAL_USAGE",
        severity: "CRITICAL",
        category: "SECURITY",
        message: "Avoid eval(); use safer parsing/execution alternatives.",
        evidence: [{ type: "line", line }],
      }),
    );
  }

  const glideRecordRegex = /\bnew\s+GlideRecord\s*\(/;
  const glideRecordMatch = source.match(glideRecordRegex);
  if (glideRecordMatch) {
    let line = 1;
    for (let i = 0; i < glideRecordMatch.index; i++) {
      if (source[i] === "\n") {
        line++;
      }
    }
    findings.push(
      buildFinding({
        id: "SCRIPT_GLIDERECORD_USAGE",
        severity: "HIGH",
        category: "PERFORMANCE",
        message: "GlideRecord usage detected; verify query constraints and performance impacts.",
        evidence: [{ type: "line", line }],
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
