# Automated Safeguards Implementation Plan

## Overview
Based on the critical incident where SQLite WAL/SHM files were accidentally committed, this plan implements a multi-layered defense system with automated checks at various stages of the development workflow.

## Current State Assessment

**.gitignore** - ✅ Already has proper patterns:
```
/prisma/*.db-wal
/prisma/*.db-shm
```

**Gap:** No automated enforcement - rules exist but can be bypassed

---

## Proposed Implementation

### Layer 1: Git Hooks (Local Protection)

#### 1.1 Pre-commit Hook
**File:** `.git/hooks/pre-commit` (or use Husky for distribution)

**Purpose:** Block database files before they're committed

**Behavior:**
- Scans all staged files
- Allows: `prisma/prisma/dev.db` (main database, if needed)
- Blocks: `*.db-wal`, `*.db-shm`, `*.db-journal`, any other `*.db` in unexpected locations
- Provides clear error message with remediation steps

**Implementation:** Bash script (cross-platform compatible)

#### 1.2 Pre-merge Hook
**File:** `.git/hooks/pre-merge-commit`

**Purpose:** Extra safety during merge operations

**Behavior:**
- Checks files in the merge commit
- Specifically looks for database file conflicts
- Prevents merge completion if violations found

---

### Layer 2: Validation Script (CI/CD & Manual)

#### 2.1 Node.js Validation Script
**File:** `scripts/validate-database-files.js`

**Purpose:** Reusable validation for CI/CD and manual checks

**Features:**
- Checks staged files (pre-commit)
- Checks all files in a commit/PR (CI/CD)
- Detects conflict markers in code
- Exit with non-zero code on failure
- Clear, actionable error messages

**Usage:**
```bash
node scripts/validate-database-files.js
npm run validate:db
```

---

### Layer 3: CI/CD Integration

#### 3.1 GitHub Actions Workflow
**File:** `.github/workflows/validate-db-files.yml`

**Triggers:**
- Pull request to main
- Push to main

**Check:**
- Scan all changed files in the PR/commit
- Fail if prohibited database files found
- Allow `prisma/prisma/dev.db` if necessary

**Outcome:** Block merging of PRs that include database files

---

### Layer 4: Package.json Integration

**Add scripts:**
```json
{
  "scripts": {
    "validate:db": "node scripts/validate-database-files.js",
    "prebuild": "npm run validate:db",
    "prepare": "cp -f .hooks/pre-commit .git/hooks/pre-commit 2>/dev/null || true"
  }
}
```

**Effect:**
- `npm run build` automatically validates first
- `npm install` can set up hooks automatically

---

### Layer 5: Documentation & Training

#### 5.1 Update README.md
Add section: "Database File Management" with:
- Why database files shouldn't be committed
- What to do if you see them
- How the safeguards work

#### 5.2 Create Developer Guide
**File:** `docs/development-workflow.md`

Include:
- Complete Git workflow with safeguards
- Troubleshooting guide
- Emergency procedures

---

## Implementation Steps

### Step 1: Create Validation Script
- [ ] Write `scripts/validate-database-files.js`
- [ ] Test locally with various scenarios
- [ ] Add to `package.json`

### Step 2: Set Up Git Hooks
- [ ] Create `.git/hooks/pre-commit` script
- [ ] Create `.git/hooks/pre-merge-commit` script
- [ ] Make them executable (`chmod +x`)
- [ ] Consider using Husky for team distribution

### Step 3: CI/CD Configuration
- [ ] Create `.github/workflows/validate-db-files.yml`
- [ ] Test with a sample PR
- [ ] Add status badge to README

### Step 4: Documentation
- [ ] Update `README.md`
- [ ] Create `docs/development-workflow.md`
- [ ] Document emergency rollback procedure

### Step 5: Team Rollout
- [ ] Communicate changes to team
- [ ] Conduct training session
- [ ] Monitor for false positives
- [ ] Gather feedback and refine

---

## Emergency Procedures

### If database files get pushed:
1. **Immediate:** Create a new commit that removes them
2. **If not widely pulled:** Force push corrected history
3. **If others may have pulled:** Coordinate a rebase

### Rollback script:
```bash
git rm --cached prisma/prisma/dev.db-shm prisma/prisma/dev.db-wal
git commit -m "fix: Remove accidentally committed database files"
git push origin main
```

---

## Success Criteria

- ✅ Zero database file commits for 30 days
- ✅ All PRs pass CI validation
- ✅ Team awareness: 100% trained
- ✅ No manual intervention needed for valid commits

---

## Risk Mitigation

**Risk:** False positives blocking legitimate commits
**Mitigation:**
- Allow `prisma/prisma/dev.db` explicitly
- Provide easy override mechanism (environment variable)
- Test thoroughly before deployment
- Monitor hook failures and adjust patterns

**Risk:** Hooks not distributed to all developers
**Mitigation:**
- Use `prepare` script in `package.json` to auto-install
- Document manual installation
- CI/CD as ultimate safety net

---

## Estimated Effort

- Implementation: 2-3 hours
- Testing: 1 hour
- Documentation: 1 hour
- Team training: 30 minutes
- **Total:** ~5 hours

---

## Owner & Timeline

- **Owner:** Tech Lead / DevOps
- **Implementation:** Within 1 week
- **Review:** After 1 month of operation

---

## Status

🟡 **Ready for Implementation** - Awaiting approval to proceed with code changes