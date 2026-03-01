# Gate G7 Release Readiness Checklist

Last Updated: 2026-03-01 (Catalog Claim Integrity Sync)

## Objective

Provide a reproducible readiness packet for **Milestone M7 / Gate G7 (Enterprise Readiness)**.

## 1) Quality and Testing Completion

- [x] Unit test suite passes (`npm run test`)
- [x] G2 validation passes (`npm run test:g2`)
- [x] G2 integration harness passes (`npm run test:g2:integration`)
- [x] G3 fixture/snapshot validation passes (`npm run test:g3:fixtures`)
- [x] G4 CI quality gate aggregation passes (`npm run test:g4:ci`)

## 2) Enterprise Hardening Delivery

- [x] H1 SIEM/webhook export implemented and configurable
- [x] H2 Tool bundles and deploy profiles implemented
- [x] H3 Security/governance documentation created
- [x] H4 Admin runbook documentation created
- [x] H5 Documentation truth-policy alignment completed (non-overclaim + implemented-vs-planned boundaries)

## 2.1) Documentation Contract Integrity (Required)

- [x] README tool catalog clearly separates implemented vs planned tool families
- [x] ACL trace claims are honest about discovery vs authoritative limits
- [x] Changeset gaps claims use confidence/evidence language (no completeness claim)
- [x] Rollback language avoids guaranteed reversibility claims
- [x] Companion is documented as optional pilot capability, not baseline dependency

## 3) Runtime Governance Contracts

- [x] Bundle policy block code: `TOOL_DISABLED_BY_BUNDLE`
- [x] Tier preflight block code: `TIER_MAX_EXCEEDED`
- [x] Policy preflight block code: `POLICY_BLOCKED`
- [x] T3 contract block code: `T3_CONFIRMATION_REQUIRED`

## 4) Evidence Artifacts

Expected artifacts:

- `artifacts/g2-integration-summary.json`
- `artifacts/g3-fixtures-summary.json`
- `artifacts/g4-ci-quality-summary.json`
- `artifacts/g7-readiness-summary.json`

## 5) Final Gate Command

```bash
npm run test:g7
```

Gate G7 is considered ready to mark `Passed` when all checklist items and command evidence are successful and tracker docs are synchronized.

## 6) Catalog Claim Integrity Bridge (G7 -> G8)

Before any release communication that references “100+ MCP tools,” perform this additional integrity pass:

```bash
npm run smoke:summary
npm run test:g4:ci
npm run test:g7
```

Required assertions:

- Implemented/runtime baseline is explicitly tracked as **25 implemented / 101 target / 76 remaining** unless fresh runtime evidence proves otherwise.
- `docs/MCP_TOOL_CATALOG_101_MATRIX.md` remains synchronized with `smoke:summary` tool registration output.
- README and epics tracker claims keep planned tools separated from implemented tools.
- Companion pilot wording remains optional and is not used to imply baseline catalog completion.

This bridge check is the operational prerequisite for progressing Gate G8 (`Catalog Claim Integrity`) from `In Progress` toward `Passed`.

Companion note:

- Gate G7 baseline readiness does **not** require companion deployment.
- Companion checks (`deploy:companion`, `test:companion:live`) apply only to teams explicitly running the optional pilot mode.
