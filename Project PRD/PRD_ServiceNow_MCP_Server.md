# ServiceNow MCP Server v2 — Product Requirements Document (PRD)

**Product:** ServiceNow MCP Server (v2) + ServiceNow Companion App (Scoped)  
**Edition:** Developer Edition (baseline) with optional ITSM/Admin Edition add-on  
**Status:** Draft (Build-Ready)  
**Owners:** Product (You), Engineering (MCP Server), Platform (ServiceNow Companion)  
**Last updated:** 2026-02-28

---

## 1. Executive Summary

This product delivers a **safe-by-default, enterprise-ready MCP (Model Context Protocol) server** that enables LLM tools to **read, analyze, validate, and (when permitted) change** ServiceNow artifacts with **guardrails**.

The core differentiator is an **always-on Validation Engine** that attaches findings on read and blocks/warns on write, plus a **Companion App** that provides **authoritative platform-native checks** that cannot be accurately reproduced externally (notably **ACL evaluation** and certain scope/commit validations).

The design is intentionally “honest”:
- It **does not claim** perfect ACL reproduction via REST.
- It **does not claim** guaranteed rollback from update set commits.
- It uses **confidence tiers** and explicit limitations where the platform reality is messy.

---

## 2. Problem Statement

ServiceNow development and administration frequently suffers from:
- **Hidden platform context** (ACLs, domain separation, impersonation, scripted ACLs) that external tools can’t reliably emulate.
- **Update set gaps** from implicit dependencies (string sys_ids, flow action references, embedded scripts).
- **Unsafe automation** (LLM actions that can write to production, cross-scope, or bypass governance).
- **Slow feedback loops** (discover problems only after commit/deploy).

This MCP server must provide:
1) **Fast, accurate read navigation** and structured artifact retrieval.  
2) **Validation before action** (prevent “footguns”).  
3) **Controlled write capabilities** via tiering + scope policies + logging.  
4) **Companion App enforcement** for platform-native evaluations.

---

## 3. Users & Personas

### Primary
1) **ServiceNow Developer (Scoped App / Platform Dev)**
- Needs artifact discovery (scripts, flows, update sets).
- Wants quality, safety, dependency clarity, and commit confidence.

2) **ServiceNow Tech Lead / Architect**
- Wants governance compliance, risk signals, and auditability.
- Needs “truthful” output that declares limitations.

3) **Release Manager**
- Needs update set integrity, capture verification, conflict previews, and deployment readiness.

### Secondary
- **Platform Admin / ITSM Admin** (via ITSM edition): operational tasks, but with different threat model.
- **Security / GRC**: least privilege, audit logs, tool controls, no bypass of platform security.

---

## 4. Goals & Non-Goals

### Goals (What success looks like)
- **Safe by default:** production instances default to **T0 read-only**.
- **Actionable validation:** CRITICAL blocks writes; HIGH requires acknowledgment; MEDIUM/LOW advises.
- **Honest outputs:** confidence tiers for dependency discovery; explicit mode for ACL trace.
- **Enterprise acceptance:** least privilege + audit logging + configurable policies.

### Non-Goals
- “Magic rollback” that claims update set commits are reliably invertible.
- Perfect external ACL reproduction without platform-native evaluation.
- A replacement for CI/CD pipelines; this integrates with them, it doesn’t replace them.

---

## 5. Product Scope

### In Scope (Developer Edition)
- Instance introspection and metadata tools
- Script retrieval, search, dependency/reference tracing
- Flow and workflow retrieval, analysis, validation
- Update set inspection, gap detection (confidence-based), capture verification
- Controlled commits (tier gated) and rollback *planning* (not promises)
- Validation Engine across all supported artifact types

### In Scope (ITSM/Admin Edition add-on)
- Operational reads/writes (Incidents, Changes, Catalog, Users, etc.)
- Stronger governance controls (approvals, “break glass,” additional audits)

