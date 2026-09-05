import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const academyId = "cmultiacademydefault0001";

const statements = [
  `UPDATE "User" SET "academyId" = $1 WHERE "academyId" IS NULL AND "platformRole" IS DISTINCT FROM 'PLATFORM_SUPER_ADMIN'`,
  `UPDATE "Swimmer" SET "academyId" = $1 WHERE "academyId" IS NULL`,
  `UPDATE "SwimmingStyle" SET "academyId" = $1 WHERE "academyId" IS NULL`,
  `UPDATE "TrainingGroup" SET "academyId" = $1 WHERE "academyId" IS NULL`,
  `UPDATE "TrainingPlan" SET "academyId" = $1 WHERE "academyId" IS NULL`,
  `UPDATE "TrainingSession" SET "academyId" = $1 WHERE "academyId" IS NULL`,
  `UPDATE "PracticeRun" SET "academyId" = $1 WHERE "academyId" IS NULL`,
];

try {
  await prisma.academy.upsert({
    where: { academyCode: "LP-DEMO" },
    update: {},
    create: {
      id: academyId,
      academyName: "LanePulse Demo Academy",
      academyCode: "LP-DEMO",
      slug: "lanepulse-demo",
      timezone: "UTC",
      subscriptionPlan: "FREE",
      settings: {
        create: { defaultLaneCount: 12, poolLengthMeters: 25, timezone: "UTC" },
      },
    },
  });

  const counts = [];
  for (const statement of statements) {
    counts.push(await prisma.$executeRawUnsafe(statement, academyId));
  }

  console.log(`Default academy ready. Root records assigned: ${counts.reduce((sum, count) => sum + count, 0)}.`);
} finally {
  await prisma.$disconnect();
}
