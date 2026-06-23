---
status: active
created: 2026-06-23
---

# fix: Restore Engineer Column to Tickets List

## Revised Finding After Full File Inspection

> [!IMPORTANT]
> After reading every file in full, the picture has changed:
>
> - ✅ `TicketPrintOptionsModal.tsx` — **Already has the complete auto-print logic** (736 lines, fully intact on this branch). No changes needed.
> - ✅ `src/app/[locale]/maintenance/tickets/[id]/page.tsx` — **Already has the auto-print `useEffect`** wired to `shouldAutoPrint()` and `?print=true` URL param. No changes needed.
> - ❌ `src/components/tickets/TicketsList.tsx` — **Missing the engineer column only.** This is the ONLY file that needs editing.
>
> The stash and cherry-pick are NOT needed. We apply 3 surgical edits directly to `TicketsList.tsx`.

---

## Exact Changes Required in `TicketsList.tsx`

### Edit 1 — Add `technician` sort case in `sortedTickets` useMemo (line 307–310)

**Current code (lines 307–310):**
```tsx
} else if (sortConfig.key === 'customerSuccessRatio') {
    aVal = Number(a.customerSuccessRatio);
    bVal = Number(b.customerSuccessRatio);
}
```

**Replace with:**
```tsx
} else if (sortConfig.key === 'customerSuccessRatio') {
    aVal = Number(a.customerSuccessRatio);
    bVal = Number(b.customerSuccessRatio);
} else if (sortConfig.key === 'technician') {
    aVal = a.technician?.name || "";
    bVal = b.technician?.name || "";
}
```

---

### Edit 2 — Add Engineer `<col>` in `<colgroup>` (line 543)

**Current code (lines 542–544):**
```tsx
<col className="w-[180px]" /> {/* Fault/Issue */}
<col className="w-[100px]" /> {/* Time */}
<col className="w-[50px]" />  {/* Actions */}
```

**Replace with:**
```tsx
<col className="w-[160px]" /> {/* Fault/Issue */}
<col className="w-[130px]" /> {/* Engineer */}
<col className="w-[90px]" />  {/* Time */}
<col className="w-[50px]" />  {/* Actions */}
```

> [!NOTE]
> Also shrink the other cols slightly (150→130 Status, 100→90 Success, 120→110 Date/Info/Paid/Due, 180→160 Customer/Device) to compensate for the extra column width. These are the same values from commit `9273020`.

---

### Edit 3 — Add Engineer `<th>` header and `<td>` body cell

**`<th>` insertion point:** after the `t('table.risk')` th block (line 596), before the `t('table.timeToFix')` th.

**Insert `<th>` after line 596:**
```tsx
<th className="px-6 py-4 text-start cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 transition-colors" onClick={() => handleSort('technician')}>
    <div className="flex items-center gap-2">
        {getSortIcon('technician')}
        {t('table.technician')}
    </div>
</th>
```

**`<td>` insertion point:** after the Fault/Issue `<td>` block (~line 762–769), before the Time/urgency `<td>`.

**Insert `<td>` block:**
```tsx
{/* 🛠 Engineer Column */}
<td className="px-4 py-4">
    {ticket.technician?.name ? (
        <span className="text-xs font-black text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-white/5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 inline-block max-w-[120px] truncate" title={ticket.technician.name}>
            {ticket.technician.name}
        </span>
    ) : (
        <span className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 bg-zinc-50 dark:bg-white/[0.02] px-2.5 py-1.5 rounded-lg border border-dashed border-zinc-200 dark:border-white/5 inline-block">
            {t('details.unassigned')}
        </span>
    )}
</td>
```

---

## Step-by-Step Execution

- [ ] **Step 1** — Open `src/components/tickets/TicketsList.tsx`
- [ ] **Step 2** — Apply Edit 1: add `technician` sort case after `customerSuccessRatio` case in `sortedTickets` useMemo (~line 309)
- [ ] **Step 3** — Apply Edit 2: update `<colgroup>` — shrink existing cols and add new `w-[130px]` Engineer col before Actions col (~line 532–544)
- [ ] **Step 4** — Apply Edit 3a: add `<th>` for Engineer column after the Risk `<th>` block (~line 596), before timeToFix `<th>`
- [ ] **Step 5** — Apply Edit 3b: add `<td>` Engineer cell in the table body after the Fault/Issue `<td>` block (~line 762)
- [ ] **Step 6** — Save the file, verify TypeScript compiles (dev server should hot-reload cleanly)
- [ ] **Step 7** — Navigate to Maintenance → Tickets list and confirm Engineer column appears between Fault/Issue and Time columns
- [ ] **Step 8** — Confirm the stash is still intact: `git stash list` (no need to pop it — the auto-print code is already present)

