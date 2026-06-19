// LanePulse Pro - admin stats (SUPER_ADMIN only)
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");
    const [
      users,
      swimmers,
      styles,
      groups,
      sessions,
      sessionLanes,
      sessionLaps,
      performanceNotes,
      auditLogs,
    ] = await Promise.all([
      db.user.count(),
      db.swimmer.count(),
      db.swimmingStyle.count(),
      db.trainingGroup.count(),
      db.trainingSession.count(),
      db.sessionLane.count(),
      db.sessionLap.count(),
      db.performanceNote.count(),
      db.auditLog.count(),
    ]);
    return json({
      counts: {
        users,
        swimmers,
        styles,
        groups,
        sessions,
        sessionLanes,
        sessionLaps,
        performanceNotes,
        auditLogs,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
