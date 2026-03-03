# LLM Start Here (Root Context Entrypoint)

Last Updated: 2026-03-01 06:22 PST
Purpose: Root-level, token-efficient starting point for LLM sessions in this repository.

---

## 1) Default Context Load Order (Use this exact order)

1. `LLM_START_HERE.md` (this file)
2. `docs/LLM_CONTEXT_PACK.md`
3. `Epics/EPICS_CONTEXT_COMPACT.md`
4. `docs/DOCS_CONTEXT_COMPACT.md`
5. `Epics/BUILD_STATUS_BOARD.md`
6. `Epics/MILESTONES_AND_GATES.md`

Load deep/history-heavy docs only on demand:

- `Epics/BUILD_ACTIVITY_LOG.md`
- Full `docs/MCP_TOOL_CATALOG_101_MATRIX.md` row scan

---

## 2) Context Efficiency Rules

1. Start with compact docs first; avoid loading long historical files early.
2. Read only the section needed for the current task (not full-document by default).
3. Use runtime truth before summaries:
   - `npm run smoke:summary` > matrix > summary docs.

---

## 3) Current Truth Snapshot

- Runtime baseline: **101 implemented / 101 target / 0 remaining**
- Gates **G1–G7 passed**; **G8 in progress**
- Companion authority is **optional pilot**, not baseline requirement

---

## 4) Quick Verification Commands

```bash
npm run smoke:summary
npm run test:g4:ci
npm run test:g7
```
