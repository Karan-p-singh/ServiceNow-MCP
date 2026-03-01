import fs from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { ServiceNowClient } from "../src/servicenow/client.js";

const VALID_REASON_CODES = [
  "CAPTURED_IN_TARGET_SET",
  "CAPTURED_IN_DIFFERENT_SET",
  "NOT_CAPTURED",
];

function assert(condition, message, details = {}) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function isMockUrl(url) {
  return String(url || "").includes("example.service-now.com");
}

function normalizeRecordValue(value) {
  if (value && typeof value === "object") {
    return value.value || value.display_value || null;
  }
  return value || null;
}

async function writeArtifact(report) {
  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });
  const outputPath = path.join(artifactsDir, "g4-integration-summary.json");
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}

async function run() {
  const config = loadConfig();
  const client = new ServiceNowClient({ config });

  assert(
    !isMockUrl(config.instanceUrl),
    "G4 live integration requires a non-mock ServiceNow instance. Update SN_INSTANCE_URL in .env.",
    { instance_url: config.instanceUrl },
  );

  const criteria = [];
  const evidence = {
    instance_url: config.instanceUrl,
    default_instance: config.defaultInstance,
  };

  const listResult = await client.listChangesets({ limit: 5, offset: 0 });
  const listedCount = listResult?.records?.length || 0;
  criteria.push({
    id: "G4-LIVE-F1-LIST",
    label: "Live changeset listing is reachable",
    passed: Array.isArray(listResult?.records) && listedCount >= 1,
  });
  assert(criteria.at(-1).passed, "No update sets returned from live instance", {
    page: listResult?.page,
  });

  const selectedChangesetSysId =
    process.env.G4_TEST_CHANGESET_SYS_ID ||
    normalizeRecordValue(listResult.records[0]?.sys_id) ||
    listResult.records[0]?.sys_id;
  evidence.selected_changeset_sys_id = selectedChangesetSysId;

  const getResult = await client.getChangeset({ sysId: selectedChangesetSysId });
  criteria.push({
    id: "G4-LIVE-F1-GET",
    label: "Live changeset get by sys_id resolves a record",
    passed: getResult?.found === true && Boolean(getResult?.record),
  });
  assert(criteria.at(-1).passed, "Unable to resolve selected update set in live instance", {
    selected_changeset_sys_id: selectedChangesetSysId,
    query: getResult?.query,
  });

  const contentsResult = await client.listChangesetContents({
    changesetSysId: selectedChangesetSysId,
    limit: 20,
    offset: 0,
  });
  criteria.push({
    id: "G4-LIVE-F1-CONTENTS",
    label: "Live changeset contents endpoint is reachable",
    passed: Array.isArray(contentsResult?.records),
  });
  assert(criteria.at(-1).passed, "Unable to read update set contents in live instance", {
    selected_changeset_sys_id: selectedChangesetSysId,
  });
  evidence.contents_returned = contentsResult.records.length;

  const exportResult = await client.exportChangeset({
    sysId: selectedChangesetSysId,
    format: "xml",
  });
  criteria.push({
    id: "G4-LIVE-F1-EXPORT",
    label: "Live changeset export metadata is generated",
    passed:
      exportResult?.exported === true &&
      typeof exportResult?.download_url === "string" &&
      exportResult.download_url.includes(String(config.instanceUrl).replace(/\/$/, "")),
  });
  assert(criteria.at(-1).passed, "Update set export contract failed for live instance", {
    export_result: exportResult,
  });

  const gapsResult = await client.detectChangesetGaps({
    changesetSysId: selectedChangesetSysId,
    limit: 200,
    offset: 0,
  });
  criteria.push({
    id: "G4-LIVE-F2",
    label: "Live gap detection returns confidence-tier buckets",
    passed:
      Array.isArray(gapsResult?.hard_dependencies) &&
      Array.isArray(gapsResult?.soft_dependencies) &&
      Array.isArray(gapsResult?.heuristic_candidates),
  });
  assert(criteria.at(-1).passed, "Gap detection output contract invalid in live instance", {
    gaps_result: gapsResult,
  });
  evidence.gap_counts = {
    hard: gapsResult.hard_dependencies.length,
    soft: gapsResult.soft_dependencies.length,
    heuristic: gapsResult.heuristic_candidates.length,
  };

  const sampleContent = (contentsResult.records || []).find(
    (entry) => normalizeRecordValue(entry?.target_table) && normalizeRecordValue(entry?.target_sys_id),
  );
  const verifyTable =
    process.env.G4_TEST_CAPTURE_TABLE ||
    normalizeRecordValue(sampleContent?.target_table) ||
    "sys_script_include";
  const verifySysId =
    process.env.G4_TEST_CAPTURE_SYS_ID ||
    normalizeRecordValue(sampleContent?.target_sys_id) ||
    "ffffffffffffffffffffffffffffffff";

  const captureResult = await client.verifyChangesetCapture({
    table: verifyTable,
    sysId: verifySysId,
    changesetSysId: selectedChangesetSysId,
  });
  criteria.push({
    id: "G4-LIVE-F3",
    label: "Live capture verification returns deterministic reason code",
    passed: VALID_REASON_CODES.includes(captureResult?.reason_code),
  });
  assert(criteria.at(-1).passed, "Capture verification did not return a deterministic reason code", {
    capture_result: captureResult,
  });
  evidence.capture_verify = {
    input: {
      table: verifyTable,
      sys_id: verifySysId,
      changeset_sys_id: selectedChangesetSysId,
    },
    output: captureResult,
  };

  const report = {
    generated_at: new Date().toISOString(),
    gate: "G4",
    validation_type: "non_prod_live_integration",
    passed: criteria.every((item) => item.passed),
    criteria,
    evidence,
  };

  const artifactPath = await writeArtifact(report);
  console.log("\n=== Gate G4 Live Integration Validation ===");
  for (const item of criteria) {
    console.log(`${item.passed ? "✅" : "❌"} ${item.id}: ${item.label}`);
  }
  console.log(`\nReport artifact: ${artifactPath}`);
}

run().catch(async (error) => {
  const report = {
    generated_at: new Date().toISOString(),
    gate: "G4",
    validation_type: "non_prod_live_integration",
    passed: false,
    error: {
      message: error?.message || String(error),
      details: error?.details || null,
    },
  };

  const artifactPath = await writeArtifact(report);
  console.error("❌ Gate G4 live integration validation failed");
  console.error(error?.message || error);
  if (error?.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  console.error(`Report artifact: ${artifactPath}`);
  process.exit(1);
});
