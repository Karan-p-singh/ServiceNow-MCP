# Docs — Compact LLM Context

Last Updated: 2026-03-03 22:00 PST
Purpose: Low-token summary of all `docs/*.md` governance and operations files.
Truth policy: Runtime (`npm run smoke:summary`) > `docs/MCP_TOOL_CATALOG_101_MATRIX.md` > summary docs.

---

## 1) Current Governance Truth (must keep exact)

- Runtime: **101 registered / target 101 / remaining 0**
- Last verified: **2026-03-03** via `npm run smoke:summary`
- Companion authority: **optional pilot** (not baseline requirement)
- Release claim integrity cadence:
  1. `npm run smoke:summary`
  2. `npm run test:g4:ci`
  3. `npm run test:g7`

---

## 2) File-by-File Compact Purpose (docs Folder)

| Source File                              | Keep in LLM context | One-line meaning                                                             |
| ---------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| `docs/MCP_TOOL_CATALOG_101_MATRIX.md`    | Yes (high)          | Canonical 101-tool status, ownership, and evidence for the full 1..101 set  |
| `docs/RELEASE_READINESS_G7_CHECKLIST.md` | Yes (high)          | Gate G7 checklist and G7→G8 claim-integrity bridge commands                  |
| `docs/SECURITY_MODEL_AND_GOVERNANCE.md`  | Yes (medium)        | Policy/tier/security contract and non-overclaim controls                     |
| `docs/ADMIN_RUNBOOK.md`                  | Yes (medium)        | Operational runbook for startup, triage, tests, and release cadence          |
| `docs/PROJECT_STRUCTURE_PUBLISH.md`      | Yes (medium)        | Published structure index for scripts and context markdown with machine sync |

---

## 3) LLM-safe Claims (Do / Don’t)

### Do

- State implemented tools using current runtime evidence (`npm run smoke:summary`) and keep matrix/docs synchronized.
- Distinguish current implementation truth from future roadmap workstreams.
- Describe ACL discovery outputs as diagnostic/confidence-scored.
- Describe changeset gap outputs as evidence-tiered, non-complete.

### Don’t

- Don’t claim “100+ tools implemented” without runtime + matrix reconciliation.
- Don’t claim guaranteed rollback reversibility.
- Don’t imply companion mode is required for baseline operation.

---

## 4) Compact Command Set for LLM-Guided Ops

### Runtime + catalog truth

```bash
npm run smoke:summary
```

### Quality + readiness

```bash
npm run test:g4:ci
npm run test:g7
```

### Structure publish artifacts

```bash
npm run structure:publish
npm run structure:check
```

### Core evidence artifacts

- `artifacts/g4-ci-quality-summary.json`
- `artifacts/g7-readiness-summary.json`
- `artifacts/project-structure-scripts.json`
- `artifacts/project-structure-context.json`

---

## 5) Matrix Compression Rule (for token control)

When consuming `docs/MCP_TOOL_CATALOG_101_MATRIX.md`, read in this order:

1. Baseline counts section
2. Family snapshot section
3. Release-readiness integrity notes
4. Full 1..101 rows only when audit/deep diff is required
