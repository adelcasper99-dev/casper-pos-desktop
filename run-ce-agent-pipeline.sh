#!/usr/bin/env bash
#
# run-ce-agent-pipeline.sh
#
# Orchestrates the 5-stage Casper agent pipeline via the Antigravity CLI (agy),
# with automated cross-model switching, worktree isolation, scoped revert,
# stage retries, and bounded outer replans.
#
# USAGE:
#   ./run-ce-agent-pipeline.sh "Add dynamic bundle stock deduction"
#
# BEFORE FIRST RUN:
#   - Run `agy --help` and confirm --model, --mode, and -p flags match what's
#     used below. CLI flag names have shifted across recent agy versions.
#   - Fill in the TODO markers (test command, repo root, target branch).
#   - Review PLAN_MODEL / BUILD_MODEL below and adjust to what's available on
#     your plan (Free/Pro/Ultra/Enterprise gate which models you can select).

set -uo pipefail

# ---------------------------------------------------------------------------
# Config — fill these in for your repo
# ---------------------------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel)"
TARGET_BRANCH="main"                       # TODO: confirm your default branch
TEST_CMD="npx vitest run"                  # TODO: confirm your test command
LINTER_CMD="node scripts/check-casper-rules.js"

PLAN_MODEL="Gemini 3.1 Pro (High)"         # Stage 1 + Stage 2 (deep reasoning)
BUILD_MODEL="Gemini 3.6 Flash (High)"      # Stage 3 + Stage 4 (fast execution)
ACCEPT_MODEL="Gemini 3.6 Flash (Medium)"   # Stage 5 (cheap doc generation)

STAGE_MAX_ATTEMPTS=3       # 2 retries + initial attempt, per stage
PIPELINE_MAX_REPLANS=2     # how many times we allow routing back to Stage 1
REVIEW_PASS_THRESHOLD=85
REVIEW_BORDERLINE_THRESHOLD=70

TASK_DESCRIPTION="${1:?Usage: $0 \"task description\"}"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
WORKTREE_DIR="../casper-pipeline-run-${RUN_ID}"
RUN_BRANCH="pipeline/${RUN_ID}"
STATE_DIR=".agents/state/run_${RUN_ID}"

