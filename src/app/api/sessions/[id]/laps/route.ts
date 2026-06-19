// LanePulse Pro - Session laps (list, ordered by laneNo then lapNo)
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import type { SessionLapDTO } from "@/lib/types";

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

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await ctx.params;

    const session = await db.trainingSession.findUnique({ where: { id } });
    if (!session) return json({ error: "Session not found" }, 404);

    const laps = await db.sessionLap.findMany({
      where: { sessionId: id },
      orderBy: [{ laneNo: "asc" }, { lapNo: "asc" }],
    });

    return json(laps.map(toLapDTO));
  } catch (err) {
    return errorResponse(err);
  }
}
