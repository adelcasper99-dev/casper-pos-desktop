# Plan: Database File Safeguards Implementation

## Problem Statement

Recent incident: SQLite WAL (`dev.db-wal`) and SHM (`dev.db-shm`) files were accidentally committed and pushed to the repository. These are temporary database files that should never be version-controlled.

## Solution Overview

Implement a multi-layered defense system:
1. Enhanced `.gitignore` rules
2. Pre-commit and pre-merge Git hooks
3. CI/CD validation checks
4. Merge commit verification workflow
5. Developer documentation and training

---

## Phase 1: Enhanced .gitignore Rules

**Current state:** `.gitignore` has:
```
/prisma/*.db
/prisma/*.db-journal
```

**Enhancement needed:** Add comprehensive SQLite file patterns

**Implementation:**
```gitignore
# Prisma/SQLite database files
/prisma/*.db
/prisma/*.db-journal
/prisma/*.db-wal
/prisma/*.db-shm
/prisma/*.db-*
# Also ignore any .db files in subdirectories
**/*.db
**/*.db-wal
**/*.db-shm
**/*.db-journal

# Explicitly allow the main dev.db if needed (optional)
# !prisma/prisma/dev.db
```

**Note:** The `!` pattern can be used to make exceptions if `dev.db` should be tracked. Currently it IS tracked, so we need to be careful. We'll use a more targeted approach.

---

## Phase 2: Git Hooks

### 2.1 Pre-commit Hook

**Purpose:** Block any attempt to commit database files (except allowed ones)

**Location:** `.git/hooks/pre-commit` (or use Husky for team distribution)

**Logic:**
1. Check staged files for database patterns
2. Allow `prisma/prisma/dev.db` if explicitly permitted
3. Block all other `*.db`, `*.db-wal`, `*.db-shm`, `*.db-journal` files
4. Provide clear error message with instructions

**Implementation:**
```bash
#!/bin/bash
# .git/hooks/pre-commit

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only)

# Define patterns to block
BLOCK_PATTERNS="\.db(-wal|-shm|-journal)?$"

# Check for blocked files (excluding allowed dev.db)
for file in $STAGED_FILES; do
    if echo "$file" | grep -E "$BLOCK_PATTERNS" > /dev/null; then
        # Allow prisma/prisma/dev.db if needed
        if [[ "$file" == "prisma/prisma/dev.db" ]]; then
            # Check if dev.db is allowed (configurable)
            ALLOW_DEV_DB=${ALLOW_DEV_DB:-true}
            if [[ "$ALLOW_DEV_DB" == "true" ]]; then
                continue
            fi
        fi
        echo "ERROR: Attempting to commit database file: $file"
        echo "Database files (including .db-wal, .db-shm, .db-journal) should not be version-controlled."
        echo "Please remove them from staging or add them to .gitignore."
        echo ""
        echo "To unstage: git reset HEAD <file>"
        echo "To ignore: echo '<file>' >> .gitignore"
        exit 1
    fi
done

exit 0
```

### 2.2 Pre-merge Hook

**Purpose:** Additional safety check before completing a merge

**Location:** `.git/hooks/pre-merge-commit` (or integrated into pre-commit)

**Logic:**
1. Check all files in the merge commit (including conflicts)
2. Ensure no database files are being introduced
3. Verify `.gitignore` is properly configured

**Implementation:**
```bash
#!/bin/bash
# .git/hooks/pre-merge-commit

# Get files that would be committed
MERGE_FILES=$(git diff --cached --name-only)

# Check for database files
for file in $MERGE_FILES; do
    if echo "$file" | grep -E "\.db(-wal|-shm|-journal)?$" > /dev/null; then
        echo "ERROR: Merge would include database file: $file"
        echo "Resolve the conflict properly - database files should be deleted, not merged."
        exit 1
    fi
done

exit 0
```

### 2.3 Pre-push Hook (Optional)

**Purpose:** Final check before pushing to remote

**Implementation:** Similar to pre-commit but checks all commits being pushed.

---

## Phase 3: CI/CD Integration

### 3.1 GitHub Actions Workflow

**File:** `.github/workflows/validate-merge.yml`

