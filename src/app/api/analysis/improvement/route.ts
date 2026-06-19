// LanePulse Pro - Improvement report
// Compare only same swimmer + same style + same distance.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import { improvementBucket } from "@/lib/analysis";
import type { ImprovementReport } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl;
    const swimmerId = url.searchParams.get("swimmerId");
    const styleId = url.searchParams.get("styleId");
    const distanceMeters = url.searchParams.get("distanceMeters");

    if (!swimmerId || !styleId || !distanceMeters) {
      return json(
        { error: "swimmerId, styleId and distanceMeters are required" },
        400
      );
    }
    const distance = Number(distanceMeters);

    const swimmer = await db.swimmer.findUnique({ where: { id: swimmerId } });
    if (!swimmer) return json({ error: "Swimmer not found" }, 404);
    const style = await db.swimmingStyle.findUnique({ where: { id: styleId } });
    if (!style) return json({ error: "Style not found" }, 404);

    // Find all FINISHED session_lanes for this swimmer+style+distance.
    const lanes = await db.sessionLane.findMany({
      where: {
        swimmerId,
        status: "FINISHED",
        elapsedSeconds: { not: null },
        session: {
          styleId,
          distanceMeters: distance,
        },
      },
      include: { session: true },
      orderBy: { session: { sessionDate: "asc" } },
    });

    if (lanes.length === 0) {
      const report: ImprovementReport = {
        swimmerId,
        swimmerName: swimmer.swimmerName,
        styleId,
        styleName: style.styleName,
        distanceMeters: distance,
        previousBestSeconds: null,
        latestTimeSeconds: null,
        improvementSeconds: null,
        improvementPercent: null,
        status: "NOT_ENOUGH_DATA",
        trend: [],
      };
      return json(report);
    }

    // Sort by sessionDate ascending (already, but defensive)
    const sorted = [...lanes].sort(
      (a, b) =>
        new Date(a.session.sessionDate).getTime() -
        new Date(b.session.sessionDate).getTime()
    );

    const trend = sorted.map((l) => ({
      sessionDate: new Date(l.session.sessionDate).toISOString(),
      timeSeconds: l.elapsedSeconds as number,
    }));

    const latest = sorted[sorted.length - 1];
    const latestTimeSeconds = latest.elapsedSeconds as number;

    // previousBest = min of all except the latest session's lane time
    const previousLanes = sorted.slice(0, -1);
    const previousBestSeconds =
      previousLanes.length > 0
        ? Math.min(...previousLanes.map((l) => l.elapsedSeconds as number))
        : null;

    const { improvementSeconds, improvementPercent, status } = improvementBucket(
      previousBestSeconds,
      latestTimeSeconds
    );

    const report: ImprovementReport = {
      swimmerId,
      swimmerName: swimmer.swimmerName,
      styleId,
      styleName: style.styleName,
      distanceMeters: distance,
      previousBestSeconds,
      latestTimeSeconds,
      improvementSeconds,
      improvementPercent,
      status,
      trend,
    };
    return json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
