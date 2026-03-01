# ServiceNow MCP Server v2 — Detailed Build Plan & Timeline

**Purpose:** Implementation-ready phased plan aligned to revised v2 architecture + validation addendum.  
**Assumptions:** Single team or small squad (1–3 engineers); companion path is optional/deprioritized.  
**Timeline Format:** Weeks are indicative. If you execute faster, compress. If enterprise governance is heavy, expand.

> This timeline is now anchored to a strict non-overclaim delivery contract:
>
> - discovery-first ACL baseline,
> - confidence-tier dependency outputs,
> - no rollback guarantees,
> - validation-engine-first rollout.

---

## 0) Delivery Strategy (How we will ship)

### 101-Tool Program Governance (new mandatory overlay)

- Canonical tool-count and per-tool status tracker: `docs/MCP_TOOL_CATALOG_101_MATRIX.md`
- Runtime verification command for implemented tools: `npm run smoke:summary`
- Current baseline: **43 implemented / 101 target / 58 remaining**

Before any 100+ tool readiness claim, reconcile:

1. Runtime registered tools
2. 101 matrix implemented count
3. Story/gate/risk status language in epics docs

### Release Tracks

- **MVP (Dev Edition):** Read + Validate + Safe guardrails + discovery-first ACL tracing
- **v1 (Dev Edition complete):** expanded validation coverage + changeset maturity + controlled commit/rollback planning
- **v1.1 (Enterprise hardening):** SIEM integration, deploy profiles, policy templates, rulepack governance
- **ITSM Edition (Optional Track):** operational tools under separate threat model

### Post-G7 Catalog Completion Milestones (R0..R6)

- **R0 (Done):** 101-tool matrix lock artifact created and linked across docs
- **R1 (Next):** D5 validation addendum completion (`sn.validate.*` family)
- **R2:** Dev parity clusters (metadata/diagnostics + script/flow/workflow/changeset parity)
- **R3:** ATF tooling and `sn.atf.coverage_signals`
- **R4:** rollback snapshot maturity (`sn.rollback.snapshot.create` + related surfaces)
- **R5:** ITSM/Admin edition track under strict edition boundaries
- **R6:** docs/runtime drift guards + release-proof catalog claim checks

### Revised High-Risk Contract Track (must be explicit in docs and implementation)

1. `sn.acl.trace`: discovery (default) + optional authoritative mode, with explicit limitations
2. `sn.changeset.gaps`: hard/soft/heuristic confidence tiers + evidence schema
3. `sn.changeset.commit`: controlled T3 commit contract, no rollback promise
4. `sn.rollback.*`: snapshot + rollback plan with non-restorable declarations
5. `sn.atf.coverage_signals`: evidence linkage semantics, not code coverage

### Engineering Principles

- Ship vertical slices: **tool → retrieval → validation → policy → audit** in one pass.
- Never ship a write tool without:
  - tier gating
  - validation gating
  - policy checks
  - audit logging

---

## 1) Backlog Structure

### Workstreams

A. **Core MCP Server Framework** (tool registry, tier enforcement, config, logging)  
B. **ServiceNow Client + Data Access** (REST client, pagination, table adapters)  
C. **Optional Companion Authority Pilot** (authoritative endpoints + versioning; non-baseline)  
D. **Validation Engine + Rulepacks** (in-process rules, reporting, gating; expanded artifact coverage)  
E. **Developer Tools** (scripts, flows, workflows navigation)  
F. **Update Set Tools** (inspect, gaps, capture verify, preview, commit, rollback plan)  
G. **Quality & Testing** (unit tests, integration tests, golden fixtures)  
H. **Enterprise Hardening** (security, SIEM, packaging, docs)

---

## 2) Timeline Overview (High-Level)

### Phase 1 (Weeks 1–2): Foundation + First Vertical Slice

- MCP server skeleton, config, tiering, auditing
- ServiceNow client + `sn.instance.info`
- Script read + validation summary (basic)

### Phase 2 (Weeks 3–5): Validation Engine MVP + Script Tooling

- Validation engine framework + script rulepack v1
- Script search/refs/deps
- Write gating for scripts (T1/T2) with CRITICAL/HIGH logic

### Phase 3 (Weeks 6–8): Optional Companion Authority Pilot + ACL Trace Contract Hardening

- Companion packaging (optional pilot), version contract
- Scripted REST endpoints for ACL evaluation + scope checks (pilot only)
- `sn.acl.trace` revised dual-mode output contract and explicit degraded reason codes

### Phase 4 (Weeks 9–12): Update Sets MVP (Read + Gaps + Capture Verify)

