// LanePulse Pro - Session lanes (convenience list)
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import type { SessionLaneDTO, LaneStatus } from "@/lib/types";

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
    laps: (l.laps ?? []).map((lap: any) => ({
      id: lap.id,
      sessionId: lap.sessionId,
      sessionLaneId: lap.sessionLaneId,
      laneNo: lap.laneNo,
      swimmerId: lap.swimmerId,
      lapNo: lap.lapNo,
      lapTimeSeconds: lap.lapTimeSeconds,
      lapTimeText: lap.lapTimeText,
      cumulativeSeconds: lap.cumulativeSeconds,
    })),
  };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await ctx.params;

    const session = await db.trainingSession.findUnique({ where: { id } });
    if (!session) return json({ error: "Session not found" }, 404);

    const lanes = await db.sessionLane.findMany({
      where: { sessionId: id },
      orderBy: { laneNo: "asc" },
      include: {
        swimmer: true,
        laps: { orderBy: { lapNo: "asc" } },
      },
    });

    return json(lanes.map(toLaneDTO));
  } catch (err) {
    return errorResponse(err);
  }
}