log()   { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$1"; }
fatal() { log "FATAL: $1"; exit 1; }

# ---------------------------------------------------------------------------
# Worktree isolation — every run gets its own branch, never touches the
# caller's current working branch.
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
# Scoped revert — undo only what THIS stage touched, never `git checkout .`
# ---------------------------------------------------------------------------
record_touched_files() {
  git diff --name-only > "${STATE_DIR}/touched_files.txt"
}

scoped_revert() {
  if [ -s "${STATE_DIR}/touched_files.txt" ]; then
    log "Reverting only files touched this stage:"
    cat "${STATE_DIR}/touched_files.txt"
    xargs -a "${STATE_DIR}/touched_files.txt" git checkout -- 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# agy wrapper — non-interactive, model-pinned, review-gated by default.
# Change --mode to accept-edits only for stages you've fully trusted.
# ---------------------------------------------------------------------------
run_agy() {
  local model="$1" prompt="$2" timeout_s="$3"
  timeout "${timeout_s}" agy -p "${prompt}" \
    --model "${model}" \
    --mode request-review
}

# ---------------------------------------------------------------------------
# Stage 1 — Plan
# ---------------------------------------------------------------------------
stage1_plan() {
  log "Stage 1 · Plan (${PLAN_MODEL})"
  run_agy "${PLAN_MODEL}" \
    "Ground via graphify and generate a spec-kit specification for: ${TASK_DESCRIPTION}. Apply the financial-guardrails and agency-architect skills." \
    300
}

# ---------------------------------------------------------------------------
# Stage 2 — Review plan (adversarial persona, same reasoning-tier model)
# ---------------------------------------------------------------------------
stage2_review() {
  log "Stage 2 · Review plan (${PLAN_MODEL})"
  local output
  output="$(run_agy "${PLAN_MODEL}" \
    "Acting as ironclad-review, an independent adversarial critic: find unstated assumptions and failure modes in the plan just produced, and end your response with a single line exactly formatted as SCORE: <0-100>." \
    180)"
  echo "${output}"
  local score
  score="$(echo "${output}" | grep -oE 'SCORE:\s*[0-9]+' | grep -oE '[0-9]+' | tail -1)"
  [ -z "${score}" ] && fatal "Stage 2 produced no parseable SCORE line"
  echo "${score}"
}

# ---------------------------------------------------------------------------
# Stage 3 — Build
# ---------------------------------------------------------------------------
stage3_build() {
  log "Stage 3 · Build (${BUILD_MODEL})"
  run_agy "${BUILD_MODEL}" \
    "Acting as cavecrew-builder: implement the reviewed plan for: ${TASK_DESCRIPTION}. Follow financial-guardrails (Decimal.js only, no float math on monetary fields, double-entry balanced)." \
    1200
  record_touched_files
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
# Stage 5 — Accept (human sign-off gate, per plan)
# ---------------------------------------------------------------------------
stage5_accept() {
  log "Stage 5 · Accept (${ACCEPT_MODEL})"
  run_agy "${ACCEPT_MODEL}" \
    "Generate walkthrough.md summarizing the changes for: ${TASK_DESCRIPTION}, embedding proof (test output, linter results, screenshots if present)." \
    180

  echo
  read -r -p "Review walkthrough.md. Merge ${RUN_BRANCH} into ${TARGET_BRANCH}? [y/N] " confirm
  if [[ "${confirm}" =~ ^[Yy]$ ]]; then
    cd "${REPO_ROOT}" || fatal "could not return to repo root"
    git fetch . "${RUN_BRANCH}"
    git checkout "${TARGET_BRANCH}"
    git merge --no-ff "${RUN_BRANCH}" -m "ce-agent-pipeline: ${TASK_DESCRIPTION} (${RUN_ID})" \
      || fatal "merge failed — resolve manually, branch ${RUN_BRANCH} preserved"
    log "Merged. Cleaning up worktree."
    cleanup_worktree
    return 0
  else
    log "Merge declined. Branch ${RUN_BRANCH} and worktree preserved for manual review."
    return 0
  fi
}

# ---------------------------------------------------------------------------
# Stage runner with retry cap
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  setup_worktree

  local replan=0
  while [ "${replan}" -le "${PIPELINE_MAX_REPLANS}" ]; do
    log "=== Pipeline pass (replan ${replan}/${PIPELINE_MAX_REPLANS}) ==="

    run_stage_with_retries stage1_plan || { replan=$((replan + 1)); continue; }

    local review_score
    review_score="$(run_stage_with_retries stage2_review)" \
      || { replan=$((replan + 1)); continue; }
    # last line of stage2_review's stdout is the parsed score
    review_score="$(echo "${review_score}" | tail -1)"

    if [ "${review_score}" -lt "${REVIEW_BORDERLINE_THRESHOLD}" ]; then
      log "Stage 2 score ${review_score} < ${REVIEW_BORDERLINE_THRESHOLD} — treating as failure"
      replan=$((replan + 1)); continue
    elif [ "${review_score}" -lt "${REVIEW_PASS_THRESHOLD}" ]; then
      log "Stage 2 score ${review_score} is borderline — proceeding, flagged in walkthrough"
    fi

    run_stage_with_retries stage3_build || { replan=$((replan + 1)); continue; }
    run_stage_with_retries stage4_test_review || { replan=$((replan + 1)); continue; }
    stage5_accept
    exit 0
  done

  log "ESCALATE TO HUMAN: ${PIPELINE_MAX_REPLANS} replans exhausted for run ${RUN_ID}."
  log "Worktree preserved at ${WORKTREE_DIR} on branch ${RUN_BRANCH} for manual inspection."
  exit 1
}

main
