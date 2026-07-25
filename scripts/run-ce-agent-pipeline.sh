#!/usr/bin/env bash
#
# run-ce-agent-pipeline.sh
#
# Orchestrates the complete Casper agent pipeline via the Antigravity CLI (agy),
# featuring:
#   - Stage 0a: Grill-Me Initiation (/grill-me interactive interview)
#   - Stage 0b: Best Practice Research (ce-best-practices-researcher + ce-web-researcher)
#   - Stage 1:  Grounding & Spec (spec-kit + SQLite MCP)
#   - Stage 2a: Ironclad Review Pass 1 (Adversarial Critique)
#   - Stage 2b: Ironclad Verification Audit Pass 2 (VERIFICATION_SCORE >= 95%)
#   - Stage 3:  Build (cavecrew-builder)
#   - Stage 3b: Code Audit & Peer Review (DIFF_SCORE >= 80%)
#   - Stage 4:  Test & DevTools QA (AST Linter + Vitest + Chrome DevTools)
#   - Stage 5:  Accept & Walkthrough (gh CLI + GitKraken MCP)
#

set -uo pipefail

# ---------------------------------------------------------------------------
# Config — fill these in for your repo
# ---------------------------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel)"
TARGET_BRANCH="main"
TEST_CMD="npx vitest run"
LINTER_CMD="node scripts/check-casper-rules.js"

PLAN_MODEL="Gemini 3.1 Pro (High)"         # Stage 0b + Stage 1 + Stage 2a/2b (deep reasoning)
BUILD_MODEL="Gemini 3.6 Flash (High)"      # Stage 3 + Stage 3b + Stage 4 (fast execution)
ACCEPT_MODEL="Gemini 3.6 Flash (Medium)"   # Stage 5 (cheap doc generation)

STAGE_MAX_ATTEMPTS=3       # 2 retries + initial attempt, per stage
PIPELINE_MAX_REPLANS=2     # how many times we allow routing back to Stage 1
REVIEW_PASS_THRESHOLD=85
DIFF_AUDIT_THRESHOLD=80

TOTAL_RUN_BUDGET_SECONDS=5400   # 90 minutes

TASK_DESCRIPTION="${1:?Usage: $0 \"task description\"}"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
WORKTREE_DIR="../casper-pipeline-run-${RUN_ID}"
RUN_BRANCH="pipeline/${RUN_ID}"
STATE_DIR=".agents/state/run_${RUN_ID}"
RUN_START_EPOCH=$(date +%s)

