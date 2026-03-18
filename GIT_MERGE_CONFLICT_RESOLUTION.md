# Git Merge Conflict Resolution Guide

## What Are Merge Conflicts?

Merge conflicts occur when Git cannot automatically reconcile differences in code between two branches that are being merged. This happens when:
- Two branches modify the same file in overlapping ways
- One branch deletes a file while another modifies it
- Multiple changes conflict at the same location

## Prevention Strategies

1. **Pull frequently** - Keep your branch updated with the main branch
2. **Small, focused commits** - Easier to merge and review
3. **Clear communication** - Coordinate with team members on who works on what
4. **Use feature branches** - Isolate changes instead of working directly on main

## Step-by-Step Resolution Process

### 1. Identify Conflicts

```bash
# Before merging, check if your branch is behind
git status

# Attempt to merge (this will show conflicts)
git merge feature-branch

# Or when pulling
git pull origin main
```

Git will output something like:
```
Auto-merging file.ts
CONFLICT (content): Merge conflict in file.ts
Automatic merge failed; fix conflicts and then commit the result.
```

### 2. Locate Conflict Markers

Open conflicted files - you'll see markers:

```
<<<<<<< HEAD
Your current branch's changes
=======
Incoming branch's changes
>>>>>>> feature-branch
```

### 3. Resolution Methods

#### **Method A: Manual Resolution**

1. Open each conflicted file
2. Edit to keep the desired changes (or combine both)
3. Remove conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
4. Save the file
5. Mark as resolved:
   ```bash
   git add <resolved-file>
   ```

#### **Method B: Using a Merge Tool**

```bash
# Configure a visual merge tool (VSCode, VS, Beyond Compare, etc.)
git mergetool

# For VSCode users:
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd "code --wait $MERGED"
```

The tool shows a 3-way merge view:
- **Left**: Your changes (HEAD)
- **Middle**: Result (where you make decisions)
- **Right**: Incoming changes

#### **Method C: Choose One Side Entirely**

```bash
# Keep your version, discard incoming
git checkout --ours <file>

# Keep incoming version, discard yours
git checkout --theirs <file>

# Then add the file
git add <file>
```

### 4. Complete the Merge

```bash
# After resolving all conflicts and staging files
git commit -m "Merge branch 'feature-branch' into main, resolved conflicts"
```

### 5. Verify and Test

```bash
# Run tests to ensure functionality
npm test  # or your test command

# Build the project
npm run build

# Review changes
git diff HEAD~1
```

## Advanced Scenarios

### **Abort a Merge**

If conflicts are too complex and you want to start over:

```bash
git merge --abort
# or for rebase
git rebase --abort
```

### **Continue After Resolving Conflicts in Rebase**

```bash
git add <resolved-files>
git rebase --continue
```

### **Resolve Multiple Conflicts Efficiently**

```bash
# See all conflicted files
git diff --name-only --diff-filter=U

# Resolve all using "theirs" (incoming)
git diff --name-only --diff-filter=U | xargs git checkout --theirs
git add -u
```

## Best Practices

### 1. **Manual Review Over Automatic Acceptance** ⭐ **MOST IMPORTANT**

**Why:** Blindly choosing "ours" or "theirs" discards valuable work and can introduce bugs. Each conflict represents two different approaches to solving a problem. Understanding both sides ensures you make an informed decision about which code to keep, or whether to creatively combine them.

**Example:**
```javascript
// Branch A added validation
if (!user) throw new Error('User required');

// Branch B added logging
console.log('Processing user:', user.id);

// BAD: Choose one side entirely
// GOOD: Combine both
if (!user) throw new Error('User required');
console.log('Processing user:', user.id);
```

### 2. **Small, Frequent Merges**

**Why:** The more commits that diverge between branches, the more complex conflicts become. Merging small changes daily keeps conflicts manageable and easier to understand.

**Strategy:**
- Rebase your feature branch onto main daily: `git pull origin main --rebase`
- Merge main into your feature branch regularly
- Keep pull requests small and focused (ideally < 400 lines)

### 3. **Use Visual Merge Tools**

**Why:** Conflict markers in plain text are hard to parse. Visual tools (VSCode, GitKraken, Beyond Compare) show a 3-way merge:
- **Left**: Your changes (HEAD)
- **Right**: Incoming changes
- **Center**: Result (where you edit)

