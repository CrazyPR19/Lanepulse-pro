BEGIN;

-- DropIndex
DROP INDEX "SwimmingStyle_styleName_key";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "ParentSwimmer" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "PerformanceNote" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "PracticeRun" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "PracticeRunGroup" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "PracticeRunGroupRepeat" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "PracticeRunLap" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "PracticeRunResult" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "SessionLane" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "SessionLap" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "Swimmer" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "SwimmingStyle" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "TrainingGroup" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "TrainingPlan" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "TrainingSession" ADD COLUMN     "academyId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "academyId" TEXT,
ADD COLUMN     "platformRole" TEXT;

-- CreateTable
CREATE TABLE "Academy" (
    "id" TEXT NOT NULL,
    "academyName" TEXT NOT NULL,
    "academyCode" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "logoUrl" TEXT,
    "primaryColor" TEXT DEFAULT '#0f766e',
    "secondaryColor" TEXT DEFAULT '#0369a1',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionPlan" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Academy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademySettings" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "tagline" TEXT,
    "defaultLaneCount" INTEGER NOT NULL DEFAULT 8,
    "poolLengthMeters" INTEGER NOT NULL DEFAULT 25,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    "preferredUnits" TEXT NOT NULL DEFAULT 'METRIC',
    "maximumSwimmers" INTEGER,
    "maximumCoaches" INTEGER,
    "parentPortalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "advancedAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dataExportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboardingStep" INTEGER NOT NULL DEFAULT 1,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademySettings_pkey" PRIMARY KEY ("id")
);

-- Backfill all live records before tenant ownership becomes required.
INSERT INTO "Academy" ("id", "academyName", "academyCode", "slug", "timezone", "subscriptionPlan", "updatedAt")
SELECT 'cmultiacademydefault0001', 'LanePulse Demo Academy', 'LP-DEMO', 'lanepulse-demo', 'UTC', 'FREE', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Academy" WHERE "academyCode" = 'LP-DEMO');

INSERT INTO "AcademySettings" ("id", "academyId", "defaultLaneCount", "poolLengthMeters", "timezone", "updatedAt")
SELECT 'cmultiacademysettings001', "id", 12, 25, "timezone", CURRENT_TIMESTAMP
FROM "Academy" WHERE "academyCode" = 'LP-DEMO'
AND NOT EXISTS (SELECT 1 FROM "AcademySettings" WHERE "academyId" = "Academy"."id");

UPDATE "User" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "User"."academyId" IS NULL;
UPDATE "Swimmer" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "Swimmer"."academyId" IS NULL;
UPDATE "SwimmingStyle" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "SwimmingStyle"."academyId" IS NULL;
UPDATE "TrainingGroup" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "TrainingGroup"."academyId" IS NULL;
UPDATE "TrainingPlan" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "TrainingPlan"."academyId" IS NULL;
UPDATE "TrainingSession" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "TrainingSession"."academyId" IS NULL;
UPDATE "PracticeRun" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "PracticeRun"."academyId" IS NULL;

UPDATE "GroupMember" c SET "academyId" = p."academyId" FROM "TrainingGroup" p WHERE c."groupId" = p."id" AND c."academyId" IS NULL;
UPDATE "SessionLane" c SET "academyId" = p."academyId" FROM "TrainingSession" p WHERE c."sessionId" = p."id" AND c."academyId" IS NULL;
UPDATE "SessionLap" c SET "academyId" = p."academyId" FROM "TrainingSession" p WHERE c."sessionId" = p."id" AND c."academyId" IS NULL;
UPDATE "ParentSwimmer" c SET "academyId" = p."academyId" FROM "User" p WHERE c."parentUserId" = p."id" AND c."academyId" IS NULL;
UPDATE "PracticeRunGroup" c SET "academyId" = p."academyId" FROM "PracticeRun" p WHERE c."practiceRunId" = p."id" AND c."academyId" IS NULL;
UPDATE "PracticeRunGroupRepeat" c SET "academyId" = p."academyId" FROM "PracticeRun" p WHERE c."practiceRunId" = p."id" AND c."academyId" IS NULL;
UPDATE "PracticeRunResult" c SET "academyId" = p."academyId" FROM "PracticeRun" p WHERE c."practiceRunId" = p."id" AND c."academyId" IS NULL;
UPDATE "PracticeRunLap" c SET "academyId" = p."academyId" FROM "PracticeRun" p WHERE c."practiceRunId" = p."id" AND c."academyId" IS NULL;
UPDATE "PerformanceNote" c SET "academyId" = p."academyId" FROM "Swimmer" p WHERE c."swimmerId" = p."id" AND c."academyId" IS NULL;
UPDATE "PerformanceNote" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "PerformanceNote"."academyId" IS NULL;
UPDATE "AuditLog" c SET "academyId" = p."academyId" FROM "User" p WHERE c."userId" = p."id" AND c."academyId" IS NULL;
UPDATE "AuditLog" SET "academyId" = a."id" FROM "Academy" a WHERE a."academyCode" = 'LP-DEMO' AND "AuditLog"."academyId" IS NULL;

