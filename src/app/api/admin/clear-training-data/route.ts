// LanePulse Pro - admin clear training data (SUPER_ADMIN only)
// Deletes everything EXCEPT users and swimming_styles.
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

    // Order matters: delete children before parents.
    const result = await db.$transaction([
      db.sessionLap.deleteMany({}),
      db.sessionLane.deleteMany({}),
      db.performanceNote.deleteMany({}),
      db.trainingSession.deleteMany({}),
      db.groupMember.deleteMany({}),
      db.trainingGroup.deleteMany({}),
      db.swimmer.deleteMany({}),
    ]);

    await audit(
      session,
      "CLEAR_TRAINING_DATA",
      "swimmers",
      null,
      `Cleared all training data (kept users + styles). Rows affected: ${result.reduce(
        (acc, r) => acc + r.count,
        0
      )}`
    );
    return json({
      success: true,
      deleted: {
        sessionLaps: result[0].count,
        sessionLanes: result[1].count,
        performanceNotes: result[2].count,
        trainingSessions: result[3].count,
        groupMembers: result[4].count,
        trainingGroups: result[5].count,
        swimmers: result[6].count,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
