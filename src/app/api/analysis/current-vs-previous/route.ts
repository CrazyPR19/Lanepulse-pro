// LanePulse Pro - Current vs Previous report (per swimmer within filters)
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import { changeBucket } from "@/lib/analysis";
import type { CurrentVsPreviousReport } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl;
    const groupId = url.searchParams.get("groupId") || undefined;
    const styleId = url.searchParams.get("styleId") || undefined;
    const distanceMeters = url.searchParams.get("distanceMeters");

    // Base filter on session_lanes joined to sessions
    const sessionWhere: any = {};
    if (groupId) sessionWhere.groupId = groupId;
    if (styleId) sessionWhere.styleId = styleId;
    if (distanceMeters) sessionWhere.distanceMeters = Number(distanceMeters);

    // Find every swimmer who has at least one FINISHED lane matching the filters
    const lanes = await db.sessionLane.findMany({
      where: {
        status: "FINISHED",
        elapsedSeconds: { not: null },
        swimmerId: { not: null },
        session: sessionWhere,
      },
      include: { session: true, swimmer: true },
    });

    // Group by swimmerId
    const bySwimmer = new Map<string, { name: string; rows: { date: number; time: number }[] }>();
    for (const l of lanes) {
      const sid = l.swimmerId as string;
      if (!bySwimmer.has(sid)) {
        bySwimmer.set(sid, {
          name: l.swimmer?.swimmerName ?? "Unknown",
          rows: [],
        });
      }
      bySwimmer.get(sid)!.rows.push({
        date: new Date(l.session.sessionDate).getTime(),
        time: l.elapsedSeconds as number,
      });
    }

    const reports: CurrentVsPreviousReport[] = [];
    for (const [swimmerId, info] of bySwimmer.entries()) {
      // Order by sessionDate DESC, take last 2
      const sorted = info.rows.sort((a, b) => b.date - a.date);
      const last = sorted[0]?.time ?? null;
      const previous = sorted[1]?.time ?? null;

      const { changeSeconds, changePercent, direction } = changeBucket(last, previous);

      reports.push({
        swimmerId,
        swimmerName: info.name,
        lastTimeSeconds: last,
        previousTimeSeconds: previous,
        changeSeconds,
        changePercent,
        direction,
      });
    }

    // Sort by name for stable output
    reports.sort((a, b) => a.swimmerName.localeCompare(b.swimmerName));

    return json(reports);
  } catch (err) {
    return errorResponse(err);
  }
}