### Out of Scope
- Full-blown deployment orchestration (leave to DevOps toolchain)
- Bulk transformation or “mass change” operations without explicit enterprise approval pattern

---

## 6. Key Principles

1) **Tiered Safety Model**
- T0: Read-only
- T1: Safe writes (low-risk, reversible or scoped)
- T2: Write operations (standard changes)
- T3: Dangerous (commit, delete, cross-scope) with extra confirmations

2) **Policy-Driven Scope and Security**
- Allowed scopes list
- Cross-scope write protection
- Optional global write deny
- Enforced update set scope alignment
- Optional warning on global reads

3) **Validation-First**
- Validation on **read** (informational)
- Validation on **write** (gated)
- Validation runs **in-process** to keep tool latency low

4) **Honesty & Confidence**
- Outputs declare limitations and confidence rather than pretending certainty.

---

## 7. System Overview

### Components
1) **MCP Server (TypeScript)**
- Tool registry, tier enforcement, policy engine
- ServiceNow REST client
- Validation engine + rulepacks
- Auditing and structured outputs

2) **ServiceNow Companion App (Scoped)**
- Scripted REST endpoints for platform-native evaluation
- Authoritative ACL/security evaluation endpoint
- Scope guard checks and commit/capture helpers
- Versioned, installable artifact

---

## 8. Functional Requirements (Detailed)

### 8.1 Tiering & Safety Controls
**Requirements**
- Every tool declares tier (T0–T3).
- Each instance has `tier_max` with environment defaults:
  - Production: T0
  - Non-prod: T1/T2 configurable
  - Sandbox/dev: T3 allowed if enabled

**Acceptance Criteria**
- Calls above `tier_max` are rejected without reaching ServiceNow.
- T3 requires explicit `confirm=true` and a `reason` string that is logged.
- Tool outputs include tier and policy results metadata.

---

### 8.2 Authentication & Instance Connectivity
**Requirements**
- Support ServiceNow OAuth (recommended) and basic auth (optional, discouraged).
- Allow multiple instances with independent policies (dev/test/prod).
- Protect secrets via environment variables or secret manager integration.

**Acceptance Criteria**
- Connection test tool returns instance metadata and capability discovery.
- Credentials never appear in logs or tool outputs.
- Instance config can disable specific bundles/tools.

---

### 8.3 Companion App (ServiceNow-side)
**Requirements**
- Scoped app deliverable with versioning.
- Scripted REST endpoints for:
  - Authoritative ACL/security evaluation
  - Scope guard checks
  - Update set capture verification helpers (where needed)

**Acceptance Criteria**
- MCP Server detects Companion presence and version.
- If missing/outdated, tools degrade safely (explicitly) or refuse operations requiring authority.

---

### 8.4 ACL Trace (Dual Mode)
**Requirements**
- `sn.acl.trace` supports:
  - Discovery mode: best-effort based on sys_security_acl tables and roles
  - Authoritative mode: calls Companion endpoint to evaluate using platform engine

**Acceptance Criteria**
- Output includes `mode`, `decision`, `confidence`, and `limitations` (mandatory in discovery).
- Authoritative mode returns platform-native outcome with context used.

---

### 8.5 Artifact Retrieval & Navigation (Scripts/Flows/Workflows)
**Requirements**
- `sn.script.get`, `sn.script.search`, `sn.script.refs`, `sn.script.deps`
- `sn.flow.get`, `sn.flow.list`, `sn.flow.validate`
- `sn.workflow.get`, `sn.workflow.list`, `sn.workflow.validate`

**Acceptance Criteria**
- All artifact reads attach validation summary (see 8.7).
- Large results are paginated.
- Cross-references include evidence (table/field/line where possible).

---

### 8.6 Update Set Operations
**Requirements**
- Inspect update set contents and metadata.
- Detect missing dependencies via confidence tiers:
  - Hard deps (high confidence)
  - Soft deps (medium confidence)
  - Heuristic deps (low confidence; evidence required)
