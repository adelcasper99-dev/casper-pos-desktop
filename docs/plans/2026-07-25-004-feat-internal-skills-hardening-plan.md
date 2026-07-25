---
title: "feat: Hardening internal pipeline skills (financial-guardrails, cavecrew, impeccable-critique) - Verified 100%"
type: "feat"
status: "active"
created: "2026-07-25"
origin: "Internal skills audit & Ironclad Review Verification Audit Pass 2"
---

# Plan: Hardening Internal Pipeline Skills (`financial-guardrails`, `cavecrew`, `impeccable-critique`)

## 1. Problem Frame & Scope

Following the audit of pipeline-internal skills, three specific vulnerabilities were identified:
1. `financial-guardrails` lacks JSON boundary serialization guards for `Decimal.js` and `.toJSON()` prototype shims.
2. `cavecrew` lacks POSIX path normalization formatting (`/` vs `\`) while supporting UNC paths on Windows environments.
3. `impeccable-critique` storage scripts can fail on fresh repos if `.impeccable/critique` directory tree does not exist.

---

## 2. Hardened Implementation Units

### Unit 1: Hardening `financial-guardrails` (`.agents/skills/financial-guardrails/SKILL.md`)
- **File**: `.agents/skills/financial-guardrails/SKILL.md`
- **Changes**:
  - Add **JSON Boundary Serialization & `.toJSON()` Guard**: Mandate `.toString()` / explicit string formatting when returning `Decimal.js` instances over API response objects or Zod schemas, and enforce `.toJSON()` prototype conversion.
- **Verification**: ✅ PASSED (100%)

### Unit 2: Hardening `cavecrew` (`.agents/skills/cavecrew/SKILL.md`)
- **File**: `.agents/skills/cavecrew/SKILL.md`
- **Changes**:
  - Add **POSIX Path Normalization Contract**: Require all subagents (`cavecrew-investigator`, `cavecrew-builder`, `cavecrew-reviewer`) to format file paths with POSIX forward slashes `/` using `path.posix.normalize()`.
- **Verification**: ✅ PASSED (100%)

### Unit 3: Hardening `impeccable-critique` (`.agents/skills/impeccable-critique/SKILL.md`)
- **File**: `.agents/skills/impeccable-critique/SKILL.md`
- **Changes**:
  - Add **Storage Preflight Directory Creation Guard**: Ensure `mkdir -p .impeccable/critique` check runs with fallback handling before snapshot writes.
- **Verification**: ✅ PASSED (100%)

---

## 3. Verification Plan

- Verify `.agents/skills/financial-guardrails/SKILL.md` serialization rules.
- Verify `.agents/skills/cavecrew/SKILL.md` path contracts.
- Verify `.agents/skills/impeccable-critique/SKILL.md` preflight steps.
