---
title: "feat: Hardening ce-doc-review and ce-brainstorm workflows with zero-risk auto-patching protocols"
type: "feat"
status: "active"
created: "2026-07-25"
origin: "Pipeline optimization inquiry & Ironclad Review"
---

# Plan: Hardening `ce-doc-review` & `ce-brainstorm` Workflows with Zero-Risk Auto-Patching

## 1. Problem Frame & Scope

Automating document file updates and suppressing verbose chat dumps saves ~75% token context, but introduces risks around accidental overwrites, hidden changes, missing argument fallbacks in headless mode, and workflow mode conflicts.

This plan details the **Hardened Risk Prevention System** built into `ce-doc-review.md` and `ce-brainstorm.md`.

---

## 2. Hardened Risk Fixes (Ironclad Hardened Architecture)

### 🛡️ Fix 1: Preventing Accidental Overwrites & Data Loss
- **Atomic Backup & Section-Anchored Delta Edits**:
  - Apply **Section-Anchored Delta Edits** targeting specific `## Section` headings only. Never do full-file overwrites on existing documents.

### 👁️ Fix 2: Eliminating Hidden Changes (100% Visibility)
- **Mandatory 5-Line Patch Summary in Chat**:
  - Replace 300-line text dumps with a 5-line patch summary detailing `[ADDED]`, `[MODIFIED]`, or `[REMOVED]` items with clickable file links.

### 🔀 Fix 3: Standardizing Headless vs Interactive Behavior
- **Headless Mode (`mode:headless` / `/pipeline`)**:
  - If document path argument is missing in headless mode, fallback to latest file in `docs/brainstorms/` or exit cleanly with explicit error status code.
- **Interactive Mode**:
  - Displays 5-Line Patch Summary and applies changes to disk by default with user override options.

---

## 3. Implementation Units

### Unit 1: Hardening `ce-doc-review.md` (`.agents/workflows/ce-doc-review.md`)
- Add **Section-Anchored Delta Patching** instructions.
- Add **Mandatory 5-Line Patch Summary** chat output schema.
- Add **Headless Fallback Guard**: Auto-load latest file from `docs/brainstorms/` or `docs/plans/` if argument missing.

### Unit 2: Hardening `ce-brainstorm.md` (`.agents/workflows/ce-brainstorm.md`)
- Direct file creation to `docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md`.
- Replace document body text dump in chat with compact overview link + key requirements checklist.

---

## 4. Verification Plan
1. **Overwriting Safety Test**: Review document with custom user sections; verify custom sections remain untouched.
2. **Headless Argument Fallback Test**: Trigger `ce-doc-review mode:headless` without path; confirm automatic target resolution.
3. **Patch Summary Test**: Verify chat response outputs exact 5-line patch summary without dumping full text.
