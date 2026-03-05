import {
  printChecklist,
  reportGateResult,
  runSmokeForGate,
  writeSummaryArtifact,
} from "./lib/gate-harness.js";

function evaluateGateCriteria(payload) {
  const expectedTools = [
    "sn.script.get",
    "sn.script.list",
    "sn.script.search",
    "sn.script.refs",
    "sn.script.deps",
    "sn.script.create",
    "sn.script.update",
  ];
  const toolNames = (payload.tools || []).map((entry) => entry.name);

  const criteria = [
    {
      id: "D1",
      label: "Validation runtime is deterministic",
      passed:
        payload?.smoke_summary?.d1_runtime_deterministic === true &&
        payload?.script_get_result?.validation_summary?.deterministic === true,
    },
    {
      id: "D2",
      label: "Script rulepack v1 metadata/version is attached",
      passed:
        payload?.smoke_summary?.d2_rulepack_versioned === true &&
        payload?.script_get_result?.validation_summary?.rulepack?.id === "scripts-v1" &&
        payload?.script_get_result?.validation_summary?.rulepack?.version === "1.0.0",
    },
    {
      id: "D3-CRITICAL",
      label: "CRITICAL findings block writes",
      passed: payload?.smoke_summary?.d3_critical_blocks_write === true,
    },
    {
      id: "D3-HIGH",
      label: "HIGH findings require/satisfy acknowledgment",
      passed: payload?.smoke_summary?.d3_high_ack_required_or_satisfied === true,
    },
    {
      id: "E1",
      label: "Script read/list/search lifecycle is available",
      passed:
        payload?.smoke_summary?.e1_get_list_search_available === true &&
        expectedTools.every((name) => toolNames.includes(name)),
    },
    {
      id: "E2",
      label: "refs/deps include evidence arrays",
      passed:
        payload?.smoke_summary?.e2_refs_deps_evidence_available === true &&
        Array.isArray(payload?.script_refs_result?.data?.references) &&
        Array.isArray(payload?.script_deps_result?.data?.dependencies),
    },
    {
      id: "E3",
      label: "create/update include audit metadata",
      passed:
        payload?.smoke_summary?.e3_create_update_auditable === true &&
        Boolean(payload?.script_create_allowed_result?.data?.audit?.action) &&
        Boolean(payload?.script_update_allowed_result?.data?.audit?.action),
    },
  ];

  return criteria;
}

async function main() {
  const payload = await runSmokeForGate("G2");
  const criteria = evaluateGateCriteria(payload);
  printChecklist("G2", criteria);
  const artifactPath = await writeSummaryArtifact({
    gateId: "G2",
    outputFileName: "g2-validation-summary.json",
    criteria,
    evidence: {
      smoke_summary: payload?.smoke_summary || {},
      tools_registered: (payload?.tools || []).map((entry) => entry.name),
      validation_rulepack: payload?.script_get_result?.validation_summary?.rulepack || null,
      sample_error_codes: {
        script_create_blocked: (payload?.script_create_blocked_result?.errors || []).map((entry) => entry.code),
        script_update_blocked: (payload?.tier_blocked_result?.errors || []).map((entry) => entry.code),
      },
    },
  });

  reportGateResult({ gateId: "G2", criteria, artifactPath });
}

main().catch((error) => {
  console.error("❌ Gate G2 validation script failed");
  console.error(error);
  process.exit(1);
});
