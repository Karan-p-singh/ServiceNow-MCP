# LLM Context Pack (Token-Optimized Entrypoint)

Last Updated: 2026-03-01 06:22 PST
Purpose: Single low-token entrypoint for LLM sessions. Use this before loading long governance docs.

---

## 1) Load Order (Recommended)

1. `docs/LLM_CONTEXT_PACK.md` (this file)
2. `Epics/EPICS_CONTEXT_COMPACT.md`
3. `docs/DOCS_CONTEXT_COMPACT.md`
4. `Epics/BUILD_STATUS_BOARD.md` (live queue)
5. `Epics/MILESTONES_AND_GATES.md` (gate checks)

Only read full historical files (`BUILD_ACTIVITY_LOG`, full 101 matrix rows) when audit depth is required.

---

## 2) Current Truth Snapshot

- Runtime baseline: **43 implemented / 101 target / 58 remaining**
- Gate state: **G1–G7 passed**, **G8 in progress**
- Current roadmap focus: **R2–R6**
- Companion mode: **optional pilot**, not baseline dependency

Truth precedence:

1. Runtime output (`npm run smoke:summary`)
2. `docs/MCP_TOOL_CATALOG_101_MATRIX.md`
3. Summary/governance trackers

---

## 3) Minimal Verification Commands

```bash
npm run smoke:summary
npm run test:g4:ci
npm run test:g7
```

---

## 4) Claim Guardrails (Mandatory)

- Do not present planned tools as implemented.
- Do not claim guaranteed rollback reversibility.
- Do not claim companion requirement for baseline runtime.
- Do not claim “100+ tools implemented” without runtime/matrix reconciliation.