---

## Why No Cherry-Pick or Stash-Pop Needed

| Feature | Status on this branch | Action |
|---------|----------------------|--------|
| Auto-print modal (TicketPrintOptionsModal.tsx) | ✅ Complete, 736 lines | None |
| Auto-print page logic (ticket detail page.tsx) | ✅ Complete with useEffect + shouldAutoPrint | None |
| Engineer column in TicketsList | ❌ Missing — 3 precise insertions | Apply edits above |
| Technician sort key | ❌ Missing — 1 else-if block | Apply Edit 1 above |

---

## Verification Checklist

- [ ] Engineer column visible in Tickets list table between Fault/Issue and Time
- [ ] Engineer name shown as a badge when assigned
- [ ] "غير معين" (unassigned) badge shown in dashed border when no technician
- [ ] Clicking the Engineer column header sorts the list
- [ ] No TypeScript errors in dev console
- [ ] Table layout not broken (no overflow from extra column)
- [ ] Auto-print modal still fires correctly when creating a new ticket (`?print=true`)

This plan covers how to restore the missing "assigned engineer" and "auto print" ticket features, and how to prevent this Git branch desync from happening again.

---

## Gap Analysis (What is Actually Missing Right Now)

Inspecting the **current `TicketsList.tsx`** on `fix/hr-employees-hardening` against the `feat/tickets-financial-stats` branch reveals two concrete gaps:

| # | Gap | Affected File | Source Location |
|---|-----|---------------|-----------------|
| 1 | **Engineer column missing** — `colgroup` has 12 columns but no `w-[130px]` Engineer slot. The `<th>` for `t('table.technician')` and the `<td>` engineer badge cell are entirely absent. | `src/components/tickets/TicketsList.tsx` | commit `9273020` on `feat/tickets-financial-stats` |
| 2 | **Technician sort key missing** — the `sortedTickets` `useMemo` does not handle `sortConfig.key === 'technician'` (falls through to raw field access, returning undefined). | `src/components/tickets/TicketsList.tsx` | commit `9273020` |
| 3 | **Auto-print WIP changes** — includes: enhanced `TicketPrintOptionsModal.tsx` (27 line diff), ticket detail page auto-print logic (`src/app/[locale]/maintenance/tickets/[id]/page.tsx`, 26 line diff). | `src/components/tickets/TicketPrintOptionsModal.tsx`, `src/app/[locale]/maintenance/tickets/[id]/page.tsx` | `stash@{0}` on `fix/ticket-auto-print` |
| 4 | **Date column UX regression** — The `feat/tickets-financial-stats` branch had an improved two-line date+time display with a pulsing dot; the current branch reverted to a flat `toLocaleDateString()` call. | `src/components/tickets/TicketsList.tsx` (line 694–695) | commit `81247f9` on `feat/tickets-financial-stats` |

> [!NOTE]
> The stash `stash@{0}` also contains changes to `auto-journal-service.ts`, `seed-accounts.ts`, `seed-cash-categories.ts`, `auth.ts`, and `prisma-accounting-middleware.ts`. These are **accounting self-healing changes** that are **separate** from the ticket feature. They will come along when you pop the stash and must be reviewed before committing.

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Cherry-pick conflict on `TicketsList.tsx`** — the current branch has diverged significantly (the `feat/tickets-financial-stats` branch added engineer filter dropdown, date UX improvements, etc. in commit `81247f9` which is NOT in the cherry-pick target `9273020`). The line numbers in `TicketsList.tsx` have shifted. | **High** | Medium | Resolve conflict manually. The engineer column TD and TH are self-contained blocks — easy to re-insert. Use `git diff HEAD feat/tickets-financial-stats -- src/components/tickets/TicketsList.tsx` as reference. |
| **Stash pop conflict** — `stash@{0}` was created on `fix/ticket-auto-print` which branched from a much older base. Accounting files in the stash (`auto-journal-service.ts`, `auth.ts`, etc.) may conflict with more recent changes on the HR branch. | **Medium** | Medium | Pop with `git stash pop` and resolve conflicts file-by-file. The accounting changes in the stash are beneficial (self-healing seed) and were partially superseded by the accounting infrastructure in commit `564b2ad`. |
| **Accounting stash changes double-applied** — the stash contains accounting self-healing logic that may already be partially present in the HR branch's `564b2ad` commit. | **Medium** | Low | After popping, run `git diff` on the accounting files and only keep what is not already there. |
| **Stale dev.db binary in stash** — `stash@{0}` includes `prisma/prisma/dev.db` as a binary change. Applying it will overwrite the current DB. | **High** | High | Use `git checkout HEAD -- prisma/prisma/dev.db` immediately after pop to restore the current database. |
| **Missing engineer filter dropdown** — commit `81247f9` (which is on `feat/tickets-financial-stats` but NOT in `9273020`) also added a per-engineer filter dropdown to the toolbar. This is NOT included in the cherry-pick. | **Certain** | Low | This is a feature gap, not a bug. Accept it as out-of-scope for this recovery or cherry-pick `81247f9` as well (higher conflict risk). |