- Update set list/get, contents, export
- Gap detection with confidence tiers (hard + soft + heuristic with evidence)
- Capture verification tool and failure mode reasons

### Phase 5 (Weeks 13–16): Commit Preview + Controlled Commit + Rollback Planning

- Commit preview dry-run, conflict output
- Commit tool (T3) with explicit confirm/reason + snapshot-before metadata
- Non-restorable declarations and manual steps

### Phase 6 (Weeks 17–20): Flows + Workflows + Validation Coverage Expansion

- Flow fetch/list/validate + richer rules
- Workflow fetch/list/validate
- Expanded validation family contracts (`sn.validate.*`) and cross-cutting security checks
- Cross-artifact references and dependency improvements

### Phase 7 (Weeks 21–24): Enterprise Hardening + Release Readiness

- SIEM/webhook export, config templates
- Tool bundle enablement
- Comprehensive docs + golden tests
- Security review artifacts
- Documentation contract audit (implemented vs planned tool catalog, non-overclaim language)

---

## 3) Phase-by-Phase Detailed Plan

## Phase 1 (Weeks 1–2): Foundation + First Slice

### Epic A1: MCP Server Skeleton

**Deliverables**

- MCP server process entrypoint
- Tool registry framework
- Common request/response schema
- Correlation IDs

**Tasks**

1. Implement server startup and tool registration
2. Implement standard tool response envelope:
   - `request_id`, `instance`, `edition`, `tool`, `tier`, `policy`, `validation_summary`, `data`, `errors`
3. Implement structured logging with redaction

**Acceptance Criteria**

- Server starts and lists tools
- Every tool call returns structured envelope
- Logs redact secrets

---

### Epic A2: Tier Enforcement

**Tasks**

1. Add tier metadata to each tool definition
2. Implement `tier_max` config and enforcement middleware
3. Implement T3 confirmation contract:
   - require `confirm=true` and `reason`

**Acceptance Criteria**

- Tools above tier_max never call ServiceNow
- T3 tools refuse without confirm+reason

---

### Epic B1: ServiceNow REST Client (Baseline)

**Tasks**

1. Implement auth modes (OAuth first; basic optional)
2. Implement GET/POST/PATCH with retries and backoff
3. Implement pagination helpers for Table API
4. Standard error mapping (401/403/404/429/5xx)

**Acceptance Criteria**

- Can call `sn.instance.info` and return instance metadata
- Handles pagination and rate limiting gracefully

---

### Epic E1: Script Read Tool + Minimal Validation Summary

**Tasks**

1. `sn.script.get` for Script Includes (start with sys_script_include)
2. Attach placeholder validation summary:
   - `findings_count_by_severity` (initially minimal)

**Acceptance Criteria**

- Retrieve script + return summary
- Summary present even if rulepack minimal

**Exit Gate (Phase 1)**

- Tool registry + tiering + audit logs working
- ServiceNow connectivity proven
- One artifact read tool operational

---

## Phase 2 (Weeks 3–5): Validation MVP + Script Tooling

### Epic D1: Validation Engine Framework

**Tasks**

1. Rule interface:
   - id, title, severity, category, description
   - match/apply functions
2. Validation context model:
   - instance capabilities, release, plugins, scope
3. Engine runtime:
   - run rules for an artifact type
   - build report and summary

**Acceptance Criteria**

- `sn.script.validate` returns full report
- `sn.script.get` includes summary derived from same engine

---

### Epic D2: Rulepack v1 (Scripts)

**Rule Categories**

- Security: eval usage, unsafe GlideRecord patterns, insecure client calls
- Maintainability: excessive complexity, missing comments (configurable), duplicate logic hints
- Performance: query-in-loop warnings, missing limits, synchronous calls in client
- Platform correctness: business rule recursion risks, improper update patterns

**Tasks**

1. Implement baseline script rules aligned to v2 quality/security/performance contracts
2. Add rule metadata and per-rule suppression config
3. Add rulepack versioning + change notes

**Acceptance Criteria**

- At least 10 CRITICAL/HIGH rules that block/require ack
- Rulepack version included in all reports

---

### Epic E2: Script Navigation Tools

**Tools**

- `sn.script.search`
- `sn.script.refs` (who calls this)
- `sn.script.deps` (what this calls)
- `sn.script.list`

**Tasks**

1. Implement search by name/scope/table
2. Implement reference scanning:
   - direct sys_id fields (hard)
   - text/regex (soft/heuristic)
3. Return evidence arrays for refs/deps

**Acceptance Criteria**

- Search returns paginated results
- refs/deps include evidence

---

### Epic E3: Script Write Tools (Tiered)

**Tools**