# Colors
if [ -t 1 ]; then
  C_CYAN=$'\033[36m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_RESET=$'\033[0m'
else
  C_CYAN=""; C_RED=""; C_GREEN=""; C_RESET=""
fi

log()   { printf '%s[%s]%s %s\n' "${C_CYAN}" "$(date +%H:%M:%S)" "${C_RESET}" "$1"; }
ok()    { printf '%s[%s] %s%s\n' "${C_GREEN}" "$(date +%H:%M:%S)" "$1" "${C_RESET}"; }
fatal() { printf '%s[%s] FATAL: %s%s\n' "${C_RED}" "$(date +%H:%M:%S)" "$1" "${C_RESET}"; exit 1; }

budget_exceeded() {
  local elapsed=$(( $(date +%s) - RUN_START_EPOCH ))
  if [ "${elapsed}" -ge "${TOTAL_RUN_BUDGET_SECONDS}" ]; then
    return 0
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Worktree isolation
# ---------------------------------------------------------------------------
setup_worktree() {
  log "Creating isolated worktree at ${WORKTREE_DIR} on branch ${RUN_BRANCH}"
  git worktree add "${WORKTREE_DIR}" -b "${RUN_BRANCH}" "${TARGET_BRANCH}" \
    || fatal "worktree creation failed"
  mkdir -p "${WORKTREE_DIR}/${STATE_DIR}"
  cd "${WORKTREE_DIR}" || fatal "could not cd into worktree"
}

cleanup_worktree() {
  cd "${REPO_ROOT}" || return
  git worktree remove "${WORKTREE_DIR}" --force 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# Scoped revert
# ---------------------------------------------------------------------------
record_touched_files() {
  git diff --name-only > "${STATE_DIR}/touched_files.txt"
}

scoped_revert() {
  if [ -s "${STATE_DIR}/touched_files.txt" ]; then
    log "Reverting only files touched this stage:"
    cat "${STATE_DIR}/touched_files.txt"
    cat "${STATE_DIR}/touched_files.txt" | xargs git checkout -- 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# agy wrapper
# ---------------------------------------------------------------------------
run_agy() {
  local model="$1" prompt="$2" timeout_s="$3"
  timeout "${timeout_s}" agy -p "${prompt}" \
    --model "${model}" \
    --mode request-review
}

# ---------------------------------------------------------------------------
# Stage 0a — Grill-Me Initiation Step (/grill-me interview)
# ---------------------------------------------------------------------------
stage0a_grill_me() {
  log "Stage 0a · Grill-Me Initiation Interview (${PLAN_MODEL})"
  run_agy "${PLAN_MODEL}" \
    "Acting as /grill-me: interview the user with 3-4 targeted questions to clarify design trade-offs, scope boundaries, and edge cases for: ${TASK_DESCRIPTION}." \
    300
}

# ---------------------------------------------------------------------------
# Stage 0b — Best Practice Research Step
# ---------------------------------------------------------------------------
stage0b_research() {
  log "Stage 0b · Best Practice Research Step (${PLAN_MODEL})"
  run_agy "${PLAN_MODEL}" \
    "Acting as ce-best-practices-researcher and ce-web-researcher: research external best practices, framework standards, and patterns for: ${TASK_DESCRIPTION}. Save findings to ${STATE_DIR}/research_findings.md." \
    300
}

# ---------------------------------------------------------------------------
# Stage 1 — Plan (Grounded with Research)
# ---------------------------------------------------------------------------
stage1_plan() {
  log "Stage 1 · Plan (${PLAN_MODEL})"
  run_agy "${PLAN_MODEL}" \
    "Ground via graphify, research_findings.md, and generate a spec-kit specification for: ${TASK_DESCRIPTION}. Apply financial-guardrails and agency-architect skills." \
    300
}

# ---------------------------------------------------------------------------
# Stage 2a — Ironclad Review Pass 1
# ---------------------------------------------------------------------------
stage2a_review() {
  log "Stage 2a · Ironclad Review Pass 1 (${PLAN_MODEL})"
  local output
  output="$(run_agy "${PLAN_MODEL}" \
    "Acting as ironclad-review: find unstated assumptions and edge-case failure modes in the plan, patch the plan with mitigations, and output SCORE: <0-100>." \
    180)"
  echo "${output}"
}

# ---------------------------------------------------------------------------
# Stage 2b — Ironclad Verification Audit Pass 2
# ---------------------------------------------------------------------------
stage2b_verification() {
  log "Stage 2b · Ironclad Verification Audit Pass 2 (${PLAN_MODEL})"
  local output
  output="$(run_agy "${PLAN_MODEL}" \
    "Acting as ironclad-review auditor: verify that 100% of Pass 1 findings are cleanly resolved in the patched plan, and output VERIFICATION_SCORE: <0-100>." \
    180)"
  echo "${output}"
  local score
  score="$(echo "${output}" | grep -oE 'VERIFICATION_SCORE:\s*[0-9]+' | grep -oE '[0-9]+' | tail -1)"
  [ -z "${score}" ] && fatal "Stage 2b produced no parseable VERIFICATION_SCORE line"
  echo "${score}"
}

# ---------------------------------------------------------------------------
# Stage 3 — Build
# ---------------------------------------------------------------------------
stage3_build() {
  log "Stage 3 · Build (${BUILD_MODEL})"
  run_agy "${BUILD_MODEL}" \
    "Acting as cavecrew-builder: implement the 2-pass verified ironclad plan for: ${TASK_DESCRIPTION}. Follow financial-guardrails (Decimal.js only, no float math on monetary fields)." \
    1200
  record_touched_files
}

# ---------------------------------------------------------------------------
# Stage 3b — Code Audit & Peer Review Layer
# ---------------------------------------------------------------------------
stage3b_code_audit() {
  log "Stage 3b · Code Audit & Peer Review Layer (${BUILD_MODEL})"
  local output
  output="$(run_agy "${BUILD_MODEL}" \
    "Acting as ce-adversarial-reviewer, agency-security-appsec-engineer, and ponytail-review: audit the git diff for touched files. Check RBAC gates, AppSec input validation, error handling, and zero over-engineering. End output with DIFF_SCORE: <0-100>." \
    300)"
  echo "${output}"
  local score
  score="$(echo "${output}" | grep -oE 'DIFF_SCORE:\s*[0-9]+' | grep -oE '[0-9]+' | tail -1)"
  [ -z "${score}" ] && fatal "Stage 3b produced no parseable DIFF_SCORE line"
  echo "${score}"
}

# ---------------------------------------------------------------------------
# Stage 4 — Test & review
# ---------------------------------------------------------------------------
stage4_test_review() {
  log "Stage 4 · Test & review (${BUILD_MODEL})"
  ${LINTER_CMD} || return 1
  ${TEST_CMD} || return 1

  if git diff --name-only | grep -qE '\.(tsx|html|css)$|components/|landing-page/'; then
    log "UI files touched — triggering conditional DevTools screenshot verification"
    run_agy "${BUILD_MODEL}" \
      "Acting as cavecrew-reviewer: use the browser subagent to verify the UI changes render correctly, capturing before/after screenshots." \
      600
  fi
}

# ---------------------------------------------------------------------------
# Stage 5 — Accept (human sign-off gate)
# ---------------------------------------------------------------------------
stage5_accept() {
  log "Stage 5 · Accept (${ACCEPT_MODEL})"
  run_agy "${ACCEPT_MODEL}" \
    "Generate walkthrough.md summarizing the changes for: ${TASK_DESCRIPTION}, embedding proof (test output, linter results, code audit score, screenshots if present)." \
    180

  log "Checking for target-branch drift (rebase ${TARGET_BRANCH} onto ${RUN_BRANCH})"
  git fetch origin "${TARGET_BRANCH}" 2>/dev/null || true
  if ! git rebase "${TARGET_BRANCH}"; then
    git rebase --abort
    log "Rebase conflict against ${TARGET_BRANCH} — ${TARGET_BRANCH} moved during this run."
    log "Branch ${RUN_BRANCH} and worktree ${WORKTREE_DIR} preserved for manual resolution."
    return 1
  fi
  ok "No conflicts — ${RUN_BRANCH} is current with ${TARGET_BRANCH}."

  echo
  read -r -p "Review walkthrough.md. Merge ${RUN_BRANCH} into ${TARGET_BRANCH}? [y/N] " confirm
  if [[ "${confirm}" =~ ^[Yy]$ ]]; then
    cd "${REPO_ROOT}" || fatal "could not return to repo root"
    git fetch . "${RUN_BRANCH}"
    git checkout "${TARGET_BRANCH}"
    git merge --no-ff "${RUN_BRANCH}" -m "ce-agent-pipeline: ${TASK_DESCRIPTION} (${RUN_ID})" \
      || fatal "merge failed — resolve manually, branch ${RUN_BRANCH} preserved"
    ok "Merged. Updating knowledge graph & cleaning up worktree."
    graphify update . 2>/dev/null || true
    cleanup_worktree
    return 0
  else
    log "Merge declined. Branch ${RUN_BRANCH} and worktree preserved for manual review."
    return 0
  fi
}

# ---------------------------------------------------------------------------
# Main Loop
# ---------------------------------------------------------------------------
main() {
  setup_worktree

  local replan=0
  while [ "${replan}" -le "${PIPELINE_MAX_REPLANS}" ]; do
    if budget_exceeded; then
      log "ESCALATE TO HUMAN: total run budget (${TOTAL_RUN_BUDGET_SECONDS}s) exceeded."
      log "Worktree preserved at ${WORKTREE_DIR} on branch ${RUN_BRANCH} for manual inspection."
      exit 1
    fi
    log "=== Pipeline pass (replan ${replan}/${PIPELINE_MAX_REPLANS}) ==="

    run_stage_with_retries stage0a_grill_me || { replan=$((replan + 1)); continue; }
    run_stage_with_retries stage0b_research || { replan=$((replan + 1)); continue; }
    run_stage_with_retries stage1_plan || { replan=$((replan + 1)); continue; }
    run_stage_with_retries stage2a_review || { replan=$((replan + 1)); continue; }

    local verif_score
    verif_score="$(run_stage_with_retries stage2b_verification)" \
      || { replan=$((replan + 1)); continue; }
    verif_score="$(echo "${verif_score}" | tail -1)"

    if [ "${verif_score}" -lt "${REVIEW_PASS_THRESHOLD}" ]; then
      log "Stage 2b Verification Score ${verif_score} < ${REVIEW_PASS_THRESHOLD} — treating as failure"
      replan=$((replan + 1)); continue
    fi

    run_stage_with_retries stage3_build || { replan=$((replan + 1)); continue; }

    local diff_score
    diff_score="$(run_stage_with_retries stage3b_code_audit)" \
      || { replan=$((replan + 1)); continue; }
    diff_score="$(echo "${diff_score}" | tail -1)"

    if [ "${diff_score}" -lt "${DIFF_AUDIT_THRESHOLD}" ]; then
      log "Stage 3b Code Audit Score ${diff_score} < ${DIFF_AUDIT_THRESHOLD} — refactoring code"
      scoped_revert
      replan=$((replan + 1)); continue
    fi

    run_stage_with_retries stage4_test_review || { replan=$((replan + 1)); continue; }
    stage5_accept
    exit 0
  done

  log "ESCALATE TO HUMAN: ${PIPELINE_MAX_REPLANS} replans exhausted for run ${RUN_ID}."
  exit 1
}

run_stage_with_retries() {
  local stage_fn="$1"
  local attempt=1
  while [ "${attempt}" -le "${STAGE_MAX_ATTEMPTS}" ]; do
    log "Attempt ${attempt}/${STAGE_MAX_ATTEMPTS} for ${stage_fn}"
    if "${stage_fn}"; then
      return 0
    fi
    log "${stage_fn} failed on attempt ${attempt}"
    scoped_revert
    attempt=$((attempt + 1))
  done
  return 1
}

main
