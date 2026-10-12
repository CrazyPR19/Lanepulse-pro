# LanePulse Production Database Recovery

## Purpose

LanePulse uses PostgreSQL through `DATABASE_URL`. Production schema changes are applied only from the committed Prisma migration history with `prisma migrate deploy`. Never use `migrate reset`, `migrate dev`, or `db push` against production.

## Environment Boundaries

- Production: Vercel `DATABASE_URL` points to the production Neon database. `NEXTAUTH_URL` is the live HTTPS domain and `NEXTAUTH_SECRET` is a stable production secret.
- Preview: use a separate Neon branch/database. Do not point previews at production when migrations or write testing are involved.
- Development: `.env` points to local PostgreSQL and may use `NEXTAUTH_URL=http://localhost:3000`.

`NEXT_PUBLIC_APP_ENV` is not currently consumed by application code and is optional.

## Read-Only Diagnostic

Run this only after securely supplying the intended environment variables:

```powershell
npm run db:check-production
```

The diagnostic prints environment presence, database/schema names, migration names, required table presence and row counts, and academy-orphan counts. It never prints connection strings, hosts, passwords, hashes, tokens, or secrets.

Use the database name in its output to confirm that Vercel and the migration shell target the same intended Neon database. Exact Prisma table casing is checked, including `public."User"`.

## Recovery Sequence

1. Create a Neon backup branch from production.
2. Confirm Vercel Production has `DATABASE_URL`, `NEXTAUTH_SECRET`, and a live HTTPS `NEXTAUTH_URL`.
3. Use a direct/non-pooler Neon URL in a secure deployment shell.
4. Run the read-only diagnostic before making changes.
5. Run the committed migrations and then rerun the diagnostic:

```powershell
npm ci
npx prisma validate
npx prisma generate
npx prisma migrate status
npm run db:deploy
npx prisma migrate status
npm run db:check-production
```

6. Confirm `User`, `Academy`, `AcademySettings`, `Swimmer`, `TrainingGroup`, `TrainingPlan`, and `PracticeRun` are present and pending migrations are `NONE`.
7. Set the Vercel runtime `DATABASE_URL` to the pooled Neon URL for the same database.
8. Redeploy Vercel and smoke-test `/`, `/api/setup`, and `/api/auth/session`.

## Migration-History Decision

- Empty database with no tables: `prisma migrate deploy` should apply all five migrations.
- Existing schema with correct `_prisma_migrations`: deploy only reported pending migrations.
- Existing tables but no migration records: stop and compare the physical schema to each historical migration before baselining. Mark only migrations already represented physically with `prisma migrate resolve --applied`.
- Migration records but missing physical tables: do not resolve or reset. Restore from a known-good branch/backup or investigate manual schema loss first.
- `Academy` tables already exist while the tenancy migration is pending: treat this as a partial/manual migration and investigate before deploying.

## Vercel Build Policy

`postinstall` generates Prisma Client. `vercel.json` overrides the existing project's default `npm run build` command with `npm run vercel-build`, which generates the client, runs `prisma migrate deploy`, builds Next.js, and copies the standalone output. Production and Preview must use separate Neon databases because Vercel executes the same build command in both environments.

```text
prisma generate -> prisma migrate deploy -> next build -> copy standalone
```

Keep the normal local `npm run build` unchanged. Never point Preview builds at the Production database.

## Setup API States

- Valid schema and zero users: setup wizard is allowed.
- Database connection failure: `/api/setup` returns HTTP 503 with `DATABASE_UNAVAILABLE`.
- Missing required Prisma table/column: `/api/setup` returns HTTP 503 with `DATABASE_SCHEMA_NOT_READY`.
- Valid configured database: normal login/application flow.

Server logs record only a safe error category and Prisma error code. They must never contain a connection URL, password, secret, password hash, session token, or JWT.