- `sn.script.update` (T1/T2 based on policy)
- `sn.script.create` (T2)

**Tasks**

1. Implement write gating:
   - run validation on proposed content
   - block CRITICAL
   - require `acknowledged_findings[]` for HIGH
2. Audit log before/after metadata
3. Optional “dry_run” to show validation results only

**Acceptance Criteria**

- Writes cannot proceed with CRITICAL findings
- HIGH findings require explicit acknowledgments
- Audit log contains table/sys_id/action

**Exit Gate (Phase 2)**

- Validation engine functional for scripts
- Script tooling usable end-to-end (read → validate → change)

---

## Phase 3 (Weeks 6–8): Optional Companion Authority Pilot + ACL Trace Authoritative Mode

### Epic C1: Optional Companion Packaging & Version Contract (Pilot)

**Tasks**

1. Create scoped app skeleton: `x_mcp_companion`
2. Add version record and `/health` endpoint
3. Define required roles (e.g., `x_mcp_companion.api_user`)

**Acceptance Criteria**

- MCP server detects installed version
- Missing/outdated/disabled results in explicit degradation output while discovery mode remains baseline

---

### Epic C2: Authoritative ACL Evaluation Endpoint (Pilot)

**Tasks**

1. Implement Scripted REST endpoint:
   - input: user/context, table, sys_id, operation
   - output: allow/deny + evaluated ACLs + reasoning summary
2. Lock down endpoint:
   - role requirement
   - optional IP restriction support (documented)

**Acceptance Criteria**

- `sn.acl.trace` returns `mode=authoritative` when available
- Discovery mode remains default and works without Companion while declaring limitations

---

### Epic A3: Policy Engine Enhancements (Scope)

**Tasks**

1. Implement allowed_scopes checks
2. Implement deny_global_writes, enforce_changeset_scope
3. Add exceptions allowlist and break-glass mode contract

**Acceptance Criteria**

- Cross-scope writes blocked when enabled
- Exceptions require explicit justification

**Exit Gate (Phase 3)**

- Companion app deliverable exists and is installable
- ACL trace honest dual-mode operational

---

## Phase 4 (Weeks 9–12): Update Sets MVP (Read + Gaps + Capture Verify)

### Epic F1: Update Set Read Tooling

**Tools**

- `sn.changeset.list`
- `sn.changeset.get`
- `sn.changeset.contents`
- `sn.changeset.export`

**Acceptance Criteria**

- Contents paginated and include record identifiers and type

---

### Epic F2: Dependency Gaps (Confidence-Based)

**Tasks**

1. Implement hard dependency detection:
   - dictionary references
   - sys_update_xml dependencies
2. Implement soft dependency detection:
   - known reference fields
3. Implement heuristic detection:
   - string scanning for sys_ids, names, script includes, action IDs
4. Produce ranked output with confidence and evidence

**Acceptance Criteria**

- Output uses confidence tiers and never claims completeness
- Evidence included for each gap

---

### Epic F3: Capture Verification

**Tasks**

1. Given table/sys_id, determine if captured in update set
2. If not, return likely reasons:
   - table excluded
   - wrong scope
   - update set not current
   - bypassed tracking (API update)
3. Optional companion integration for improved authority when pilot mode is enabled

**Acceptance Criteria**

- Deterministic results for common cases
- Human-usable reasons list

**Exit Gate (Phase 4)**

- Update set inspection and gaps are reliable enough for daily use
- Capture verify prevents common deployment misses

---

## Phase 5 (Weeks 13–16): Commit Preview + Controlled Commit + Rollback Planning

### Epic F4: Commit Preview (Dry Run)

**Tasks**

1. Generate preview report:
   - number of changes
   - conflicts
   - affected scopes
2. Provide recommended mitigation steps

**Acceptance Criteria**

- Preview works without writing anything
- Outputs are structured and actionable

---

### Epic F5: Commit Tool (T3) + Snapshot Before Commit

**Tasks**

1. Implement commit (requires confirm+reason)
2. Create snapshot-before metadata where possible
3. Record snapshot coverage matrix per artifact type

**Acceptance Criteria**

- No commit without confirm+reason
- Snapshot coverage explicitly reported
- Audit log includes preview + commit metadata

---

### Epic F6: Rollback Plan Generator (Not a Promise)

**Tasks**

1. Given snapshot + commit output, generate rollback plan:
   - what can be restored
   - what is not restorable
   - manual steps
2. Tool outputs “risk level” and required approvals

**Acceptance Criteria**

- Plan clearly calls out non-restorable items
- Never outputs “guaranteed rollback” language

---

## 3.1 Validation Engine Expansion Track (Addendum Alignment)

Target tool contracts to add/expand:

