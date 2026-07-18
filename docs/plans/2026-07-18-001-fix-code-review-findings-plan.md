# Ironclad Fix Code Review Findings (Phase 4)

Fix the findings identified in the Phase 4 Code Review report, hardened by the Ironclad Review process to eliminate XSS vulnerabilities, out-of-memory risks, and silent failures.

## Implementation Units

- [ ] **Unit 1: IPC Security Signatures**
  - In `electron/main.js`, update `app:safe-storage-encrypt` and `app:safe-storage-decrypt` to return structured objects (`{ success, data, encrypted, error }`). Do not silently fallback to plaintext without the `encrypted: false` flag.
- [ ] **Unit 2: License Activation XSS & UI Fix**
  - In `src/components/setup/LicenseActivationScreen.tsx`, unwrap the structured IPC response. 
  - Add yellow `sonner` toast if `!encrypted`. Add red toast and halt if `!success`.
  - **CRITICAL**: Remove `localStorage` JWT storage entirely and store only via `offlineDB.storeSettings.put()`.
- [ ] **Unit 3: Sync Batch Limits & OOM Defense**
  - In `src/lib/sync-service.ts`, replace `100` with `SYNC_BATCH_SIZE || 50` for ticket processing batch slicing to prevent undefined slicing. Update logs to match.
- [ ] **Unit 4: Vitest Logs**
  - In `vitest-global-setup.ts`, change `stdio: 'inherit'` to `stdio: 'ignore'`.
