# Multi-Academy Migration and Security Report

## Architecture

The application now uses `Academy` as its tenant boundary. Authentication resolves the user's academy once, stores academy identity and role in the NextAuth JWT/session, and enters a server-side tenant context. The tenant-aware Prisma client fails closed without an academy or platform context and injects `academyId` into academy-owned reads, writes, updates, and deletes. Client-supplied academy IDs are not used to select a tenant.

`systemDb` is intentionally restricted to authentication, initial setup, public transactional registration, and Platform Super Admin operations. Academy users cannot enter platform mode.

## Route Audit

- Academy-scoped: swimmers, styles, groups/members, sessions/lanes/laps, notes/recommendations, parent mappings and portal data, training plans/sets, and the complete practice-run lifecycle.
- Academy administration: users and academy settings, guarded by academy role checks.
- Platform-only: `/api/platform/academies`, guarded by `PLATFORM_SUPER_ADMIN` and returning aggregate data without swimmer details.
- Public/system routes: `/api/academies/register`, NextAuth, and initial `/api/setup`. Registration and setup use explicit system access and transactions.
- The source audit found no academy-owned `db` query in `src/app/api` without an authentication/role guard. `TrainingPlanSet` is isolated through its parent plan relation.

## Existing Data Backfill

Migration `20260721183000_add_multi_academy_tenancy` performs a staged conversion in one transaction:

1. Creates academy/settings tables and nullable ownership columns.
2. Creates or reuses `LanePulse Demo Academy` (`LP-DEMO`, `lanepulse-demo`).
3. Backfills root records and then dependent records through their parent relations.
4. Makes required ownership columns non-null.
5. Adds foreign keys, indexes, and tenant-safe unique constraints.

`npm run db:backfill-academy` is an idempotent repair/verification helper for a database where the tenant columns already exist. It never resets data or prints credentials.

## Production Neon Procedure

Back up or branch the Neon production database first. Set the production `DATABASE_URL` in a secure shell or deployment environment; do not paste it into logs.

```powershell
cd "D:\PYTHON CODE\LanePulsePro_Trainer_Z_Ver_1.1"
npm ci
npx prisma validate
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy
```

If the production schema was historically maintained with `prisma db push` and has no Prisma migration history, verify that it already matches each old migration, then baseline only the four pre-tenancy migrations with `prisma migrate resolve --applied <migration-name>`. Do not mark the tenancy migration applied before it runs. Then execute `npx prisma migrate deploy` and rerun `npx prisma migrate status`.

Deploy the Vercel application only after the migration succeeds. Use `prisma generate` during install/build; do not use `prisma db push` or `migrate dev` against production.

## Tenant Isolation Test Matrix

Use a development database and create Academy A and Academy B through registration. For each direct-ID test, expect `404` or `403`, never another academy's payload.

1. Coach A creates Swimmer A; Coach B creates Swimmer B.
2. Coach A lists, reads, updates, and deletes using Swimmer B's ID.
3. Coach A requests Academy B group, plan, session, and practice-run IDs.
4. Parent A requests Parent B's mapped swimmer and analysis IDs.
5. Academy Admin requests `/api/platform/academies` and receives `403`.
6. Platform Super Admin requests academy summaries and can activate/deactivate an academy.
7. Confirm Academy A and B may reuse style and group names without collisions.

No automated test framework exists in this repository, so these authenticated cross-tenant scenarios remain a required manual/integration pass against a disposable development database.

## Portrait Mobile Test Matrix

Test Analysis and Parent Dashboard at `320x568`, `360x800`, `375x812`, `390x844`, `412x915`, and tablet portrait. Verify filters wrap, KPI cards remain readable, charts stay within the viewport, mobile report cards replace wide tables, Chart/Table toggles work, touch targets are usable, and bottom navigation does not cover content.

## Local Validation

```powershell
cd "D:\PYTHON CODE\LanePulsePro_Trainer_Z_Ver_1.1"
npm install
npx prisma validate
npx prisma generate
npx prisma migrate status
npm run build
npm run dev
```

Local URL: `http://localhost:3000`

