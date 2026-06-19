// LanePulse Pro - Group ranking within a session
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import type { GroupRankingRow } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl;
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return json({ error: "sessionId is required" }, 400);
    }

    const session = await db.trainingSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return json({ error: "Session not found" }, 404);

    const lanes = await db.sessionLane.findMany({
      where: {
        sessionId,
        status: "FINISHED",
        elapsedSeconds: { not: null },
      },
      include: { swimmer: true },
      orderBy: { elapsedSeconds: "asc" },
    });

    if (lanes.length === 0) {
      return json([]);
    }

    const first = lanes[0].elapsedSeconds as number;
    const rows: GroupRankingRow[] = lanes.map((l, idx) => {
      const elapsed = l.elapsedSeconds as number;
      return {
        rank: idx + 1,
        laneNo: l.laneNo,
        swimmerId: l.swimmerId,
        swimmerName: l.swimmer?.swimmerName ?? null,
        elapsedSeconds: elapsed,
        resultText: l.resultText,
        gapFromFirst: elapsed - first,
        isBest: idx === 0,
      };
    });

    return json(rows);
  } catch (err) {
    return errorResponse(err);
  }
}
