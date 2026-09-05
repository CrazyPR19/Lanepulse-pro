CREATE TABLE "TrainingPlan" (
 "id" TEXT NOT NULL, "planDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "planName" TEXT NOT NULL, "createdByUserId" TEXT NOT NULL, "remarks" TEXT,
 "status" TEXT NOT NULL DEFAULT 'DRAFT', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TrainingPlanSet" (
 "id" TEXT NOT NULL, "planId" TEXT NOT NULL, "sequenceNo" INTEGER NOT NULL,
 "distanceMeters" INTEGER NOT NULL, "repeatCount" INTEGER NOT NULL, "swimmingStyleId" TEXT NOT NULL,
 "setLabel" TEXT NOT NULL, "targetTimeSeconds" DOUBLE PRECISION, "restIntervalSeconds" INTEGER,
 "notes" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "TrainingPlanSet_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PracticeRun" (
 "id" TEXT NOT NULL, "trainingPlanId" TEXT, "trainingPlanSetId" TEXT,
 "sessionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "styleId" TEXT NOT NULL,
 "distanceMeters" INTEGER NOT NULL, "repeatNo" INTEGER, "status" TEXT NOT NULL DEFAULT 'DRAFT',
 "createdByUserId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PracticeRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PracticeRunGroup" (
 "id" TEXT NOT NULL, "practiceRunId" TEXT NOT NULL, "groupId" TEXT,
 "groupNameSnapshot" TEXT NOT NULL, "plannedStartOffsetSeconds" INTEGER NOT NULL DEFAULT 0,
 "actualStartTime" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'READY',
 CONSTRAINT "PracticeRunGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PracticeRunResult" (
 "id" TEXT NOT NULL, "practiceRunId" TEXT NOT NULL, "practiceRunGroupId" TEXT NOT NULL,
 "swimmerId" TEXT, "swimmerNameSnapshot" TEXT NOT NULL, "laneNo" INTEGER NOT NULL,
 "startTime" TIMESTAMP(3), "finishTime" TIMESTAMP(3), "elapsedSeconds" DOUBLE PRECISION,
 "resultText" TEXT, "status" TEXT NOT NULL DEFAULT 'READY',
 CONSTRAINT "PracticeRunResult_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PracticeRunLap" (
 "id" TEXT NOT NULL, "practiceRunId" TEXT NOT NULL, "practiceRunResultId" TEXT NOT NULL,
 "lapNo" INTEGER NOT NULL, "lapTimeSeconds" DOUBLE PRECISION NOT NULL,
 "cumulativeSeconds" DOUBLE PRECISION NOT NULL, "lapTimeText" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PracticeRunLap_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrainingPlan_planDate_idx" ON "TrainingPlan"("planDate");
CREATE INDEX "TrainingPlan_createdByUserId_idx" ON "TrainingPlan"("createdByUserId");
CREATE INDEX "TrainingPlan_status_idx" ON "TrainingPlan"("status");
CREATE UNIQUE INDEX "TrainingPlanSet_planId_sequenceNo_key" ON "TrainingPlanSet"("planId", "sequenceNo");
CREATE INDEX "TrainingPlanSet_planId_idx" ON "TrainingPlanSet"("planId");
CREATE INDEX "TrainingPlanSet_swimmingStyleId_idx" ON "TrainingPlanSet"("swimmingStyleId");
CREATE INDEX "PracticeRun_trainingPlanId_idx" ON "PracticeRun"("trainingPlanId");
CREATE INDEX "PracticeRun_trainingPlanSetId_idx" ON "PracticeRun"("trainingPlanSetId");
CREATE INDEX "PracticeRun_sessionDate_idx" ON "PracticeRun"("sessionDate");
CREATE INDEX "PracticeRun_styleId_distanceMeters_idx" ON "PracticeRun"("styleId", "distanceMeters");
CREATE INDEX "PracticeRunGroup_practiceRunId_idx" ON "PracticeRunGroup"("practiceRunId");
CREATE INDEX "PracticeRunGroup_groupId_idx" ON "PracticeRunGroup"("groupId");
CREATE UNIQUE INDEX "PracticeRunResult_practiceRunGroupId_laneNo_key" ON "PracticeRunResult"("practiceRunGroupId", "laneNo");
CREATE INDEX "PracticeRunResult_practiceRunId_idx" ON "PracticeRunResult"("practiceRunId");
CREATE INDEX "PracticeRunResult_swimmerId_idx" ON "PracticeRunResult"("swimmerId");
CREATE UNIQUE INDEX "PracticeRunLap_practiceRunResultId_lapNo_key" ON "PracticeRunLap"("practiceRunResultId", "lapNo");
CREATE INDEX "PracticeRunLap_practiceRunId_idx" ON "PracticeRunLap"("practiceRunId");
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingPlanSet" ADD CONSTRAINT "TrainingPlanSet_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPlanSet" ADD CONSTRAINT "TrainingPlanSet_swimmingStyleId_fkey" FOREIGN KEY ("swimmingStyleId") REFERENCES "SwimmingStyle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_trainingPlanId_fkey" FOREIGN KEY ("trainingPlanId") REFERENCES "TrainingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_trainingPlanSetId_fkey" FOREIGN KEY ("trainingPlanSetId") REFERENCES "TrainingPlanSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "SwimmingStyle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PracticeRunGroup" ADD CONSTRAINT "PracticeRunGroup_practiceRunId_fkey" FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeRunGroup" ADD CONSTRAINT "PracticeRunGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TrainingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PracticeRunResult" ADD CONSTRAINT "PracticeRunResult_practiceRunId_fkey" FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeRunResult" ADD CONSTRAINT "PracticeRunResult_practiceRunGroupId_fkey" FOREIGN KEY ("practiceRunGroupId") REFERENCES "PracticeRunGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeRunResult" ADD CONSTRAINT "PracticeRunResult_swimmerId_fkey" FOREIGN KEY ("swimmerId") REFERENCES "Swimmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PracticeRunLap" ADD CONSTRAINT "PracticeRunLap_practiceRunId_fkey" FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeRunLap" ADD CONSTRAINT "PracticeRunLap_practiceRunResultId_fkey" FOREIGN KEY ("practiceRunResultId") REFERENCES "PracticeRunResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
