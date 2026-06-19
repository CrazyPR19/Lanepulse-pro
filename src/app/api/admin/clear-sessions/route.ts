// LanePulse Pro - admin clear sessions (SUPER_ADMIN only)
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { json, errorResponse, parseBody, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const body = await parseBody<{ confirm?: string }>(req);
    if (body.confirm !== "CLEAR DATA") {
      return json(
        { error: "Confirmation required: confirm must equal 'CLEAR DATA'" },
        400
      );
    }

    // Cascade order: laps → lanes → sessions (laps and lanes cascade on session delete,
    // but we delete explicitly to be safe and to get accurate counts).
    const [laps, lanes, sessions] = await db.$transaction([
      db.sessionLap.deleteMany({}),
      db.sessionLane.deleteMany({}),
      db.trainingSession.deleteMany({}),
    ]);

    await audit(
      session,
      "CLEAR_SESSIONS",
      "training_sessions",
      null,
      `Cleared all training data: ${sessions.count} session(s), ${lanes.count} lane(s), ${laps.count} lap(s)`
    );
    return json({
      success: true,
      deleted: {
        sessions: sessions.count,
        sessionLanes: lanes.count,
        sessionLaps: laps.count,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