This visual context helps you understand the scope and intent of each change.

**VSCode Setup:**
```bash
git config --global merge.tool vscode
git config --global mergetool.vscode.cmd "code --wait $MERGED"
```

### 4. **Test Thoroughly After Resolution**

**Why:** Even if the code looks correct syntactically, conflicts can break runtime behavior. Logic that worked separately may not work when combined.

**Checklist:**
- [ ] Run unit tests: `npm test` or `yarn test`
- [ ] Run integration tests
- [ ] Build the project: `npm run build`
- [ ] Manual testing of affected features
- [ ] Check for regressions in related functionality

### 5. **Communicate with the Other Developer**

**Why:** If you don't understand why a change was made, you might discard important work or create a bug. The author of the conflicting code can provide context about their intent.

**When to communicate:**
- Complex business logic conflicts
- Architectural decisions
- When both changes seem valid but incompatible
- If you're unsure about the impact

### 6. **Keep Branches Updated (Rebase or Merge)**

**Why:** The longer your branch diverges from main, the more likely and complex conflicts become. Regular updates minimize conflict surface area.

**Preferred approach - Rebase:**
```bash
git fetch origin
git rebase origin/main
# Resolve any conflicts (usually small and recent)
git push -f origin feature-branch
```

**Alternative - Merge:**
```bash
git fetch origin
git merge origin/main
# Resolve conflicts
git push origin feature-branch
```

**Note:** Rebase creates cleaner history but requires force push (only on feature branches, never on shared branches).

### 7. **Understand the Intent, Not Just the Code**

**Why:** Code is a solution to a problem. Without understanding the problem each branch was solving, you might choose the wrong solution or create an incomplete one.

**Process:**
1. Read commit messages: `git log --oneline --graph`
2. Look at related issues/tickets
3. Check PR descriptions
4. Ask: "What problem was this change trying to solve?"
5. Ensure your resolution addresses both problems

### 8. **Write Clear Merge Commit Messages**

**Why:** Future developers (including yourself) need to understand what happened during the merge, especially if conflicts were complex.

**Template:**
```
Merge branch 'feature-x' into develop

Resolved conflicts in:
- src/components/Button.tsx: Both branches added different props
- src/utils/api.ts: Concurrent refactoring of error handling

Combined validation logic from feature-x with logging from develop.
Added comprehensive error handling that covers both use cases.
```

### 9. **Avoid Force Pushing to Shared Branches**

**Why:** Force pushing (`git push -f`) rewrites history. If others are working on the same branch, their local copies become out of sync, causing confusion and additional conflicts.

**Safe force push scenarios:**
- Your own feature branch (no one else has pulled it)
- After communicating with the team
- Using `--force-with-lease` (safer than `-f`):
  ```bash
  git push --force-with-lease origin feature-branch
  ```

**Never force push:**
- `main`/`master`
- `develop`
- Any branch with multiple collaborators

### 10. **Configure `.gitattributes` for Specific File Types**

**Why:** Some files can be merged automatically with custom strategies, reducing manual conflict resolution.

**Common patterns:**
```
# Merge JSON files by concatenating (for arrays)
*.json merge=union

# Treat lock files as binary (never auto-merge)
package-lock.json merge=ours
yarn.lock merge=ours

# Normalize line endings
*.sh text eol=lf
*.bat text eol=crlf

# Mark generated files as binary
*.pbxproj -merge
```

**Setup:**
```bash
# Create/update .gitattributes at repo root
# Commit it - it applies to future merges
```

### 11. **Use `git rerere` (Reuse Recorded Resolution)**

**Why:** If the same conflict occurs repeatedly (e.g., when rebasing long-lived branches), Git can remember your resolution and apply it automatically.

**Enable:**
```bash
git config --global rerere.enabled true
```

**How it works:**
1. First time: Resolve conflict manually, `git add`, `git commit`
2. Git records the resolution
3. Next time same conflict appears: Git auto-resolves it

**Best for:** Complex conflicts that take hours to resolve properly.

### 12. **Create a Backup Before Complex Resolutions**

**Why:** If a resolution goes wrong, you need a way to revert without losing work.

**Methods:**
```bash
# Create a temporary branch
git branch conflict-backup-$(date +%Y%m%d-%H%M%S)

# Or create a stash
git stash push -m "Pre-conflict-resolution-backup"
```

