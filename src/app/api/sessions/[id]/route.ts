// LanePulse Pro - Session detail (GET/PATCH/DELETE)
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  audit,
} from "@/lib/api";
import type {
  TrainingSessionDTO,
  SessionLaneDTO,
  SessionLapDTO,
  SessionStatus,
  LaneStatus,
} from "@/lib/types";

function toLapDTO(l: any): SessionLapDTO {
  return {
    id: l.id,
    sessionId: l.sessionId,
    sessionLaneId: l.sessionLaneId,
    laneNo: l.laneNo,
    swimmerId: l.swimmerId,
    lapNo: l.lapNo,
    lapTimeSeconds: l.lapTimeSeconds,
    lapTimeText: l.lapTimeText,
    cumulativeSeconds: l.cumulativeSeconds,
  };
}

function toLaneDTO(l: any): SessionLaneDTO {
  return {
    id: l.id,
    sessionId: l.sessionId,
    laneNo: l.laneNo,
    swimmerId: l.swimmerId,
    swimmerName: l.swimmer?.swimmerName ?? null,
    groupId: l.groupId,
    startTime: l.startTime ? new Date(l.startTime).toISOString() : null,
    stopTime: l.stopTime ? new Date(l.stopTime).toISOString() : null,
    elapsedSeconds: l.elapsedSeconds,
    resultText: l.resultText,
    status: l.status as LaneStatus,
    laps: (l.laps ?? []).map(toLapDTO),
  };
}

function toSessionDetailDTO(s: any): TrainingSessionDTO & {
  lanes: SessionLaneDTO[];
} {
  return {
    id: s.id,
    sessionName: s.sessionName,
    sessionDate: s.sessionDate instanceof Date ? s.sessionDate.toISOString() : s.sessionDate,
    sessionStartTime: s.sessionStartTime ? new Date(s.sessionStartTime).toISOString() : null,
    sessionEndTime: s.sessionEndTime ? new Date(s.sessionEndTime).toISOString() : null,
    styleId: s.styleId,
    styleName: s.style?.styleName,
    distanceMeters: s.distanceMeters,
    groupId: s.groupId,
    groupName: s.group?.groupName ?? null,
    status: s.status,
    remarks: s.remarks,
    createdByUserId: s.createdByUserId,
    createdByName: s.user?.fullName,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
    laneCount: s.lanes?.length ?? s._count?.lanes,
    lanes: (s.lanes ?? []).map(toLaneDTO),
  };
}

async function fetchFullSession(id: string) {
  return db.trainingSession.findUnique({
    where: { id },
    include: {
      style: true,
      group: true,
      user: true,
      lanes: {
        orderBy: { laneNo: "asc" },
        include: {
          swimmer: true,
          laps: { orderBy: { lapNo: "asc" } },
        },
      },
    },
  });
}

// ---------- GET ----------
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await ctx.params;
    const s = await fetchFullSession(id);
    if (!s) return json({ error: "Session not found" }, 404);
    return json(toSessionDetailDTO(s));
  } catch (err) {
    return errorResponse(err);
  }
}

// ---------- PATCH ----------
type PatchBody = {
  sessionName?: string;
  status?: SessionStatus;
  remarks?: string;
  sessionEndTime?: string | null;
  sessionStartTime?: string | null;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id } = await ctx.params;
    const body = await parseBody<PatchBody>(req);

    const existing = await db.trainingSession.findUnique({ where: { id } });
    if (!existing) return json({ error: "Session not found" }, 404);

    const data: any = {};
    if (body.sessionName !== undefined) data.sessionName = body.sessionName;
    if (body.status !== undefined) data.status = body.status;
    if (body.remarks !== undefined) data.remarks = body.remarks;
    if (body.sessionEndTime !== undefined) {
      data.sessionEndTime = body.sessionEndTime ? new Date(body.sessionEndTime) : null;
    }
    if (body.sessionStartTime !== undefined) {
      data.sessionStartTime = body.sessionStartTime ? new Date(body.sessionStartTime) : null;
    }

    if (Object.keys(data).length === 0) {
      return json({ error: "No fields to update" }, 400);
    }

    await db.trainingSession.update({ where: { id }, data });
    const fresh = await fetchFullSession(id);

    await audit(
      session,
      "UPDATE_SESSION",
      "TrainingSession",
      id,
      `Updated session "${existing.sessionName}" fields: ${Object.keys(data).join(", ")}`
    );

    return json(toSessionDetailDTO(fresh));
  } catch (err) {
    return errorResponse(err);
  }
}

// ---------- DELETE ----------
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await ctx.params;
    const body = await parseBody<{ confirm?: string }>(req);
    if (body.confirm !== "DELETE SESSION") {
      return json({ error: "Confirmation required: provide confirm='DELETE SESSION'" }, 400);
    }

    const existing = await db.trainingSession.findUnique({ where: { id } });
    if (!existing) return json({ error: "Session not found" }, 404);

    // Cascade: laps -> lanes -> session.
    // Prisma onDelete Cascade handles laps (via session & sessionLane), and lanes (via session).
    // We still delete explicitly to be safe across the SQLite backend.
    await db.$transaction([
      db.sessionLap.deleteMany({ where: { sessionId: id } }),
      db.sessionLane.deleteMany({ where: { sessionId: id } }),
      db.trainingSession.delete({ where: { id } }),
    ]);

    await audit(
      session,
      "DELETE_SESSION",
      "TrainingSession",
      id,
      `Deleted session "${existing.sessionName}"`
    );

    return json({ ok: true, id });
  } catch (err) {
    return errorResponse(err);
  }
}