**Purpose:** Prevent merges that include database files

**Triggers:** Pull request updates, push to main

**Steps:**
1. Checkout code
2. Scan for database files in the changes
3. Fail if any found (except allowed `dev.db`)

**Implementation:**
```yaml
name: Validate No Database Files

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]

jobs:
  check-database-files:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Check for database files in changes
        run: |
          # Get list of changed files in this PR/commit
          CHANGED_FILES=$(git diff --name-only ${{ github.event.before }} ${{ github.sha }})

          # Find any database files (excluding allowed dev.db)
          DB_FILES=$(echo "$CHANGED_FILES" | grep -E '\.db(-wal|-shm|-journal)?$' | grep -v 'prisma/prisma/dev.db' || true)

          if [ -n "$DB_FILES" ]; then
            echo "❌ Found database files that should not be version-controlled:"
            echo "$DB_FILES"
            echo ""
            echo "Please remove these files and add them to .gitignore."
            exit 1
          fi

          echo "✅ No prohibited database files found"
```

### 3.2 Build-time Validation

Add to `package.json`:
```json
{
  "scripts": {
    "validate:db": "node scripts/validate-database-files.js",
    "prebuild": "npm run validate:db"
  }
}
```

---

## Phase 4: Merge Commit Verification Workflow

### 4.1 Standard Operating Procedure (SOP)

When merging branches:

1. **Before merge:**
   ```bash
   # Ensure .gitignore is up to date
   cat .gitignore | grep -E "\.db(-wal|-shm|-journal)?" || echo "WARNING: .gitignore may be missing database patterns"
   
   # Check for any untracked database files
   git status --porcelain | grep -E "\.db(-wal|-shm|-journal)?"
   
   # If found, add to .gitignore and remove from tracking
   ```

2. **During merge:**
   ```bash
   # If conflicts in database files occur:
   git rm --cached prisma/prisma/dev.db-shm prisma/prisma/dev.db-wal
   # Do NOT try to merge them - they should be deleted
   ```

3. **After merge, before commit:**
   ```bash
   # Verify no database files in staging
   git diff --cached --name-only | grep -E "\.db(-wal|-shm|-journal)?" && echo "ERROR" || echo "Clean"
   
   # Check for conflict markers
   git grep -n "<<<<<<<" -- ':!*.md' && echo "ERROR: Conflict markers found" || echo "No markers"
   ```

4. **Before push:**
   ```bash
   # Run validation
   npm run validate:db
   
   # Or use pre-push hook if configured
   ```

### 4.2 Automated Script: `scripts/validate-database-files.js`

```javascript
const { execSync } = require('child_process');
const path = require('path');

console.log('🔍 Validating no prohibited database files in staging area...');

try {
    // Get staged files
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' });
    const files = stagedFiles.split('\n').filter(f => f.trim());
    
    // Pattern to match database files (excluding allowed dev.db)
    const dbPattern = /\.db(-wal|-shm|-journal)?$/i;
    
    const violations = files.filter(file => {
        return dbPattern.test(file) && !file.includes('prisma/prisma/dev.db');
    });
    
    if (violations.length > 0) {
        console.error('❌ ERROR: Found prohibited database files:');
        violations.forEach(file => console.error(`   - ${file}`));
        console.error('\nThese files should not be version-controlled.');
        console.error('Remove them: git reset HEAD <file>');
        console.error('Add to .gitignore: echo "<file>" >> .gitignore');
        process.exit(1);
    }
    
    // Also check for conflict markers in code files
    console.log('🔍 Checking for conflict markers...');
    const conflictFiles = [];
    
    for (const file of files) {
        if (file.endsWith('.md')) continue; // Skip markdown
        try {
            const content = execSync(`git show :${file}`, { encoding: 'utf-8' });
            if (content.includes('<<<<<<<') || content.includes('=======') || content.includes('>>>>>>>')) {
                conflictFiles.push(file);
            }
        } catch (e) {
            // File may be binary or deleted, skip
        }
    }
    
    if (conflictFiles.length > 0) {
        console.error('❌ ERROR: Conflict markers found in:');
        conflictFiles.forEach(file => console.error(`   - ${file}`));
        process.exit(1);
    }
    
    console.log('✅ All validations passed!');
    process.exit(0);
    
} catch (error) {
    console.error('Validation error:', error.message);
    process.exit(1);
}
```

