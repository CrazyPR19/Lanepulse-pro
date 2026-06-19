// LanePulse Pro - Sessions CRUD (list + create with lanes/laps)
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  requireFields,
  audit,
} from "@/lib/api";
import { formatSeconds } from "@/lib/helpers";
import type { TrainingSessionDTO } from "@/lib/types";

// ---------- helpers ----------

function toSessionDTO(s: any): TrainingSessionDTO {
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
    laneCount: s._count?.lanes,
  };
}

// ---------- GET /api/sessions ----------
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const swimmerId = url.searchParams.get("swimmerId");
    const groupId = url.searchParams.get("groupId");
    const styleId = url.searchParams.get("styleId");
    const distance = url.searchParams.get("distance");
    const status = url.searchParams.get("status");

    const where: any = {};
    if (from) where.sessionDate = { ...(where.sessionDate || {}), gte: new Date(from) };
    if (to) where.sessionDate = { ...(where.sessionDate || {}), lte: new Date(to) };
    if (groupId) where.groupId = groupId;
    if (styleId) where.styleId = styleId;
    if (distance) where.distanceMeters = Number(distance);
    if (status) where.status = status;
    if (swimmerId) {
      where.lanes = { some: { swimmerId } };
    }

    const sessions = await db.trainingSession.findMany({
      where,
      orderBy: { sessionDate: "desc" },
      include: {
        style: true,
        group: true,
        user: true,
        _count: { select: { lanes: true } },
      },
    });

    return json(sessions.map(toSessionDTO));
  } catch (err) {
    return errorResponse(err);
  }
}

// ---------- POST /api/sessions ----------
type LapInput = {
  lapNo: number;
  lapTimeSeconds: number;
  lapTimeText?: string;
  cumulativeSeconds: number;
};

type LaneInput = {
  laneNo: number;
  swimmerId?: string | null;
  groupId?: string | null;
  startTime?: string | null;
  stopTime?: string | null;
  elapsedSeconds?: number | null;
  resultText?: string | null;
  status?: "IDLE" | "READY" | "RUNNING" | "FINISHED" | "DNF";
  laps?: LapInput[];
};

type CreateBody = {
  sessionName: string;
  sessionDate?: string;
  styleId: string;
  distanceMeters: number;
  groupId?: string | null;
  remarks?: string;
  status?: "DRAFT" | "RUNNING" | "COMPLETED" | "ABORTED";
  sessionStartTime?: string | null;
  sessionEndTime?: string | null;
  lanes?: LaneInput[];
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const body = await parseBody<CreateBody>(req);
    const fieldErr = requireFields(body as any, [
      "sessionName",
      "styleId",
      "distanceMeters",
    ]);
    if (fieldErr) return json({ error: fieldErr }, 400);

    // Validate styleId exists
    const style = await db.swimmingStyle.findUnique({ where: { id: body.styleId } });
    if (!style) return json({ error: "Style not found" }, 400);
    if (body.groupId) {
      const g = await db.trainingGroup.findUnique({ where: { id: body.groupId } });
      if (!g) return json({ error: "Group not found" }, 400);
    }
    if (body.distanceMeters <= 0) {
      return json({ error: "distanceMeters must be positive" }, 400);
    }

    // Validate lanes & laneNos
    const lanes = body.lanes ?? [];
    const seenLaneNos = new Set<number>();
    for (const lane of lanes) {
      if (!Number.isInteger(lane.laneNo) || lane.laneNo < 1 || lane.laneNo > 12) {
        return json({ error: `Invalid laneNo: ${lane.laneNo} (must be 1..12)` }, 400);
      }
      if (seenLaneNos.has(lane.laneNo)) {
        return json({ error: `Duplicate laneNo: ${lane.laneNo}` }, 400);
      }
      seenLaneNos.add(lane.laneNo);
      if (lane.swimmerId) {
        const sw = await db.swimmer.findUnique({ where: { id: lane.swimmerId } });
        if (!sw) return json({ error: `Swimmer not found: ${lane.swimmerId}` }, 400);
      }
    }

    const status = body.status ?? "DRAFT";
    const sessionDate = body.sessionDate ? new Date(body.sessionDate) : new Date();

    // Create everything in a transaction
    const created = await db.$transaction(async (tx) => {
      const s = await tx.trainingSession.create({
        data: {
          sessionName: body.sessionName,
          sessionDate,
          sessionStartTime: body.sessionStartTime ? new Date(body.sessionStartTime) : null,
          sessionEndTime: body.sessionEndTime ? new Date(body.sessionEndTime) : null,
          styleId: body.styleId,
          distanceMeters: Number(body.distanceMeters),
          groupId: body.groupId ?? null,
          status,
          remarks: body.remarks ?? null,
          createdByUserId: session.userId,
        },
        include: {
          style: true,
          group: true,
          user: true,
          _count: { select: { lanes: true } },
        },
      });

      // Create lanes (only those provided)
      for (const lane of lanes) {
        const laneStatus = lane.status ?? "IDLE";
        const elapsed =
          lane.elapsedSeconds !== undefined && lane.elapsedSeconds !== null
            ? Number(lane.elapsedSeconds)
            : null;
        const resultText =
          lane.resultText ??
          (elapsed !== null ? formatSeconds(elapsed) : null);
        const createdLane = await tx.sessionLane.create({
          data: {
            sessionId: s.id,
            laneNo: lane.laneNo,
            swimmerId: lane.swimmerId ?? null,
            groupId: lane.groupId ?? null,
            startTime: lane.startTime ? new Date(lane.startTime) : null,
            stopTime: lane.stopTime ? new Date(lane.stopTime) : null,
            elapsedSeconds: elapsed,
            resultText,
            status: laneStatus,
          },
        });

        // Create laps for this lane
        if (lane.laps && lane.laps.length > 0) {
          for (const lap of lane.laps) {
            const lapTimeSeconds = Number(lap.lapTimeSeconds);
            await tx.sessionLap.create({
              data: {
                sessionId: s.id,
                sessionLaneId: createdLane.id,
                laneNo: lane.laneNo,
                swimmerId: lane.swimmerId ?? null,
                lapNo: lap.lapNo,
                lapTimeSeconds,
                lapTimeText: lap.lapTimeText ?? formatSeconds(lapTimeSeconds),
                cumulativeSeconds: Number(lap.cumulativeSeconds),
              },
            });
          }
        }
      }

      return s;
    });

    // Re-fetch with lanes+laps for the response
    const full = await db.trainingSession.findUnique({
      where: { id: created.id },
      include: {
        style: true,
        group: true,
        user: true,
        _count: { select: { lanes: true } },
        lanes: {
          orderBy: { laneNo: "asc" },
          include: {
            swimmer: true,
            laps: { orderBy: { lapNo: "asc" } },
          },
        },
      },
    });

    await audit(
      session,
      lanes.length > 0 ? "SAVE_SESSION" : "CREATE_SESSION",
      "TrainingSession",
      created.id,
      `Created session "${body.sessionName}" with ${lanes.length} lane(s)`
    );

    return json(toSessionDTO(full), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
