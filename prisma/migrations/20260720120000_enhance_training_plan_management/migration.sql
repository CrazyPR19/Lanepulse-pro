ALTER TABLE "TrainingPlan"
ADD COLUMN "copiedFromPlanId" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedByUserId" TEXT;

ALTER TABLE "PracticeRun"
ADD COLUMN "planNameSnapshot" TEXT,
ADD COLUMN "setLabelSnapshot" TEXT,
ADD COLUMN "styleNameSnapshot" TEXT,
ADD COLUMN "repeatCountSnapshot" INTEGER,
ADD COLUMN "targetTimeSecondsSnapshot" DOUBLE PRECISION,
ADD COLUMN "restIntervalSecondsSnapshot" INTEGER;

UPDATE "PracticeRun" AS run
SET "planNameSnapshot" = plan."planName"
FROM "TrainingPlan" AS plan
WHERE run."trainingPlanId" = plan."id";

UPDATE "PracticeRun" AS run
SET "setLabelSnapshot" = plan_set."setLabel",
    "repeatCountSnapshot" = plan_set."repeatCount",
    "targetTimeSecondsSnapshot" = plan_set."targetTimeSeconds",
    "restIntervalSecondsSnapshot" = plan_set."restIntervalSeconds"
FROM "TrainingPlanSet" AS plan_set
WHERE run."trainingPlanSetId" = plan_set."id";

UPDATE "PracticeRun" AS run
SET "styleNameSnapshot" = style."styleName"
FROM "SwimmingStyle" AS style
WHERE run."styleId" = style."id";

CREATE INDEX "TrainingPlan_copiedFromPlanId_idx" ON "TrainingPlan"("copiedFromPlanId");
CREATE INDEX "TrainingPlan_isActive_idx" ON "TrainingPlan"("isActive");
CREATE INDEX "TrainingPlan_deletedByUserId_idx" ON "TrainingPlan"("deletedByUserId");

ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_copiedFromPlanId_fkey"
FOREIGN KEY ("copiedFromPlanId") REFERENCES "TrainingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_deletedByUserId_fkey"
FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