ALTER TABLE "Swimmer" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "SwimmingStyle" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "TrainingGroup" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "GroupMember" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "TrainingSession" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "SessionLane" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "SessionLap" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "PerformanceNote" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "ParentSwimmer" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "TrainingPlan" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "PracticeRun" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "PracticeRunGroup" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "PracticeRunGroupRepeat" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "PracticeRunResult" ALTER COLUMN "academyId" SET NOT NULL;
ALTER TABLE "PracticeRunLap" ALTER COLUMN "academyId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Academy_academyCode_key" ON "Academy"("academyCode");

-- CreateIndex
CREATE UNIQUE INDEX "Academy_slug_key" ON "Academy"("slug");

-- CreateIndex
CREATE INDEX "Academy_isActive_idx" ON "Academy"("isActive");

-- CreateIndex
CREATE INDEX "Academy_createdAt_idx" ON "Academy"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademySettings_academyId_key" ON "AcademySettings"("academyId");

-- CreateIndex
CREATE INDEX "AuditLog_academyId_idx" ON "AuditLog"("academyId");

-- CreateIndex
CREATE INDEX "AuditLog_academyId_createdAt_idx" ON "AuditLog"("academyId", "createdAt");

-- CreateIndex
CREATE INDEX "GroupMember_academyId_idx" ON "GroupMember"("academyId");

-- CreateIndex
CREATE INDEX "ParentSwimmer_academyId_idx" ON "ParentSwimmer"("academyId");

-- CreateIndex
CREATE INDEX "PerformanceNote_academyId_idx" ON "PerformanceNote"("academyId");

-- CreateIndex
CREATE INDEX "PerformanceNote_academyId_createdAt_idx" ON "PerformanceNote"("academyId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeRun_academyId_idx" ON "PracticeRun"("academyId");

-- CreateIndex
CREATE INDEX "PracticeRun_academyId_sessionDate_idx" ON "PracticeRun"("academyId", "sessionDate");

-- CreateIndex
CREATE INDEX "PracticeRunGroup_academyId_idx" ON "PracticeRunGroup"("academyId");

-- CreateIndex
CREATE INDEX "PracticeRunGroupRepeat_academyId_idx" ON "PracticeRunGroupRepeat"("academyId");

-- CreateIndex
CREATE INDEX "PracticeRunLap_academyId_idx" ON "PracticeRunLap"("academyId");

-- CreateIndex
CREATE INDEX "PracticeRunResult_academyId_idx" ON "PracticeRunResult"("academyId");

-- CreateIndex
CREATE INDEX "SessionLane_academyId_idx" ON "SessionLane"("academyId");

-- CreateIndex
CREATE INDEX "SessionLap_academyId_idx" ON "SessionLap"("academyId");

-- CreateIndex
CREATE INDEX "Swimmer_academyId_idx" ON "Swimmer"("academyId");

-- CreateIndex
CREATE INDEX "Swimmer_academyId_swimmerName_idx" ON "Swimmer"("academyId", "swimmerName");

-- CreateIndex
CREATE INDEX "Swimmer_academyId_createdAt_idx" ON "Swimmer"("academyId", "createdAt");

-- CreateIndex
CREATE INDEX "SwimmingStyle_academyId_idx" ON "SwimmingStyle"("academyId");

-- CreateIndex
CREATE UNIQUE INDEX "SwimmingStyle_academyId_styleName_key" ON "SwimmingStyle"("academyId", "styleName");

-- CreateIndex
CREATE INDEX "TrainingGroup_academyId_idx" ON "TrainingGroup"("academyId");

-- CreateIndex
CREATE INDEX "TrainingGroup_academyId_createdAt_idx" ON "TrainingGroup"("academyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingGroup_academyId_groupName_key" ON "TrainingGroup"("academyId", "groupName");

-- CreateIndex
CREATE INDEX "TrainingPlan_academyId_idx" ON "TrainingPlan"("academyId");

-- CreateIndex
CREATE INDEX "TrainingPlan_academyId_planDate_idx" ON "TrainingPlan"("academyId", "planDate");

-- CreateIndex
CREATE INDEX "TrainingSession_academyId_idx" ON "TrainingSession"("academyId");

-- CreateIndex
CREATE INDEX "TrainingSession_academyId_sessionDate_idx" ON "TrainingSession"("academyId", "sessionDate");

-- CreateIndex
CREATE INDEX "User_academyId_idx" ON "User"("academyId");

-- CreateIndex
CREATE INDEX "User_academyId_role_idx" ON "User"("academyId", "role");

-- AddForeignKey
ALTER TABLE "AcademySettings" ADD CONSTRAINT "AcademySettings_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Swimmer" ADD CONSTRAINT "Swimmer_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwimmingStyle" ADD CONSTRAINT "SwimmingStyle_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingGroup" ADD CONSTRAINT "TrainingGroup_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLane" ADD CONSTRAINT "SessionLane_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLap" ADD CONSTRAINT "SessionLap_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceNote" ADD CONSTRAINT "PerformanceNote_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentSwimmer" ADD CONSTRAINT "ParentSwimmer_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeRunGroup" ADD CONSTRAINT "PracticeRunGroup_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeRunGroupRepeat" ADD CONSTRAINT "PracticeRunGroupRepeat_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeRunResult" ADD CONSTRAINT "PracticeRunResult_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeRunLap" ADD CONSTRAINT "PracticeRunLap_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