---

## Phase 5: Team Training & Documentation

### 5.1 Update README.md

Add a section:
```markdown
## Database File Management

**Important:** SQLite temporary files (`.db-wal`, `.db-shm`, `.db-journal`) are generated automatically and should NEVER be committed.

If you see these files:
1. They're likely created by Prisma during development
2. They're already in `.gitignore` - just unstage them: `git reset HEAD <file>`
3. If they appear in conflicts, resolve by deletion: `git rm --cached <file>`

### Prevention
- Pre-commit hooks automatically block these files
- CI/CD checks will fail if they're included
- Contact team lead if you need to modify `.gitignore`
```

### 5.2 Create Developer Guide

File: `docs/git-workflow.md`

Include:
- Step-by-step merge procedure
- How to handle database file conflicts
- Troubleshooting common issues
- Emergency procedures if database files get pushed

---

## Phase 6: Monitoring & Alerting

### 6.1 Scheduled Repository Scan

Add a weekly cron job (GitHub Actions) that:
- Scans repository history for any database files
- Alerts if found
- Creates issue for cleanup

```yaml
name: Weekly Database File Scan
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0
      
      - name: Scan for database files
        run: |
          DB_FILES=$(git log --all --pretty=format: --name-only | grep -E '\.db(-wal|-shm|-journal)?$' | sort -u)
          
          if [ -n "$DB_FILES" ]; then
            echo "::error::Found database files in repository history:"
            echo "$DB_FILES"
            # Create issue or alert
            exit 1
          fi
```

---

## Implementation Checklist

- [ ] Update `.gitignore` with comprehensive patterns
- [ ] Create pre-commit hook script
- [ ] Create pre-merge hook script
- [ ] Create `scripts/validate-database-files.js`
- [ ] Add `validate:db` to `package.json`
- [ ] Create GitHub Actions workflow
- [ ] Update `README.md` with database file guidelines
- [ ] Create `docs/git-workflow.md` developer guide
- [ ] Set up weekly scan workflow
- [ ] Test all safeguards locally
- [ ] Document emergency rollback procedure
- [ ] Train team on new workflows

---

## Emergency Rollback Procedure

If database files are accidentally pushed:

1. **Immediate action:**
   ```bash
   # Remove from latest commit (not pushed yet)
   git reset HEAD~1
   git rm --cached prisma/prisma/dev.db-shm prisma/prisma/dev.db-wal
   git commit -m "fix: Remove accidentally committed database files"
   git push origin main
   ```

2. **If already pushed and others may have pulled:**
   ```bash
   # Create a new commit that removes them (safer)
   git rm --cached prisma/prisma/dev.db-shm prisma/prisma/dev.db-wal
   git commit -m "fix: Remove database files from repository"
   git push origin main
   
   # Alert team to rebase if needed
   ```

3. **If need to rewrite history (not pushed or can coordinate):**
   ```bash
   git filter-branch --force --index-filter \
     'git rm --cached --ignore-unmatch prisma/prisma/dev.db-shm prisma/prisma/dev.db-wal' \
     --prune-empty --tag-name-filter cat -- --all
   git push origin main --force --tags
   ```

---

## Success Metrics

- ✅ Zero database file commits (except allowed `dev.db`) for 30 days
- ✅ All PRs pass CI/CD validation
- ✅ No merge conflicts related to database files
- ✅ Team awareness: 100% of developers trained on new workflow

---

## Timeline

- **Day 1:** Implement .gitignore, hooks, validation script
- **Day 2:** Set up CI/CD workflows
- **Day 3:** Documentation and team training
- **Day 4:** Testing and refinement
- **Day 5:** Go-live, monitor closely

---

## Owner & Review

- **Owner:** Tech Lead / DevOps
- **Review:** Weekly for first month, then monthly
- **Updates:** As needed based on incident reports

---

**Status:** Proposed  
**Priority:** High (prevents repository bloat and merge conflicts)  
**Estimated effort:** 4-6 hours implementation + 1 hour training