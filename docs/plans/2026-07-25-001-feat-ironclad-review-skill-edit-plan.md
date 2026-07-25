---
title: "feat: Hardening ironclad-review skill for adaptive rendering, direct file editing & token efficiency"
type: "feat"
status: "active"
created: "2026-07-25"
origin: "Ironclad Review output of ironclad-review skill & User prompt directive"
---

# Plan: Hardening `ironclad-review` Skill for Adaptive Rendering, Direct File Editing & Token Efficiency

## 1. Problem Frame & Scope

The `ironclad-review` skill currently outputs the full "Ironclad Revised Plan" directly into the chat response, which causes massive chat token inflation and output truncation on long plans. Furthermore, when reviewing a plan document from disk, the user has to manually copy-paste the revised plan back into the original plan file.

### Key Directive Update
When `ironclad-review` is executed on a plan file:
1. If findings exist (gaps, mitigations, or workflow additions), **automatically update/patch the original plan file on disk** with the revised plan content.
2. **Do NOT output the full revised plan body into the chat stream**. In chat under `### 🛠️ The "Ironclad" Revised Plan`, provide only a short confirmation notice pointing to the updated target file link, summarizing key changes.

---

## 2. Traceability & Success Criteria

| Requirement | Origin Finding | Success Metric |
| :--- | :--- | :--- |
| **In-Place File Updating** | User Request: "edit original plan automatically" | Plan file on disk modified directly when findings exist. |
| **Chat Token Conservation** | User Request: "do not put the plan into the chat" | Full revised plan body suppressed from chat response; short summary & link provided instead. |
| **Adaptive Domain Formatting** | Skill Stress Test Gap 1 | Non-UI / non-DB plans omit `UI Flow` & `Data Model` cleanly without empty placeholders. |
| **Score Bounding** | Skill Stress Test Gap 3 | Score formula strictly clamped between `0%` and `100%`. |

---

## 3. Implementation Units

### Unit 1: Skill Definition Hardening (`.agents/skills/ironclad-review/SKILL.md`)

- **File**: `.agents/skills/ironclad-review/SKILL.md`
- **Changes**:
  1. Add **Auto-Edit Directive**:
     - If input plan originates from a file path (or `docs/plans/` / `implementation_plan.md`), write the revised plan directly to that target file using file edit tools.
  2. Add **Chat Output Suppression Rule**:
     - In chat output section `### 🛠️ The "Ironclad" Revised Plan`, do NOT output the full plan text when file update is performed. Replace with concise summary note and file link.
  3. Add **Domain Classification & Adaptive Layout Rules**:
     - Omit `UI/UX Enhancements` and `Data Model Changes` when non-applicable to target domain.
  4. Update **Score Calculation Guard**:
     - Enforce `Score = Math.max(0, Math.min(100, score))`.

### Unit 2: Workflow Runner Update (`.agents/workflows/ironclad-review.md`)

- **File**: `.agents/workflows/ironclad-review.md`
- **Changes**:
  1. Add directive to identify plan file location and instruct auto-editing of target file when findings are present.

---

## 4. Verification & Testing Plan

### Test Scenarios
1. **In-Place File Update Test**: Run `/ironclad-review` on a plan file in `docs/plans/`, verify target file is updated on disk and full plan body is omitted from chat.
2. **CLI/Skill Plan Review Test**: Verify clean omission of `UI Flow` and `Data Model` when testing non-UI plans.
3. **Flawed Plan Score Test**: Verify score floors at `0%` for multi-gap inputs.
