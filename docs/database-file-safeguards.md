# Database File Safeguards

## Overview

This document describes the automated safeguards implemented to prevent accidental inclusion of temporary SQLite database files (WAL, SHM, journal) in the Git repository.

## Problem

SQLite creates temporary files during operation:
- `*.db-wal` - Write-Ahead Log
- `*.db-shm` - Shared Memory
- `*.db-journal` - Rollback journal

These files are **generated artifacts** that change constantly and should **never** be version-controlled. They cause merge conflicts and repository bloat.

## Solution

A multi-layered defense system protects against accidental commits:

### 1. Pre-commit Hook

**Location:** `.git/hooks/pre-commit`

**Function:** Automatically runs before every `git commit` to check staged files.

**What it does:**
- Scans all staged files for prohibited database patterns
- Allows `prisma/prisma/dev.db` (main development database)
- Blocks: `*.db-wal`, `*.db-shm`, `*.db-journal`
- Also checks for unresolved conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)

**Bypass (not recommended):**
```bash
git commit --no-verify
# or
SKIP_DB_VALIDATION=1 git commit -m "message"
```

### 2. Validation Script

**Location:** `scripts/validate-database-files.js`

**Usage:**
```bash
# Check staged files (used by pre-commit hook)
node scripts/validate-database-files.js --staged

# Check all tracked files (CI/CD use)
node scripts/validate-database-files.js --all

# Check specific commit
node scripts/validate-database-files.js --commit <sha>

# Show help
node scripts/validate-database-files.js --help
```

**Exit codes:**
- `0` = All validations passed
- `1` = Violations found
- `2` = Error running validation

### 3. NPM Scripts

Added to `package.json`:

```bash
# Run validation manually
npm run validate:db

# Build automatically runs validation first
npm run build
```

### 4. CI/CD Integration

GitHub Actions workflow (to be added) will automatically block PRs that contain prohibited files.

## What to Do If You See an Error

### Scenario 1: Database file in staging

```
❌ ERROR: Found prohibited files:
  prisma/prisma/dev.db-wal - Database file (should not be version-controlled)
```

**Fix:**
```bash
# Remove from staging
git reset HEAD prisma/prisma/dev.db-wal

# Add to .gitignore (if not already there)
echo "prisma/prisma/dev.db-wal" >> .gitignore
```

### Scenario 2: Conflict markers in code

```
❌ ERROR: Found conflict markers in:
  src/components/Button.tsx:
    Line 42: <<<<<<< HEAD
```

**Fix:**
1. Open the file
2. Resolve the conflict by editing
3. Remove all `<<<<<<<`, `=======`, `>>>>>>>` markers
4. Stage the resolved file: `git add src/components/Button.tsx`

### Scenario 3: Need to commit anyway (emergency)

```bash
# Skip validation (use sparingly!)
git commit --no-verify -m "Urgent fix"
# or
SKIP_DB_VALIDATION=1 git commit -m "Urgent fix"
```

**Remember:** Skipping validation should be rare and only for true emergencies. Document why you skipped it.

## Allowed Files

The following database file is **allowed**:
- `prisma/prisma/dev.db` - Main development database

**Why?** This is the primary SQLite database that contains your development data. It's large and changes frequently, but it's necessary for development.

## Prohibited Files

The following are **always blocked**:
- `*.db-wal` - Write-Ahead Log file
- `*.db-shm` - Shared Memory file
- `*.db-journal` - Journal file
- Any other `*.db` files outside `prisma/prisma/dev.db`

## .gitignore Configuration

Ensure `.gitignore` contains:

```
# Prisma/SQLite database files
/prisma/*.db
/prisma/*.db-journal
/prisma/*.db-wal
/prisma/*.db-shm
```

**Note:** The pattern `/prisma/*.db` would normally block `dev.db`, but Git's negation rules allow us to specifically permit it if needed. Currently, `dev.db` is tracked and allowed by the validation script's allowlist.

## Troubleshooting

### Hook not running

```bash
# Check if hook exists and is executable (Linux/Mac)
ls -la .git/hooks/pre-commit

# On Windows, hooks should still work if file exists
# If not, manually copy from repository: .githooks/pre-commit to .git/hooks/
```

### Validation script not found

Ensure `scripts/validate-database-files.js` exists and is readable.

### False positive (file should be allowed)

Edit `scripts/validate-database-files.js` and add the file pattern to `CONFIG.ignorePatterns`.

### Performance issues

The validation script only checks staged files, so it should be fast (<1 second). If it's slow, check for:
- Large binary files in staging
- Network file system latency
- Too many files being committed (consider splitting commit)

## Emergency Procedures

### If database files get pushed to remote:

1. **Immediate removal:**
   ```bash
   git rm --cached prisma/prisma/dev.db-wal prisma/prisma/dev.db-shm
   git commit -m "fix: Remove accidentally committed database files"
   git push origin main
   ```

2. **If others may have pulled:**
   - Alert the team
   - Have them run: `git pull --rebase` to get the fix
   - Or create a new branch and re-base their work

3. **If need to rewrite history** (files in old commits):
   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch prisma/prisma/dev.db-wal prisma/prisma/dev.db-shm' \
     --prune-empty --tag-name-filter cat -- --all
   git push origin main --force --tags
   ```
   **Warning:** Coordinate with team before rewriting history.

## Best Practices

1. **Keep .gitignore updated** - Add any new generated file patterns
2. **Run `git status` before committing** - See what's staged
3. **Use `git add -p`** - Interactively stage only intended changes
4. **Review commits before push** - Use `git log --stat -p -1`
5. **Enable pre-push hook** (future) - Additional check before pushing

## Monitoring

A weekly GitHub Actions workflow (to be implemented) will scan the repository history for any database files and alert if found.

## Support

If you encounter issues with the safeguards:
1. Check this document
2. Review the validation script output (it provides actionable fixes)
3. Contact the DevOps team

## History

- **2025-03-18:** Implemented pre-commit hook and validation script
- **Incident:** Database WAL/SHM files accidentally committed in commit 772c91e
- **Resolution:** History rewritten, safeguards implemented to prevent recurrence

---

**Remember:** These safeguards exist to protect the repository and make everyone's life easier. They may seem like an extra step, but they prevent hours of merge conflict pain later.