- Capture verification:
  - Confirm whether a record was captured; explain why not.

**Acceptance Criteria**
- Gaps output never claims completeness.
- Capture verify returns deterministic reasons for common failure modes.
- Commit supports dry-run preview and conflict reporting (tier gated).

---

### 8.7 Validation Engine (Core)
**Requirements**
- Validation runs on every supported artifact type on read and write.
- Severity model:
  - CRITICAL: block write
  - HIGH: require acknowledgment token
  - MEDIUM/LOW: advisory
- “On read” returns a concise summary; “validate” tools return full report.

**Acceptance Criteria**
- Validation is deterministic for the same input + config.
- Validation execution time typically under 50ms for common artifacts (rulepack optimized).
- Write tools require `acknowledged_findings[]` for HIGH severity.

---

### 8.8 Observability & Audit Logging
**Requirements**
- Structured logs for all tool invocations:
  - instance, edition, tool, tier, user/context, request_id
  - policy decisions
  - validation summary counts
  - writes: table/sys_id/action/before-after identifiers
- Optional export to SIEM via webhook

**Acceptance Criteria**
- Logs are JSON structured, redact secrets, and include correlation IDs.
- Writes are auditable and replayable at the metadata level.

---

## 9. Data Requirements

### Core ServiceNow Data Surfaces
- Scripts: sys_script_include, sys_script, sys_ui_script, etc.
- Flows: sys_hub_flow, sys_hub_action_type, sys_hub_step_instance, etc.
- Workflows: wf_workflow, wf_activity, etc.
- Update sets: sys_update_set, sys_update_xml
- Dictionary/table metadata: sys_dictionary, sys_db_object
- Security: sys_security_acl, sys_security_acl_role, sys_user_has_role

**Note:** Exact table usage is implementation-specific and must be release-aware.

---

## 10. Security Requirements

- Least-privilege service account per instance.
- Companion endpoints protected by dedicated role (e.g., `x_mcp_companion.api_user`).
- Optional IP allowlisting and mTLS in front of MCP server (enterprise deployment).
- “Break glass” mode requires additional controls:
  - explicit enablement
  - required justification string
  - elevated logging and alerting

---

## 11. Risks & Issues (Explicit)

1) **Rulepack drift and governance scrutiny**
- Enterprises will ask “what rules, what version, what source.”
- Mitigation: rulepack versioning + per-rule metadata and review cadence.

2) **Release/plugin variability**
- Flow/ATF internals and tables vary by release and installed plugins.
- Mitigation: capability discovery + conditional rules.

3) **Scope enforcement exceptions**
- Some global/shared artifacts may require controlled exceptions.
- Mitigation: explicit allowlist + logged break-glass.

4) **Impersonation/domain separation constraints**
- Authoritative evaluation must handle domain separation realities.
- Mitigation: defined support matrix + explicit error codes.

5) **Update set snapshot limitations**
- Some artifacts are not restorable.
- Mitigation: snapshot coverage matrix + “not restorable” declared outputs.

---

## 12. Release Criteria

### MVP Exit (Developer Edition)
- Tier enforcement and per-instance policy config
- Script read/search/navigation + validation summaries on read
- Validation engine with blocking/warn/ack flow on writes (at least for scripts)
- Update set inspection + gap detection (hard + soft)
- Companion App baseline with authoritative ACL evaluation endpoint
- Structured audit logs

### v1 Exit
- Full validation coverage across scripts + flows + workflows + catalog scripts
- Capture verify robust across common failure modes
- Commit preview and controlled commit path with rollback planning
- Tool bundles and governance controls for enterprise certification

---

## 13. Appendix — Terminology

- **MCP:** Model Context Protocol (tool interface layer for LLMs)
- **Companion App:** Scoped ServiceNow app providing platform-native evaluations and guardrails
- **Tier:** Safety level assigned to each tool call (T0–T3)
- **Rulepack:** Versioned set of validation rules (configurable, release-aware)
