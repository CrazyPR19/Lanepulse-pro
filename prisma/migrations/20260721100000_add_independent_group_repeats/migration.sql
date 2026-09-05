ALTER TABLE "PracticeRunGroup"
ADD COLUMN "currentRepeatNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "totalRepeats" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "repeatStatus" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN "repeatStartTime" TIMESTAMP(3),
ADD COLUMN "repeatEndTime" TIMESTAMP(3),
ADD COLUMN "completedRepeatCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextRepeatReady" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "PracticeRunResult"
ADD COLUMN "groupRepeatId" TEXT,
ADD COLUMN "repeatNo" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "PracticeRunGroupRepeat" (
  "id" TEXT NOT NULL,
  "practiceRunId" TEXT NOT NULL,
  "practiceRunGroupId" TEXT NOT NULL,
  "repeatNo" INTEGER NOT NULL,
  "plannedRepeatCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "actualStartTime" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "savedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PracticeRunGroupRepeat_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PracticeRunGroupRepeat" (
  "id", "practiceRunId", "practiceRunGroupId", "repeatNo",
  "plannedRepeatCount", "status", "actualStartTime", "completedAt",
  "savedAt", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || md5(random()::text || clock_timestamp()::text || grp."id"),
  grp."practiceRunId",
  grp."id",
  COALESCE(run."repeatNo", 1),
  GREATEST(COALESCE(run."repeatCountSnapshot", 1), 1),
  CASE WHEN grp."status" = 'COMPLETED' THEN 'SAVED' ELSE grp."status" END,
  grp."actualStartTime",
  CASE WHEN grp."status" = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,
  CASE WHEN grp."status" = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "PracticeRunGroup" grp
JOIN "PracticeRun" run ON run."id" = grp."practiceRunId";

UPDATE "PracticeRunResult" result
SET "groupRepeatId" = repeat."id",
    "repeatNo" = repeat."repeatNo"
FROM "PracticeRunGroupRepeat" repeat
WHERE repeat."practiceRunGroupId" = result."practiceRunGroupId";

UPDATE "PracticeRunGroup" grp
SET "currentRepeatNo" = repeat."repeatNo",
    "totalRepeats" = repeat."plannedRepeatCount",
    "repeatStatus" = repeat."status",
    "repeatStartTime" = repeat."actualStartTime",
    "repeatEndTime" = repeat."completedAt",
    "completedRepeatCount" = CASE WHEN repeat."status" = 'SAVED' THEN 1 ELSE 0 END,
    "nextRepeatReady" = repeat."status" <> 'SAVED'
FROM "PracticeRunGroupRepeat" repeat
WHERE repeat."practiceRunGroupId" = grp."id";

DROP INDEX "PracticeRunResult_practiceRunGroupId_laneNo_key";

CREATE UNIQUE INDEX "PracticeRunGroupRepeat_practiceRunGroupId_repeatNo_key"
ON "PracticeRunGroupRepeat"("practiceRunGroupId", "repeatNo");
CREATE INDEX "PracticeRunGroupRepeat_practiceRunId_idx" ON "PracticeRunGroupRepeat"("practiceRunId");
CREATE INDEX "PracticeRunGroupRepeat_practiceRunGroupId_idx" ON "PracticeRunGroupRepeat"("practiceRunGroupId");
CREATE INDEX "PracticeRunGroupRepeat_status_idx" ON "PracticeRunGroupRepeat"("status");
CREATE UNIQUE INDEX "PracticeRunResult_practiceRunGroupId_repeatNo_laneNo_key"
ON "PracticeRunResult"("practiceRunGroupId", "repeatNo", "laneNo");
CREATE INDEX "PracticeRunResult_groupRepeatId_idx" ON "PracticeRunResult"("groupRepeatId");

ALTER TABLE "PracticeRunGroupRepeat" ADD CONSTRAINT "PracticeRunGroupRepeat_practiceRunId_fkey"
FOREIGN KEY ("practiceRunId") REFERENCES "PracticeRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeRunGroupRepeat" ADD CONSTRAINT "PracticeRunGroupRepeat_practiceRunGroupId_fkey"
FOREIGN KEY ("practiceRunGroupId") REFERENCES "PracticeRunGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeRunResult" ADD CONSTRAINT "PracticeRunResult_groupRepeatId_fkey"
FOREIGN KEY ("groupRepeatId") REFERENCES "PracticeRunGroupRepeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