### 13. **Resolve Conflicts in Logical Order**

**Why:** Some conflicts depend on others. Resolving in the wrong order can create cascading issues.

**Strategy:**
1. Start with configuration files (they affect everything)
2. Resolve shared utilities/helpers (other files may depend on them)
3. Move to component files
4. Finally, resolve tests (they'll validate your resolutions)

### 14. **Don't Leave Conflict Markers in Code**

**Why:** Conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) are not valid syntax in most languages. They will cause runtime errors or build failures.

**Check before committing:**
```bash
# Search for leftover markers
git grep -n '<<<<<<<'
git grep -n '======='
git grep -n '>>>>>>>'
```

### 15. **Review the Final Diff**

**Why:** After resolving, review what will be committed to ensure no accidental deletions or unwanted changes.

```bash
# See staged changes
git diff --cached

# See all changes in this merge
git diff HEAD~1
```

## Why These Practices Matter

### **Code Quality & Stability**
Manual review ensures the merged code is correct and complete, not just syntactically valid.

### **Team Productivity**
Clear communication and small merges reduce friction and rework.

### **Maintainability**
Clear commit messages and proper conflict resolution make future debugging easier.

### **Risk Mitigation**
Testing, backups, and careful review prevent production bugs.

### **Knowledge Sharing**
Documenting resolutions helps the team learn and avoid repeat conflicts.

## The "Golden Rule" of Merge Conflicts

**"If you don't understand both sides of the conflict, you haven't finished resolving it."**

This rule encompasses:
- Read the code
- Understand the intent
- Communicate if needed
- Test the result
- Document the decision

Following this ensures you're not just mechanically removing markers, but actively improving the codebase by thoughtfully combining the best of both branches.

## Common Pitfalls to Avoid

- **Don't commit with conflict markers** - Always remove `<<<<<<<` etc.
- **Don't skip testing** - Conflicts can introduce subtle bugs
- **Don't force push** after resolving shared branch conflicts
- **Don't ignore warnings** - Git will tell you about unresolved conflicts

## Quick Reference Commands

```bash
# Check status
git status

# See conflicts
git diff

# Use merge tool
git mergetool

# Choose ours/theirs
git checkout --ours <file>
git checkout --theirs <file>

# Mark resolved
git add <file>

# Complete merge
git commit

# Abort
git merge --abort
```

## Visual Guide to Conflict Markers

```
<<<<<<< HEAD
This is the content from your current branch (the branch you have checked out)
=======
This is the content from the branch being merged in
>>>>>>> feature-branch
```

**Resolution example:**

```javascript
// Before conflict:
<<<<<<< HEAD
const total = price * quantity;
const tax = total * 0.1;
=======
const subtotal = price * quantity;
const taxRate = 0.1;
const tax = subtotal * taxRate;
>>>>>>> feature-branch

// After resolution (combining both):
const subtotal = price * quantity;
const tax = subtotal * 0.1;
```

## Using VSCode's Built-in Merge Editor

VSCode has an excellent built-in merge conflict resolver:

1. Open a conflicted file
2. Click "Accept Incoming Change", "Accept Current Change", or "Accept Both Changes"
3. Or manually edit in the middle pane
4. Click "Complete Merge" when done
5. Save and stage the file

## Handling Complex Conflicts

When both sides have valid changes that need to be combined:

1. **Understand the intent** - Read both changes carefully
2. **Preserve functionality** - Ensure the final code works correctly
3. **Test thoroughly** - Run unit tests and manual testing
4. **Document decisions** - Add comments if the resolution isn't obvious

## After Resolution

1. **Stage all resolved files:**
   ```bash
   git add .
   ```

2. **Commit the merge:**
   ```bash
   git commit -m "Merge branch 'feature' into develop\n\nResolved conflicts in:\n- src/components/Button.tsx\n- src/utils/helpers.ts"
   ```

3. **Push if needed:**
   ```bash
   git push origin <your-branch>
   ```

4. **Verify with team** - Let reviewers know about the conflict resolution

## Summary

Merge conflicts are a normal part of collaborative development. The key is:
- Stay calm and methodical
- Understand both sides of the conflict
- Test thoroughly after resolution
- Communicate with your team

With practice, conflict resolution becomes a routine part of the development workflow.