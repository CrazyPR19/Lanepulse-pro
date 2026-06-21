-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Swimmer" (
    "id" TEXT NOT NULL,
    "swimmerName" TEXT NOT NULL,
    "age" INTEGER,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "activeStatus" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Swimmer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwimmingStyle" (
    "id" TEXT NOT NULL,
    "styleName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SwimmingStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingGroup" (
    "id" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "groupLevel" TEXT,
    "groupDate" TIMESTAMP(3),
    "remarks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "swimmerId" TEXT NOT NULL,
    "laneNo" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" TEXT NOT NULL,
    "sessionName" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionStartTime" TIMESTAMP(3),
    "sessionEndTime" TIMESTAMP(3),
    "styleId" TEXT NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "groupId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "remarks" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLane" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "laneNo" INTEGER NOT NULL,
    "swimmerId" TEXT,
    "groupId" TEXT,
    "startTime" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "elapsedSeconds" DOUBLE PRECISION,
    "resultText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLane_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLap" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sessionLaneId" TEXT NOT NULL,
    "laneNo" INTEGER NOT NULL,
    "swimmerId" TEXT,
    "lapNo" INTEGER NOT NULL,
    "lapTimeSeconds" DOUBLE PRECISION NOT NULL,
    "lapTimeText" TEXT NOT NULL,
    "cumulativeSeconds" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceNote" (
    "id" TEXT NOT NULL,
    "swimmerId" TEXT,
    "sessionId" TEXT,
    "styleId" TEXT,
    "distanceMeters" INTEGER,
    "recommendationText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "PerformanceNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentSwimmer" (
    "id" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "swimmerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentSwimmer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "SwimmingStyle_styleName_key" ON "SwimmingStyle"("styleName");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_idx" ON "GroupMember"("groupId");

-- CreateIndex
CREATE INDEX "GroupMember_swimmerId_idx" ON "GroupMember"("swimmerId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_laneNo_isActive_key" ON "GroupMember"("groupId", "laneNo", "isActive");

-- CreateIndex
CREATE INDEX "TrainingSession_groupId_idx" ON "TrainingSession"("groupId");

-- CreateIndex
CREATE INDEX "TrainingSession_styleId_idx" ON "TrainingSession"("styleId");

-- CreateIndex
CREATE INDEX "TrainingSession_sessionDate_idx" ON "TrainingSession"("sessionDate");

-- CreateIndex
CREATE INDEX "SessionLane_sessionId_idx" ON "SessionLane"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionLane_sessionId_laneNo_key" ON "SessionLane"("sessionId", "laneNo");

-- CreateIndex
CREATE INDEX "SessionLap_sessionId_idx" ON "SessionLap"("sessionId");

-- CreateIndex
CREATE INDEX "SessionLap_sessionLaneId_idx" ON "SessionLap"("sessionLaneId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionLap_sessionLaneId_lapNo_key" ON "SessionLap"("sessionLaneId", "lapNo");

-- CreateIndex
CREATE INDEX "PerformanceNote_swimmerId_idx" ON "PerformanceNote"("swimmerId");

-- CreateIndex
CREATE INDEX "PerformanceNote_sessionId_idx" ON "PerformanceNote"("sessionId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_tableName_idx" ON "AuditLog"("tableName");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppConfig_key_key" ON "AppConfig"("key");

-- CreateIndex
CREATE INDEX "ParentSwimmer_parentUserId_idx" ON "ParentSwimmer"("parentUserId");

-- CreateIndex
CREATE INDEX "ParentSwimmer_swimmerId_idx" ON "ParentSwimmer"("swimmerId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentSwimmer_parentUserId_swimmerId_key" ON "ParentSwimmer"("parentUserId", "swimmerId");

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TrainingGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_swimmerId_fkey" FOREIGN KEY ("swimmerId") REFERENCES "Swimmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "SwimmingStyle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TrainingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLane" ADD CONSTRAINT "SessionLane_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLane" ADD CONSTRAINT "SessionLane_swimmerId_fkey" FOREIGN KEY ("swimmerId") REFERENCES "Swimmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLap" ADD CONSTRAINT "SessionLap_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLap" ADD CONSTRAINT "SessionLap_sessionLaneId_fkey" FOREIGN KEY ("sessionLaneId") REFERENCES "SessionLane"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLap" ADD CONSTRAINT "SessionLap_swimmerId_fkey" FOREIGN KEY ("swimmerId") REFERENCES "Swimmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceNote" ADD CONSTRAINT "PerformanceNote_swimmerId_fkey" FOREIGN KEY ("swimmerId") REFERENCES "Swimmer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceNote" ADD CONSTRAINT "PerformanceNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceNote" ADD CONSTRAINT "PerformanceNote_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "SwimmingStyle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceNote" ADD CONSTRAINT "PerformanceNote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentSwimmer" ADD CONSTRAINT "ParentSwimmer_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentSwimmer" ADD CONSTRAINT "ParentSwimmer_swimmerId_fkey" FOREIGN KEY ("swimmerId") REFERENCES "Swimmer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