- `sn.validate.script_include`
- `sn.validate.business_rule`
- `sn.validate.client_script`
- `sn.validate.ui_script`
- `sn.validate.flow`
- `sn.validate.workflow`
- `sn.validate.catalog_policy`
- `sn.validate.fix`

Target rule coverage categories:

- Performance (`PERF-*`)
- Security (`SEC-*`)
- Best Practice (`BP-*`)
- Flow-specific (`FLOW-*`)

Write-gate contract remains:

- CRITICAL → reject
- HIGH → requires `acknowledged_findings[]`
- MEDIUM/LOW → advisory

**Exit Gate (Phase 5)**

- Controlled commit path exists for non-prod and explicitly-approved scenarios
- Rollback plan exists and is honest

---

## Phase 6 (Weeks 17–20): Flows + Workflows Full Coverage

### Epic E4: Flow Tools

**Tools**

- `sn.flow.list`
- `sn.flow.get`
- `sn.flow.validate`

**Tasks**

1. Implement flow retrieval adapters (release-aware)
2. Expand validation rules for flow error handling, input validation, action usage, naming standards
3. Add cross-artifact references (script actions, subflows)

**Acceptance Criteria**

- Flow validation produces meaningful CRITICAL/HIGH findings

---

### Epic E5: Workflow Tools (Classic)

**Tools**

- `sn.workflow.list`
- `sn.workflow.get`
- `sn.workflow.validate`

**Acceptance Criteria**

- Workflows are parsed and validated with release-aware adapters

**Exit Gate (Phase 6)**

- Flows/workflows supported at parity with scripts (read + validate)

---

## Phase 7 (Weeks 21–24): Enterprise Hardening + Release Readiness

### Epic H1: SIEM / Webhook Export

**Tasks**

1. Add optional webhook sink for tool call logs
2. Support filtering on writes or CRITICAL/HIGH events

**Acceptance Criteria**

- Enterprise can route audit events to SIEM

---

### Epic H2: Tool Bundles & Deploy Profiles

**Tasks**

1. Implement bundle enablement:
   - dev_core, dev_validation, dev_changesets, dev_commit, itsm_ops
2. Provide sample configs per environment

**Acceptance Criteria**

- Production can run with minimal surface area (T0 + limited bundles)

---

### Epic G1: Comprehensive Testing

**Tasks**

1. Unit tests for validation rules and engine
2. Integration tests with a dev instance:
   - tier blocks
   - policy blocks
   - companion mode behavior
   - update set gaps and capture verify
3. Golden fixtures for artifact payloads

**Acceptance Criteria**

- CI passes with deterministic rule results

---

### Epic H3: Documentation + Security Pack

**Deliverables**

- Security model doc (roles, endpoints, logging)
- Rulepack governance doc
- Admin guide (install + config)

**Exit Gate (Phase 7)**

- Release-ready package for enterprise evaluation
- Documented threat model and governance controls

---

## 4) Detailed Feature List (By Tool Group)

### Group 1: Core

- instance.info
- config.get
- policy.test
- audit.ping

### Group 2: Scripts

- get/list/search
- validate (full)
- refs/deps
- create/update (tier gated)

### Group 3: ACL / Security

- acl.trace discovery + authoritative
- policy scope checks

### Group 4: Update Sets

- list/get/contents/export
- gaps (confidence tiers)
- capture.verify
- commit.preview
- commit (T3)
- rollback.snapshot.create
- rollback.plan.generate

### Group 5: Flows/Workflows

- list/get/validate
- refs/deps expansions

---

## 5) Resourcing Notes (Reality Check)

**Minimum viable team**

- 1 TS engineer for MCP server core + SN REST adapters
- 1 SN developer for Companion App endpoints + packaging (can be part-time)
- 0.5 QA/test automation focus (can be engineer time initially)

**Biggest time sinks**

- release-aware table differences
- dependency inference without false claims
- enterprise security review iterations
- rulepack tuning to avoid noisy false positives

---

## 6) Risks and Mitigations (Operational)

- **Risk:** Devs bypass tool due to strict policies  
  **Mitigation:** exceptions + break-glass with logging

- **Risk:** Validation too noisy  
  **Mitigation:** suppression config + severity tuning + rulepack versioning

- **Risk:** Companion app not deployable due to governance  
  **Mitigation:** degrade safely; allow read-only usage without it

---

## 7) Definition of Done (DoD)

A feature/tool is “done” only when:

1. Tier declared and enforced
2. Policy checks implemented
3. Validation integrated (read summary + write gating)
4. Auditing emits structured logs
5. Documentation updated
6. Tests added (unit or integration as appropriate)
