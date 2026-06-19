// LanePulse Pro - swimmer [id] detail + history
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  audit,
} from "@/lib/api";
import { toSwimmerDTO } from "@/app/api/swimmers/route";
import { formatSeconds } from "@/lib/helpers";
import type {
  TrainingSessionDTO,
  Gender,
} from "@/lib/types";
import { NextRequest } from "next/server";

function toSessionDTO(
  s: {
    id: string;
    sessionName: string;
    sessionDate: Date;
    sessionStartTime: Date | null;
    sessionEndTime: Date | null;
    styleId: string;
    distanceMeters: number;
    groupId: string | null;
    status: string;
    remarks: string | null;
    createdByUserId: string;
    createdAt: Date;
    style?: { styleName: string } | null;
    group?: { groupName: string } | null;
    user?: { fullName: string } | null;
    _count?: { lanes: number };
  }
): TrainingSessionDTO {
  return {
    id: s.id,
    sessionName: s.sessionName,
    sessionDate: s.sessionDate.toISOString(),
    sessionStartTime: s.sessionStartTime ? s.sessionStartTime.toISOString() : null,
    sessionEndTime: s.sessionEndTime ? s.sessionEndTime.toISOString() : null,
    styleId: s.styleId,
    styleName: s.style?.styleName,
    distanceMeters: s.distanceMeters,
    groupId: s.groupId,
    groupName: s.group?.groupName ?? null,
    status: s.status as any,
    remarks: s.remarks,
    createdByUserId: s.createdByUserId,
    createdByName: s.user?.fullName,
    createdAt: s.createdAt.toISOString(),
    laneCount: s._count?.lanes,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;

    const swimmer = await db.swimmer.findUnique({ where: { id } });
    if (!swimmer) return json({ error: "Swimmer not found" }, 404);

    // Recent sessions (last 10) where this swimmer has lanes
    const [recentSessionsRaw, totalSessions, lanesRaw] = await Promise.all([
      db.trainingSession.findMany({
        where: { lanes: { some: { swimmerId: id } } },
        orderBy: { sessionDate: "desc" },
        take: 10,
        include: {
          style: true,
          group: true,
          user: true,
          _count: { select: { lanes: true } },
        },
      }),
      db.trainingSession.count({
        where: { lanes: { some: { swimmerId: id } } },
      }),
      db.sessionLane.findMany({
        where: {
          swimmerId: id,
          status: "FINISHED",
          elapsedSeconds: { not: null },
        },
        include: {
          session: { include: { style: true } },
        },
      }),
    ]);

    // Compute best times grouped by (styleId, distanceMeters)
    const bestMap = new Map<
      string,
      {
        styleId: string;
        styleName: string;
        distanceMeters: number;
        bestSeconds: number;
        sessionDate: string;
      }
    >();
    for (const lane of lanesRaw) {
      const styleId = lane.session.styleId;
      const distanceMeters = lane.session.distanceMeters;
      const key = `${styleId}|${distanceMeters}`;
      const seconds = lane.elapsedSeconds!;
      const cur = bestMap.get(key);
      if (!cur || seconds < cur.bestSeconds) {
        bestMap.set(key, {
          styleId,
          styleName: lane.session.style.styleName,
          distanceMeters,
          bestSeconds: seconds,
          sessionDate: lane.session.sessionDate.toISOString(),
        });
      }
    }

    const bestTimes = Array.from(bestMap.values()).map((b) => ({
      ...b,
      bestText: formatSeconds(b.bestSeconds),
    }));

    return json({
      ...toSwimmerDTO(swimmer),
      history: {
        recentSessions: recentSessionsRaw.map(toSessionDTO),
        bestTimes,
        totalSessions,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{
      swimmerName?: string;
      age?: number | null;
      gender?: Gender | null;
      dateOfBirth?: string | null;
      remarks?: string | null;
      activeStatus?: boolean;
    }>(req);

    const existing = await db.swimmer.findUnique({ where: { id } });
    if (!existing) return json({ error: "Swimmer not found" }, 404);

    if (
      body.gender &&
      !["MALE", "FEMALE", "OTHER"].includes(body.gender)
    ) {
      return json({ error: "Invalid gender" }, 400);
    }

    const data: any = {};
    if (body.swimmerName !== undefined) {
      const trimmed = body.swimmerName.trim();
      if (!trimmed) return json({ error: "swimmerName cannot be empty" }, 400);
      data.swimmerName = trimmed;
    }
    if (body.age !== undefined) {
      data.age =
        typeof body.age === "number" && Number.isFinite(body.age)
          ? Math.max(0, Math.floor(body.age))
          : null;
    }
    if (body.gender !== undefined) data.gender = body.gender ?? null;
    if (body.dateOfBirth !== undefined) {
      if (body.dateOfBirth && String(body.dateOfBirth).trim() !== "") {
        const d = new Date(body.dateOfBirth as string);
        if (isNaN(d.getTime())) {
          return json({ error: "Invalid dateOfBirth" }, 400);
        }
        data.dateOfBirth = d;
      } else {
        data.dateOfBirth = null;
      }
    }
    if (body.remarks !== undefined) {
      data.remarks = body.remarks?.trim() || null;
    }
    if (body.activeStatus !== undefined) {
      data.activeStatus = body.activeStatus;
    }

    const updated = await db.swimmer.update({ where: { id }, data });
    await audit(
      session,
      "UPDATE_SWIMMER",
      "swimmers",
      id,
      `Updated swimmer "${updated.swimmerName}"`
    );
    return json(toSwimmerDTO(updated));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{
      permanent?: boolean;
      confirm?: string;
    }>(req);

    const existing = await db.swimmer.findUnique({ where: { id } });
    if (!existing) return json({ error: "Swimmer not found" }, 404);

    if (body.permanent === true && body.confirm === "DELETE SWIMMER") {
      // Hard-delete only if NO session_lanes or session_laps reference this swimmer
      const [laneCount, lapCount] = await Promise.all([
        db.sessionLane.count({ where: { swimmerId: id } }),
        db.sessionLap.count({ where: { swimmerId: id } }),
      ]);
      if (laneCount > 0 || lapCount > 0) {
        return json(
          {
            error: `Cannot permanently delete: swimmer is referenced by ${laneCount} session lane(s) and ${lapCount} session lap(s). Soft-deactivate instead, or remove those references first.`,
          },
          409
        );
      }
      // Also clean up group memberships
      await db.groupMember.deleteMany({ where: { swimmerId: id } });
      await db.performanceNote.deleteMany({ where: { swimmerId: id } });
      await db.swimmer.delete({ where: { id } });
      await audit(
        session,
        "DELETE_SWIMMER",
        "swimmers",
        id,
        `Permanently deleted swimmer "${existing.swimmerName}"`
      );
      return json({ success: true, permanent: true });
    }

    // Soft-delete (deactivate)
    const updated = await db.swimmer.update({
      where: { id },
      data: { activeStatus: false },
    });
    await audit(
      session,
      "DEACTIVATE_SWIMMER",
      "swimmers",
      id,
      `Deactivated swimmer "${existing.swimmerName}"`
    );
    return json(toSwimmerDTO(updated));
  } catch (err) {
    return errorResponse(err);
  }
}
