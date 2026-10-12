const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
const { readdir } = require("node:fs/promises") as typeof import("node:fs/promises");
const { join } = require("node:path") as typeof import("node:path");

const prisma = new PrismaClient({ log: [] });
const requiredTables = [
  "User",
  "SwimmingStyle",
  "Academy",
  "AcademySettings",
  "Swimmer",
  "TrainingGroup",
  "TrainingPlan",
  "PracticeRun",
] as const;

type NameRow = { name: string };
type CountRow = { count: bigint };

function yesNo(value: boolean) {
  return value ? "YES" : "NO";
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRaw<NameRow[]>`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ${tableName}
  `;
  return rows.length > 0;
}

async function tableNameAlternatives(tableName: string) {
  return prisma.$queryRaw<NameRow[]>`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND lower(table_name) IN (lower(${tableName}), lower(${`${tableName}s`}))
      AND table_name <> ${tableName}
    ORDER BY table_name
  `;
}

async function tableCount(tableName: (typeof requiredTables)[number]) {
  const safeQueries: Record<(typeof requiredTables)[number], () => Promise<CountRow[]>> = {
    User: () => prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "User"`,
    SwimmingStyle: () => prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "SwimmingStyle"`,
    Academy: () => prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "Academy"`,
    AcademySettings: () => prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "AcademySettings"`,
    Swimmer: () => prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "Swimmer"`,
    TrainingGroup: () => prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "TrainingGroup"`,
    TrainingPlan: () => prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "TrainingPlan"`,
    PracticeRun: () => prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "PracticeRun"`,
  };
  const rows = await safeQueries[tableName]();
  return rows[0] ? Number(rows[0].count) : 0;
}

async function main() {
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "PRESENT" : "MISSING"}`);
  console.log(`NEXTAUTH_SECRET: ${process.env.NEXTAUTH_SECRET ? "PRESENT" : "MISSING"}`);
  console.log(`NEXTAUTH_URL: ${process.env.NEXTAUTH_URL ? "PRESENT" : "MISSING"}`);
  if (process.env.NEXTAUTH_URL) {
    try {
      const authUrl = new URL(process.env.NEXTAUTH_URL);
      const liveHttps = authUrl.protocol === "https:" && !["localhost", "127.0.0.1"].includes(authUrl.hostname);
      console.log(`NEXTAUTH_URL validation: ${liveHttps ? "LIVE_HTTPS" : "NOT_PRODUCTION_SAFE"}`);
    } catch {
      console.log("NEXTAUTH_URL validation: INVALID");
    }
  }
  console.log(`NEXT_PUBLIC_APP_ENV: ${process.env.NEXT_PUBLIC_APP_ENV ? "PRESENT" : "NOT USED/MISSING"}`);

  if (!process.env.DATABASE_URL) {
    console.log("Database reachable: NO");
    process.exitCode = 1;
    return;
  }

  const location = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
    SELECT current_database() AS database, current_schema() AS schema
  `;
  console.log("Database reachable: YES");
  console.log(`Database name: ${location[0]?.database ?? "UNKNOWN"}`);
  console.log(`Schema: ${location[0]?.schema ?? "UNKNOWN"}`);

  const migrationTable = await tableExists("_prisma_migrations");
  console.log(`_prisma_migrations: ${yesNo(migrationTable)}`);

  let appliedNames: string[] = [];
  if (migrationTable) {
    const applied = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT migration_name AS name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at
    `;
    appliedNames = applied.map((row) => row.name);
    console.log(`Applied migrations: ${appliedNames.length}`);
    console.log(`Latest applied migration: ${appliedNames.at(-1) ?? "NONE"}`);
  } else {
    console.log("Applied migrations: 0");
    console.log("Latest applied migration: NONE");
  }

  const migrationPath = join(process.cwd(), "prisma", "migrations");
  const localMigrations = (await readdir(migrationPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const pending = localMigrations.filter((name) => !appliedNames.includes(name));
  console.log(`Pending migrations: ${pending.length ? pending.join(", ") : "NONE"}`);

  const existing = new Map<string, boolean>();
  for (const table of requiredTables) {
    const exists = await tableExists(table);
    existing.set(table, exists);
    console.log(`${table}: ${yesNo(exists)}${exists ? ` (rows: ${await tableCount(table)})` : ""}`);
    if (!exists) {
      const alternatives = await tableNameAlternatives(table);
      if (alternatives.length) {
        console.log(`${table} naming/case alternatives: ${alternatives.map((row) => row.name).join(", ")}`);
      }
    }
  }

  if (existing.get("Academy")) {
    const orphanChecks = [
      ["User", existing.get("User")],
      ["SwimmingStyle", existing.get("SwimmingStyle")],
      ["Swimmer", existing.get("Swimmer")],
      ["TrainingGroup", existing.get("TrainingGroup")],
      ["TrainingPlan", existing.get("TrainingPlan")],
      ["PracticeRun", existing.get("PracticeRun")],
    ] as const;
    for (const [table, exists] of orphanChecks) {
      if (!exists) continue;
      const query = {
        User: () => prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "User" r LEFT JOIN "Academy" a ON a.id = r."academyId" WHERE r."academyId" IS NOT NULL AND a.id IS NULL`,
        SwimmingStyle: () => prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "SwimmingStyle" r LEFT JOIN "Academy" a ON a.id = r."academyId" WHERE a.id IS NULL`,
        Swimmer: () => prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "Swimmer" r LEFT JOIN "Academy" a ON a.id = r."academyId" WHERE a.id IS NULL`,
        TrainingGroup: () => prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "TrainingGroup" r LEFT JOIN "Academy" a ON a.id = r."academyId" WHERE a.id IS NULL`,
        TrainingPlan: () => prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "TrainingPlan" r LEFT JOIN "Academy" a ON a.id = r."academyId" WHERE a.id IS NULL`,
        PracticeRun: () => prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS count FROM "PracticeRun" r LEFT JOIN "Academy" a ON a.id = r."academyId" WHERE a.id IS NULL`,
      }[table];
      const rows = await query();
      console.log(`${table} orphan academy references: ${rows[0] ? Number(rows[0].count) : 0}`);
    }
  }
}

main()
  .catch(() => {
    console.log("Database reachable: NO");
    console.log("Diagnostic failed safely; no connection details were printed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
