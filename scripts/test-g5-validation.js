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
      id: "F5",
      label: "Controlled T3 commit emits confirmation-aware high-risk audit trace and snapshot matrix",
      passed:
        payload?.smoke_summary?.f5_controlled_commit_contract_available === true &&
        toolNames.includes("sn.changeset.commit") &&
        payload?.controlled_commit_result?.data?.high_risk_audit_trace?.tier === "T3" &&
        Boolean(payload?.controlled_commit_result?.data?.snapshot_coverage_matrix),
    },
    {
      id: "F6",
      label: "Rollback plan generator splits restorable vs non-restorable and includes manual guidance",
      passed:
        payload?.smoke_summary?.f6_rollback_plan_generator_available === true &&
        toolNames.includes("sn.rollback.plan.generate") &&
        Array.isArray(payload?.rollback_plan_result?.data?.restorable) &&
        Array.isArray(payload?.rollback_plan_result?.data?.non_restorable) &&
        Array.isArray(payload?.rollback_plan_result?.data?.manual_steps),
    },
    {
      id: "G5-AUDIT",
      label: "High-risk operation audit trace includes operation/tier/confirm contract",
      passed:
        payload?.controlled_commit_result?.data?.high_risk_audit_trace?.operation === "sn.changeset.commit" &&
        payload?.controlled_commit_result?.data?.high_risk_audit_trace?.confirm_required === true &&
        payload?.controlled_commit_result?.data?.high_risk_audit_trace?.confirm_received === true &&
        typeof payload?.controlled_commit_result?.data?.high_risk_audit_trace?.reason === "string",
    },
  ];
}

async function main() {
  const payload = await runSmokeForGate("G5");
  const criteria = evaluateGateCriteria(payload);
  printChecklist("G5", criteria);
  const artifactPath = await writeSummaryArtifact({
    gateId: "G5",
    outputFileName: "g5-validation-summary.json",
    criteria,
    evidence: {
      smoke_summary: payload?.smoke_summary || {},
      tools_registered: (payload?.tools || []).map((entry) => entry.name),
      controlled_commit: payload?.controlled_commit_result?.data || null,
      rollback_plan: payload?.rollback_plan_result?.data || null,
    },
  });

  reportGateResult({ gateId: "G5", criteria, artifactPath });
}

main().catch((error) => {
  console.error("❌ Gate G5 validation script failed");
  console.error(error);
  process.exit(1);
});
