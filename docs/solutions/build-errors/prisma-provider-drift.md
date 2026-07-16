---
track: bug
problem_type: build-error
category: build-errors
module: prisma
---

# Prisma Provider Drift Detected

## Problem
Git commit failed with a pre-commit hook error: `PRISMA PROVIDER DRIFT DETECTED`. The `prisma/schema.prisma` file had its provider set to `"sqlite"`.

## Symptoms
```
❌ PRISMA PROVIDER DRIFT DETECTED
   prisma/schema.prisma datasource provider must be "postgresql".
   Found:   provider = "sqlite"
```

## Solution
Change the provider back to `postgresql` in `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

## Why This Works
The project enforces `postgresql` in the schema to protect `Decimal` field precision (`NUMERIC` vs `REAL`) and to ensure the correct query-engine binary is generated for the cloud core.

## Prevention
Always ensure the `schema.prisma` provider remains `postgresql` before committing. If you must temporarily switch to `sqlite` for desktop testing, do not commit the provider change.
