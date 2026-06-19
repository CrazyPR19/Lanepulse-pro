// LanePulse Pro - Shared types

export type Role = "SUPER_ADMIN" | "COACH" | "VIEWER";

export type Gender = "MALE" | "FEMALE" | "OTHER";

export type SessionStatus = "DRAFT" | "RUNNING" | "COMPLETED" | "ABORTED";

export type LaneStatus = "IDLE" | "READY" | "RUNNING" | "FINISHED" | "DNF";

export type TimerMode = "console" | "finish" | "lap";

export interface UserDTO {
  id: string;
  fullName: string;
  email: string;
  username: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface SwimmerDTO {
  id: string;
  swimmerName: string;
  age: number | null;
  gender: Gender | null;
  dateOfBirth: string | null;
  activeStatus: boolean;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SwimmingStyleDTO {
  id: string;
  styleName: string;
  isActive: boolean;
  sortOrder: number;
}

export interface TrainingGroupDTO {
  id: string;
  groupName: string;
  groupLevel: string | null;
  groupDate: string | null;
  remarks: string | null;
  isActive: boolean;
  createdAt: string;
  memberCount?: number;
}

export interface GroupMemberDTO {
  id: string;
  groupId: string;
  swimmerId: string;
  laneNo: number;
  isActive: boolean;
  swimmerName?: string;
  swimmer?: SwimmerDTO;
}

export interface TrainingSessionDTO {
  id: string;
  sessionName: string;
  sessionDate: string;
  sessionStartTime: string | null;
  sessionEndTime: string | null;
  styleId: string;
  styleName?: string;
  distanceMeters: number;
  groupId: string | null;
  groupName?: string | null;
  status: SessionStatus;
  remarks: string | null;
  createdByUserId: string;
  createdByName?: string;
  createdAt: string;
  laneCount?: number;
}

export interface SessionLaneDTO {
  id: string;
  sessionId: string;
  laneNo: number;
  swimmerId: string | null;
  swimmerName?: string | null;
  groupId: string | null;
  startTime: string | null;
  stopTime: string | null;
  elapsedSeconds: number | null;
  resultText: string | null;
  status: LaneStatus;
  laps?: SessionLapDTO[];
}

export interface SessionLapDTO {
  id: string;
  sessionId: string;
  sessionLaneId: string;
  laneNo: number;
  swimmerId: string | null;
  lapNo: number;
  lapTimeSeconds: number;
  lapTimeText: string;
  cumulativeSeconds: number;
}

export interface PerformanceNoteDTO {
  id: string;
  swimmerId: string | null;
  sessionId: string | null;
  styleId: string | null;
  distanceMeters: number | null;
  recommendationText: string;
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  userId: string | null;
  userName?: string | null;
  action: string;
  tableName: string;
  recordId: string | null;
  details: string | null;
  createdAt: string;
}

// Lane board slot (12 lanes per pool)
export interface LaneSlot {
  laneNo: number; // 1..12
  swimmerId: string | null;
  swimmerName: string | null;
}

// Live timer lane state (frontend)
export interface LiveLaneState {
  laneNo: number;
  swimmerId: string | null;
  swimmerName: string | null;
  status: LaneStatus;
  startedAt: number | null; // epoch ms
  stoppedAt: number | null; // epoch ms
  elapsedMs: number; // snapshot when not running
  lastLapMs: number | null; // lap split duration
  lastLapCumulative: number | null; // cumulative at lap
  laps: { lapNo: number; lapMs: number; cumulativeMs: number }[];
}

// Analysis report types
export interface ImprovementReport {
  swimmerId: string;
  swimmerName: string;
  styleId: string;
  styleName: string;
  distanceMeters: number;
  previousBestSeconds: number | null;
  latestTimeSeconds: number | null;
  improvementSeconds: number | null;
  improvementPercent: number | null;
  status: "IMPROVED" | "SLOWER" | "SAME" | "NOT_ENOUGH_DATA";
  trend: { sessionDate: string; timeSeconds: number }[];
}

export interface CurrentVsPreviousReport {
  swimmerId: string;
  swimmerName: string;
  lastTimeSeconds: number | null;
  previousTimeSeconds: number | null;
  changeSeconds: number | null;
  changePercent: number | null;
  direction: "IMPROVED" | "SLOWER" | "SAME" | "NOT_ENOUGH_DATA";
}

export interface SwimmerVsSwimmerReport {
  swimmerAId: string;
  swimmerAName: string;
  swimmerBId: string;
  swimmerBName: string;
  bestTimeA: number | null;
  bestTimeB: number | null;
  avgTimeA: number | null;
  avgTimeB: number | null;
  latestTimeA: number | null;
  latestTimeB: number | null;
  consistencyA: number | null; // std dev
  consistencyB: number | null;
  lapConsistencyA: number | null;
  lapConsistencyB: number | null;
}

export interface GroupRankingRow {
  rank: number;
  laneNo: number;
  swimmerId: string | null;
  swimmerName: string | null;
  elapsedSeconds: number | null;
  resultText: string | null;
  gapFromFirst: number | null;
  isBest: boolean;
}

export interface LapPerformanceReport {
  swimmerId: string;
  swimmerName: string;
  laps: { lapNo: number; lapTimeSeconds: number; cumulativeSeconds: number }[];
  fastestLap: { lapNo: number; lapTimeSeconds: number } | null;
  slowestLap: { lapNo: number; lapTimeSeconds: number } | null;
  avgLap: number | null;
  dropOffPercent: number | null;
  consistencyScore: number | null;
  enduranceDrop: boolean;
}

export interface RecommendationReport {
  swimmerId: string;
  swimmerName: string;
  styleId: string;
  styleName: string;
  distanceMeters: number;
  whatHappened: string;
  whyItMayHappen: string[];
  whatToTrainNext: string[];
  category: "IMPROVED" | "SLOWER" | "CONSISTENT" | "FAST_START_DROP" | "ENDURANCE_DROP" | "NOT_ENOUGH_DATA";
}
