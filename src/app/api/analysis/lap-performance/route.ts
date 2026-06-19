// LanePulse Pro - Lap performance report
// Mode 1: ?sessionId=  -> aggregate all laps across all lanes in that session, grouped by lapNo
// Mode 2: ?swimmerId=&styleId=&distanceMeters= -> aggregate laps across matching sessions for this swimmer
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import { computeLapPerformance, avg } from "@/lib/analysis";
import type { LapPerformanceReport } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl;
    const sessionId = url.searchParams.get("sessionId");
    const swimmerId = url.searchParams.get("swimmerId");
    const styleId = url.searchParams.get("styleId");
    const distanceMeters = url.searchParams.get("distanceMeters");

    if (sessionId) {
      // ---------- Session aggregate mode ----------
      const session = await db.trainingSession.findUnique({
        where: { id: sessionId },
        include: { style: true },
      });
      if (!session) return json({ error: "Session not found" }, 404);

      const laps = await db.sessionLap.findMany({
        where: { sessionId },
        orderBy: [{ laneNo: "asc" }, { lapNo: "asc" }],
      });

      // Group by lapNo, average lapTimeSeconds
      const byLap = new Map<number, { times: number[]; cumulative: number[] }>();
      for (const l of laps) {
        if (!byLap.has(l.lapNo)) {
          byLap.set(l.lapNo, { times: [], cumulative: [] });
        }
        byLap.get(l.lapNo)!.times.push(l.lapTimeSeconds);
        byLap.get(l.lapNo)!.cumulative.push(l.cumulativeSeconds);
      }

      const aggregated = Array.from(byLap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([lapNo, info]) => ({
          lapNo,
          lapTimeSeconds: avg(info.times) ?? 0,
          cumulativeSeconds: avg(info.cumulative) ?? 0,
        }));

      const perf = computeLapPerformance(aggregated);
      const report: LapPerformanceReport = {
        swimmerId: "session-aggregate",
        swimmerName: "Session Aggregate",
        laps: aggregated,
        ...perf,
      };
      return json(report);
    }

    // ---------- Swimmer aggregate across sessions ----------
    if (!swimmerId || !styleId || !distanceMeters) {
      return json(
        {
          error:
            "Provide either sessionId, OR (swimmerId + styleId + distanceMeters)",
        },
        400
      );
    }
    const distance = Number(distanceMeters);

    const swimmer = await db.swimmer.findUnique({ where: { id: swimmerId } });
    if (!swimmer) return json({ error: "Swimmer not found" }, 404);
    const style = await db.swimmingStyle.findUnique({ where: { id: styleId } });
    if (!style) return json({ error: "Style not found" }, 404);

    const laps = await db.sessionLap.findMany({
      where: {
        swimmerId,
        session: { styleId, distanceMeters: distance },
      },
      orderBy: [{ lapNo: "asc" }],
    });

    const byLap = new Map<number, { times: number[]; cumulative: number[] }>();
    for (const l of laps) {
      if (!byLap.has(l.lapNo)) {
        byLap.set(l.lapNo, { times: [], cumulative: [] });
      }
      byLap.get(l.lapNo)!.times.push(l.lapTimeSeconds);
      byLap.get(l.lapNo)!.cumulative.push(l.cumulativeSeconds);
    }

    const aggregated = Array.from(byLap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([lapNo, info]) => ({
        lapNo,
        lapTimeSeconds: avg(info.times) ?? 0,
        cumulativeSeconds: avg(info.cumulative) ?? 0,
      }));

    const perf = computeLapPerformance(aggregated);
    const report: LapPerformanceReport = {
      swimmerId,
      swimmerName: swimmer.swimmerName,
      laps: aggregated,
      ...perf,
    };
    return json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
