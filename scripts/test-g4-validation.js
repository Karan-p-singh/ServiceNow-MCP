import {
  printChecklist,
  reportGateResult,
  runSmokeForGate,
  writeSummaryArtifact,
} from "./lib/gate-harness.js";

function evaluateGateCriteria(payload) {
  const toolNames = (payload.tools || []).map((entry) => entry.name);
  const validReasonCodes = ["CAPTURED_IN_TARGET_SET", "CAPTURED_IN_DIFFERENT_SET", "NOT_CAPTURED"];

  return [
    {
      id: "F1",
      label: "Changeset read tooling list/get/contents/export is registered and smoke-available",
      passed:
        payload?.smoke_summary?.f1_changeset_read_tools_available === true &&
        ["sn.changeset.list", "sn.changeset.get", "sn.changeset.contents", "sn.changeset.export"]
          .every((name) => toolNames.includes(name)),
    },
    {
      id: "F2",
      label: "Gap detection exposes confidence-tier evidence buckets",
      passed:
        payload?.smoke_summary?.f2_changeset_gap_detection_available === true &&
        toolNames.includes("sn.changeset.gaps") &&
        Array.isArray(payload?.changeset_gaps_result?.data?.hard_dependencies) &&
        Array.isArray(payload?.changeset_gaps_result?.data?.soft_dependencies) &&
        Array.isArray(payload?.changeset_gaps_result?.data?.heuristic_candidates),
    },
    {
      id: "F3",
      label: "Capture verification emits deterministic reason codes",
      passed:
        payload?.smoke_summary?.f3_capture_verify_reason_codes_deterministic === true &&
        toolNames.includes("sn.updateset.capture.verify") &&
        validReasonCodes.includes(payload?.capture_verify_result?.data?.reason_code),
    },
  ];
}

async function main() {
  const payload = await runSmokeForGate("G4");
  const criteria = evaluateGateCriteria(payload);
  printChecklist("G4", criteria);
  const artifactPath = await writeSummaryArtifact({
    gateId: "G4",
    outputFileName: "g4-validation-summary.json",
    criteria,
    evidence: {
      smoke_summary: payload?.smoke_summary || {},
      tools_registered: (payload?.tools || []).map((entry) => entry.name),
      changeset_gaps_counts: {
        hard: payload?.changeset_gaps_result?.data?.hard_dependencies?.length || 0,
        soft: payload?.changeset_gaps_result?.data?.soft_dependencies?.length || 0,
        heuristic: payload?.changeset_gaps_result?.data?.heuristic_candidates?.length || 0,
      },
      capture_verify: payload?.capture_verify_result?.data || null,
    },
  });

  reportGateResult({ gateId: "G4", criteria, artifactPath });
}

main().catch((error) => {
  console.error("❌ Gate G4 validation script failed");
  console.error(error);
  process.exit(1);
});
