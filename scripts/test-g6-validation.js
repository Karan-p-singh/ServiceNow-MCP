import {
  printChecklist,
  reportGateResult,
  runSmokeForGate,
  writeSummaryArtifact,
} from "./lib/gate-harness.js";

function evaluateGateCriteria(payload) {
  const toolNames = (payload.tools || []).map((entry) => entry.name);

  return [
    {
      id: "E4",
      label: "Flow list/get/validate tooling available with validation summary",
      passed:
        payload?.smoke_summary?.e4_flow_list_get_validate_available === true &&
        ["sn.flow.list", "sn.flow.get", "sn.flow.validate"].every((name) => toolNames.includes(name)) &&
        payload?.flow_validate_result?.validation_summary?.rulepack?.id === "flows-v1",
    },
    {
      id: "E5",
      label: "Workflow list/get/validate tooling available with validation summary",
      passed:
        payload?.smoke_summary?.e5_workflow_list_get_validate_available === true &&
        ["sn.workflow.list", "sn.workflow.get", "sn.workflow.validate"].every((name) => toolNames.includes(name)) &&
        payload?.workflow_validate_result?.validation_summary?.rulepack?.id === "workflows-v1",
    },
    {
      id: "D-COVERAGE",
      label: "Validation coverage expanded with flow/workflow rulepack versions",
      passed:
        payload?.flow_validate_result?.validation_summary?.rulepack?.version === "1.0.0" &&
        payload?.workflow_validate_result?.validation_summary?.rulepack?.version === "1.0.0",
    },
  ];
}

async function main() {
  const payload = await runSmokeForGate("G6");
  const criteria = evaluateGateCriteria(payload);
  printChecklist("G6", criteria);
  const artifactPath = await writeSummaryArtifact({
    gateId: "G6",
    outputFileName: "g6-validation-summary.json",
    criteria,
    evidence: {
      smoke_summary: payload?.smoke_summary || {},
      tools_registered: (payload?.tools || []).map((entry) => entry.name),
      flow_validation: payload?.flow_validate_result || null,
      workflow_validation: payload?.workflow_validate_result || null,
    },
  });

  reportGateResult({ gateId: "G6", criteria, artifactPath });
}

main().catch((error) => {
  console.error("❌ Gate G6 validation script failed");
  console.error(error);
  process.exit(1);
});