---

## Execution Workflow (Step-by-Step)

> [!IMPORTANT]
> Recommended path: **Create a dedicated branch** (`fix/ticket-features-restored`) to keep the recovery isolated from the HR branch. Merge both branches into `main` when ready.

### Step 1 — Verify current state
```sh
git status                          # Must show clean working tree
git stash list                      # Confirm stash@{0} is "WIP: ticket auto print"
git branch                          # Confirm you are on fix/hr-employees-hardening
```

### Step 2 — Create isolation branch
```sh
git checkout -b fix/ticket-features-restored
```

### Step 3 — Cherry-pick the engineer column commit
```sh
git cherry-pick 9273020
# If conflict → resolve TicketsList.tsx manually, then:
git add src/components/tickets/TicketsList.tsx
git cherry-pick --continue
```

### Step 4 — Pop the auto-print stash
```sh
git stash pop "stash@{0}"
# Immediately protect the database:
git checkout HEAD -- prisma/prisma/dev.db
```

### Step 5 — Review accounting changes from stash
Inspect the stash diffs in these files and resolve conflicts:
- `src/lib/accounting/auto-journal-service.ts`
- `src/lib/accounting/seed-accounts.ts`  
- `src/lib/accounting/seed-cash-categories.ts`
- `src/lib/auth.ts`
- `src/lib/prisma-accounting-middleware.ts`

Keep the self-healing seed logic if it does not duplicate `564b2ad`. Discard anything already covered.

### Step 6 — Verify the ticket feature visually
- Start `npm run dev`
- Open Maintenance → Tickets list
- Confirm the **Engineer column** appears adjacent to Fault/Issue
- Open any ticket → confirm **auto-print** / print options modal behavior

### Step 7 — Commit and clean up
```sh
git add src/components/tickets/  src/app/ src/lib/
git commit -m "fix(tickets): restore engineer column, auto-print, and date UX"
```

---

## Success Ratio

| Scenario | Probability | Notes |
|----------|------------|-------|
| Cherry-pick applies cleanly | 20% | High divergence on `TicketsList.tsx` makes clean apply unlikely |
| Cherry-pick needs manual conflict resolution | 75% | Expected, low effort — the engineer TD/TH blocks are identifiable |
| Stash pops cleanly (excluding DB) | 35% | Accounting files likely conflict with HR branch work |
| Stash pop needs partial conflict resolution | 60% | Expected, mostly in accounting files |
| **Full recovery succeeds in one session** | **85%** | All code is safely stored — the risk is effort, not data loss |
| Data loss / code permanently gone | **0%** | Code is in git stash and committed branches — nothing is lost |

---

## Prevention Strategy (Post-Recovery)

1. **Name every stash** — `git stash push -m "WIP: ticket auto print (branch: fix/ticket-auto-print)"`. Unlabeled stashes rot.
2. **WIP commits instead of stashes** — Before switching context, commit with prefix: `git commit -m "WIP(tickets): auto-print in progress"`. Commit history is searchable; stash is not.
3. **Use `/ce-worktree`** — For parallel feature tracks (HR + Tickets), use git worktrees so both branches are alive simultaneously without stashing.
4. **One integration branch** — Maintain a `dev` or `integration` branch as a single merge target. Never let features sit orphaned on topic branches for weeks.
5. **Weekly branch audit** — Run `git stash list && git branch -v` at the start of each session to surface stale stashes and orphaned branches before they diverge further.

---

## Verification Plan

### Manual Verification
- [ ] Maintenance Tickets list shows **Engineer** column adjacent to Fault/Issue column
- [ ] Engineer column shows name badge when assigned, dashed "unassigned" badge when not
- [ ] Clicking Engineer column header sorts the table
- [ ] Opening a ticket and using the print button shows the **auto-print** options modal with correct behavior
- [ ] `git stash list` shows stash was consumed (no longer at index 0)
- [ ] `prisma/prisma/dev.db` is not overwritten (verify DB size is unchanged)
