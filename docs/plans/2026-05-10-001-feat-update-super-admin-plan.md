---
title: Update Super Admin Credentials
type: feat
status: active
created: 2026-05-10
---

# Update Super Admin Credentials

This plan outlines the steps required to change the Super Admin credentials in the Casper POS application to the requested values (`user = cas`, `pass = 3204500A`).

## Proposed Changes

### 1. Environment Variables

Update the local environment configuration to enable and set the Super Admin credentials.

#### [MODIFY] `.env`
Append the following environment variables to enable the super admin backdoor and set the credentials:
```env
SUPER_ADMIN_ENABLED="true"
SUPER_ADMIN_USER="cas"
SUPER_ADMIN_PASS="3204500A"
```

### 2. Authentication Logic

Update the hardcoded super admin username in the authentication library to reflect the environment variable, preventing potential display issues or logic conflicts when the user logs in as `cas`.

#### [MODIFY] `src/lib/auth.ts`
- Modify the `getSession()` function's fast-path for the super-admin backdoor.
- Change the hardcoded `username: 'a'` to `username: process.env.SUPER_ADMIN_USER || 'cas'`.

## Verification Plan

### Manual Verification
- Start the development server (`npm run dev`).
- Attempt to log in using the username `cas` and password `3204500A`.
- Verify that the login is successful and grants `ADMIN` access.
- Check the top navigation/sidebar to ensure the user's name displays as `Super Admin` and the username is `cas`.
