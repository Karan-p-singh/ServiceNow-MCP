# Epics — Compact LLM Context

Last Updated: 2026-03-01 06:23 PST
Purpose: Low-token operational summary of all `Epics/*.md` files for LLM prompting.
Truth policy: Runtime (`npm run smoke:summary`) > matrix (`docs/MCP_TOOL_CATALOG_101_MATRIX.md`) > summary docs.

---

## 1) Program Snapshot (Current)

- Gates **G1–G7: Passed**
- Gate **G8: In Progress** (catalog claim integrity for 101-tool program)
- Runtime tools: **101 implemented / 101 target / 0 remaining**
- Current execution focus: **R2–R6** roadmap (R1/D5 validation family completed)
- Companion authority: **optional pilot**, not baseline dependency

---

## 2) File-by-File Compact Purpose (Epics Folder)

| Source File                                           | Keep in LLM context    | One-line meaning                                                   |
| ----------------------------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `Epics/BUILD_STATUS_BOARD.md`                         | Yes (high)             | Live backlog/ready/done board and immediate next execution queue   |
| `Epics/MILESTONES_AND_GATES.md`                       | Yes (high)             | Gate checklists, gate state, and release-decision criteria         |
| `Epics/IMPLEMENTATION_PLAN_EPICS_STORIES.md`          | Yes (medium)           | Canonical epic/story structure and R0–R6 roadmap framing           |
| `Epics/RISKS_AND_DECISIONS.md`                        | Yes (medium)           | Active risks, ADR-lite decisions, blockers                         |
| `Epics/BUILD_ACTIVITY_LOG.md`                         | Yes (low, recent only) | Historical transition log; use latest entries only unless auditing |
| `Epics/ALIGNMENT_REVIEW_PRD_EPICS_CODE_2026-02-28.md` | Optional (historical)  | Historical alignment snapshot, not current execution truth         |

---

## 3) Compressed Operational State

### 3.1 Active backlog from board

- `C3` — Scope/capture helper endpoints
- `D4` — Rulepack and gating governance

### 3.2 High-value “done” context to retain

- Foundation/runtime safety complete (A1–A6)
- ServiceNow connectivity/client baseline complete (B1–B4)
- Script lifecycle + validation MVP complete (D1–D3, E1–E3)
- Companion optional pilot baseline complete (C1/C2/C4)
- Update set/commit/rollback planning complete (F1–F6)
- Flow/workflow parity complete (E4/E5)
- Enterprise readiness automation + docs pack complete (G7)
- Validation addendum family complete (`sn.validate.*`, R1/D5)

### 3.3 Gate G8 unfinished tracks

- R2: Dev parity clusters
- R3: ATF signals (`sn.atf.coverage_signals`)
- R4: rollback snapshot family (`sn.rollback.snapshot.create` + related)
- R5: ITSM/Admin edition separation
- R6: docs/runtime drift checks in release automation

---

## 4) Build Activity Log Compression Rule (for LLM prompts)

When using `Epics/BUILD_ACTIVITY_LOG.md` (~very long), include only:

1. Last **10–15** entries
2. Any entry affecting current gate state
3. Any entry containing blocker creation/removal

Ignore older chronology unless explicitly requested for audit.

---

## 5) Recommended Prompt Input Order (Epics only)

1. `Epics/BUILD_STATUS_BOARD.md`
2. `Epics/MILESTONES_AND_GATES.md`
3. `Epics/RISKS_AND_DECISIONS.md`
4. `Epics/IMPLEMENTATION_PLAN_EPICS_STORIES.md` (target section only)
5. `Epics/BUILD_ACTIVITY_LOG.md` (recent entries only)
