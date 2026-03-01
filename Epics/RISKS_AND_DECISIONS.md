# ServiceNow MCP Server v2 — Risks & Decisions Register

Last Updated: 2026-02-28 17:59 PST

---

## 1) Risk Register

Scales:

- Probability: `Low | Medium | High`
- Impact: `Low | Medium | High | Critical`
- Status: `Open | Monitoring | Mitigated | Closed`

| Risk ID | Risk                                                  | Probability | Impact   | Owner             | Mitigation Plan                                                               | Trigger / Early Signal                      | Status     |
| ------- | ----------------------------------------------------- | ----------- | -------- | ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ---------- |
| R-001   | Rulepack drift and governance challenge               | High        | High     | Eng Lead          | Versioned rulepacks, per-rule metadata, quarterly review                      | Frequent policy exceptions / rule disputes  | Open       |
| R-002   | Release/plugin variability breaks adapters            | High        | High     | Platform Eng      | Capability discovery + conditional adapters + fixture matrix                  | Endpoint/table mismatch in target instance  | Open       |
| R-003   | Companion app deployment blocked by governance        | Medium      | High     | SN Dev + Security | Safe degradation mode, read-only fallback, governance package docs            | Delayed scoped app approvals                | Monitoring |
| R-004   | Validation noise causes developer bypass              | Medium      | High     | Eng Lead          | Suppression workflow, severity tuning, telemetry-backed rule calibration      | Rising suppressions, reduced tool adoption  | Open       |
| R-005   | Cross-scope exceptions pressure weakens policy        | Medium      | High     | Architect         | Break-glass policy + mandatory justification + elevated audits                | Frequent break-glass requests               | Open       |
| R-006   | Update set dependency false confidence                | Medium      | Critical | Release Lead      | Confidence tiers + evidence-only outputs + explicit non-completeness contract | Incorrect dependency assumptions in deploys | Open       |
| R-007   | High-risk commit operations insufficiently controlled | Low         | Critical | Eng + Security    | T3 hard gating (`confirm + reason`), snapshots, rollback planning, alerting   | Attempted commit without proper context     | Monitoring |

---

## 2) Decision Log (ADR-lite)

| Decision ID | Date       | Decision                                              | Rationale                                        | Alternatives Considered            | Consequences                                         |
| ----------- | ---------- | ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------- | ---------------------------------------------------- |
| D-001       | 2026-02-28 | Build is organized by epics/stories with phase gates  | Enables predictable execution and accountability | Flat task checklist only           | Better traceability but requires disciplined updates |
| D-002       | 2026-02-28 | Track status in separate project files                | User requirement + durable history in repo       | External tracker only              | Repo-native transparency, low setup overhead         |
| D-003       | 2026-02-28 | Safe-by-default posture with tier/policy first        | Security/governance precede feature breadth      | Feature-first then hardening       | Slower early velocity, lower operational risk        |
| D-004       | 2026-02-28 | Companion app as authoritative source for ACL truth   | External reproduction is inherently incomplete   | Best-effort ACL only               | Requires SN app deployment but improves correctness  |
| D-005       | 2026-02-28 | Update set intelligence must declare confidence tiers | Avoid false certainty claims                     | Binary complete/incomplete scoring | More nuanced outputs, better risk communication      |

---

## 3) Active Blockers

No active blockers currently.

---

## 4) Update Protocol

Whenever a risk/decision changes:

1. Append or update this register.
2. Add corresponding entry in `BUILD_ACTIVITY_LOG.md`.
3. If milestone impact exists, update `MILESTONES_AND_GATES.md`.
