# ServiceNow MCP Server v2 — Product & Delivery Master

Last Updated: 2026-03-04  
Purpose: Consolidated product, scope, and phased-delivery reference replacing split PRD/timeline files.

---

## 1) Product Intent and Truth Policy

This project delivers a safe-by-default MCP server for ServiceNow with validation-first behavior and policy/tier governance.

Non-overclaim contract:

- ACL discovery is diagnostic unless optional companion authority is enabled.
- Dependency analysis is confidence-tiered evidence, not completeness proof.
- Commit/rollback outputs support controlled operations and planning, not guaranteed reversibility.
- ATF linkage is evidence signaling, not code-coverage proof.

Catalog truth precedence:

1. runtime: `npm run smoke:summary`
2. matrix: `docs/MCP_TOOL_CATALOG_101_MATRIX.md`
3. summary docs (`README.md`, epics trackers)

Current baseline: **101 implemented / 101 target / 0 remaining**.

---

## 2) Problem and Goals

### Problem

ServiceNow delivery is often slowed by hidden ACL/runtime context, update-set dependency ambiguity, and unsafe automation paths.

### Goals

1. Fast, structured read/navigation tooling.
2. Validation on read and gated writes.
3. Tier/policy enforcement before outbound calls.
4. Auditability and enterprise controls.
5. Companion authority as optional pilot, not baseline dependency.

### Non-goals

- Guaranteed rollback claims.
- Perfect external ACL emulation without platform-native context.

---

## 3) Scope

### In scope (Developer Edition)

- Core metadata, script/flow/workflow tools
- validation family (`sn.validate.*`)
- changeset/updateset/rollback planning tools
- policy controls, bundle controls, and audit telemetry

### In scope (ITSM/Admin extension track)

- edition-separated incident/change tooling and related operational APIs

---

## 4) Safety and Governance Model

- **T0** read-only
- **T1** low-risk guided writes
- **T2** standard writes
- **T3** high-risk operations with explicit `confirm=true` and `reason`

Policy controls:

- allowed scopes
- deny-global-writes
- changeset-scope enforcement
- exception allowlist + break-glass contract

---

## 5) Current Delivery State

- Gates **G1–G7: Passed**
- Gate **G8: In Progress** (process-only R6 release-cadence automation)
- Runtime tool inventory and matrix are reconciled at **101/101**

---

## 6) Roadmap Structure (R0–R6)

- **R0** catalog lock and governance matrix
- **R1** validation addendum completion
- **R2** dev parity clusters
- **R3** ATF signal track
- **R4** rollback snapshot maturity
- **R5** ITSM/Admin edition expansion
- **R6** docs/runtime drift guards and release-proof claim checks

---

## 7) Phase Plan Summary

### Phase 1–2

Foundation, transport, policy/tier enforcement, validation engine baseline, script lifecycle tooling.

### Phase 3–4

Optional companion authority pilot + update-set MVP (read, gaps, capture verify).

### Phase 5–6

Controlled commit + rollback planning, flow/workflow parity and validation expansion.

### Phase 7+

Enterprise hardening, release governance, and claim-integrity cadence.

---

## 8) Acceptance Anchors

Any major tool family is only considered complete when it has:

1. tier declaration and enforced preflight behavior,
2. policy checks,
3. validation integration,
4. structured audit output,
5. test evidence,
6. synchronized documentation.

---

## 9) Required Evidence Commands

```bash
npm run smoke:summary
npm run test:g4:ci
npm run test:g7
```

Use these outputs before updating claims in README or governance trackers.
