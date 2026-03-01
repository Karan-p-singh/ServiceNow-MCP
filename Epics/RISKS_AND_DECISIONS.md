# ServiceNow MCP Server v2 — Risks & Decisions Register

Last Updated: 2026-03-01 00:16 PST

---

## 1) Risk Register

Scales:

- Probability: `Low | Medium | High`
- Impact: `Low | Medium | High | Critical`
- Status: `Open | Monitoring | Mitigated | Closed`

| Risk ID | Risk                                                  | Probability | Impact   | Owner             | Mitigation Plan                                                                | Trigger / Early Signal                       | Status     |
| ------- | ----------------------------------------------------- | ----------- | -------- | ----------------- | ------------------------------------------------------------------------------ | -------------------------------------------- | ---------- |
| R-001   | Rulepack drift and governance challenge               | High        | High     | Eng Lead          | Versioned rulepacks, per-rule metadata, quarterly review                       | Frequent policy exceptions / rule disputes   | Monitoring |
| R-002   | Release/plugin variability breaks adapters            | High        | High     | Platform Eng      | Capability discovery + conditional adapters + fixture matrix                   | Endpoint/table mismatch in target instance   | Open       |
| R-003   | Companion app deployment blocked by governance        | Medium      | High     | SN Dev + Security | Safe degradation mode, read-only fallback, governance package docs             | Delayed scoped app approvals                 | Mitigated  |
| R-004   | Validation noise causes developer bypass              | Medium      | High     | Eng Lead          | Suppression workflow, severity tuning, telemetry-backed rule calibration       | Rising suppressions, reduced tool adoption   | Open       |
| R-005   | Cross-scope exceptions pressure weakens policy        | Medium      | High     | Architect         | Break-glass policy + mandatory justification + elevated audits                 | Frequent break-glass requests                | Open       |
| R-006   | Update set dependency false confidence                | Medium      | Critical | Release Lead      | Confidence tiers + evidence-only outputs + explicit non-completeness contract  | Incorrect dependency assumptions in deploys  | Open       |
| R-007   | High-risk commit operations insufficiently controlled | Low         | Critical | Eng + Security    | T3 hard gating (`confirm + reason`), snapshots, rollback planning, alerting    | Attempted commit without proper context      | Monitoring |
| R-008   | Connectivity tests miss protocol contract regressions | Medium      | High     | Eng/QA            | Assertion-driven MCP diagnostics covering positive and negative JSON-RPC paths | Transport logs succeed while contract drifts | Mitigated  |

---

## 2) Decision Log (ADR-lite)

| Decision ID | Date       | Decision                                                                                                                 | Rationale                                                                   | Alternatives Considered                | Consequences                                                                                                               |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| D-001       | 2026-02-28 | Build is organized by epics/stories with phase gates                                                                     | Enables predictable execution and accountability                            | Flat task checklist only               | Better traceability but requires disciplined updates                                                                       |
| D-002       | 2026-02-28 | Track status in separate project files                                                                                   | User requirement + durable history in repo                                  | External tracker only                  | Repo-native transparency, low setup overhead                                                                               |
| D-003       | 2026-02-28 | Safe-by-default posture with tier/policy first                                                                           | Security/governance precede feature breadth                                 | Feature-first then hardening           | Slower early velocity, lower operational risk                                                                              |
| D-004       | 2026-02-28 | Companion app as authoritative source for ACL truth                                                                      | External reproduction is inherently incomplete                              | Best-effort ACL only                   | Requires SN app deployment but improves correctness                                                                        |
| D-005       | 2026-02-28 | Update set intelligence must declare confidence tiers                                                                    | Avoid false certainty claims                                                | Binary complete/incomplete scoring     | More nuanced outputs, better risk communication                                                                            |
| D-006       | 2026-02-28 | README structure is target architecture for Epic B+ with incremental migration                                           | Maintain architectural consistency without disruptive refactor risk         | Immediate full TS/v2 restructure       | Predictable folder ownership now; controlled path to TS/v2 over time                                                       |
| D-007       | 2026-02-28 | MCP transport defaults to HTTP/SSE URL endpoint with stdio fallback                                                      | Maximize compatibility for URL-based LLM integrations                       | Keep stdio as default                  | Easier client onboarding via `http://localhost:3001/mcp`; maintain backward compatibility via `MCP_TRANSPORT=stdio`        |
| D-008       | 2026-02-28 | Connectivity diagnostics are assertion-driven and CI-gate friendly                                                       | Reduce false positives from log-only checks and detect contract drift early | Human log review only                  | Faster regression detection for MCP protocol/tool-call contracts; more deterministic release confidence                    |
| D-009       | 2026-02-28 | Gate G2 validation runtime enforces deterministic CRITICAL/HIGH write gating                                             | Align script lifecycle safety with PRD (`CRITICAL` block + `HIGH` ack flow) | Advisory-only validation               | Safer script write path with explicit acknowledgment obligations and standardized gate error codes                         |
| D-010       | 2026-03-01 | `sn.acl.trace` is implemented as dual-mode (authoritative + discovery fallback) with deterministic degraded reason codes | Preserve truthful ACL outputs when Companion authority is unavailable       | Fail closed whenever Companion missing | Gate G3 can pass with explicit limitations while keeping platform-honest behavior and audit-friendly degradation signaling |

---

## 3) Active Blockers

No active blockers currently.

---

## 4) Update Protocol

Whenever a risk/decision changes:

1. Append or update this register.
2. Add corresponding entry in `BUILD_ACTIVITY_LOG.md`.
3. If milestone impact exists, update `MILESTONES_AND_GATES.md`.
