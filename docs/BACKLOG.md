# LocalBridge Future Roadmap & Backlog

This document tracks planned features, architectural improvements, and security enhancements scheduled for future milestones (P1 / P2).

---

## P1 / P2 Backlog Items

### 1. Project-Scoped Approval Policy (P1 / P2)
- **Context & Motivation**:
  In LocalBridge v1.2.0 P0, approval policies and risk ratings (`SAFE`, `CONFIRM`, `DANGEROUS`) are managed globally across all authorized workspaces. Certain enterprise and multi-repo development workflows require granular, project-specific approval rules (e.g., allowing automated builds in a sandbox repo while strictly requiring human-in-the-loop confirmation for critical infrastructure repos).
- **Scope & Proposed Features**:
  1. **Per-Project Policy Overrides**: Configure risk thresholds (`SAFE`, `CONFIRM`, `DANGEROUS`) on a per-authorized-project basis.
  2. **Scoped Command Whitelisting**: Define allowed shell commands and patterns restricted to specific project paths.
  3. **Auto-Approval Rules**: Allow pre-approved deterministic read/test commands within designated project workspaces while keeping destructive operations (`rm -rf`, `git reset --hard`) guarded.
  4. **Policy Inheritance & Audit**: Ensure project-scoped policies inherit global security baselines and record all policy changes in the tamper-evident audit log.
- **Status**:
  - **Milestone**: Scheduled for Post-P0 (v1.2.x / v1.3.0).
  - **P0 Status**: Non-blocking. Global human-in-the-loop approval closed loop is fully operational and verified for v1.2.0 P0.

---
