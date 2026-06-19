// LanePulse Pro - Swimmer vs Swimmer comparison
// Compare only same style + same distance + within date range.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import { min, avg, stddev } from "@/lib/analysis";
import type { SwimmerVsSwimmerReport } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const url = req.nextUrl;
    const a = url.searchParams.get("a");
    const b = url.searchParams.get("b");
    const styleId = url.searchParams.get("styleId");
    const distanceMeters = url.searchParams.get("distanceMeters");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!a || !b || !styleId || !distanceMeters) {
      return json(
        { error: "a, b, styleId and distanceMeters are required" },
        400
      );
    }
    const distance = Number(distanceMeters);

    const swimmerA = await db.swimmer.findUnique({ where: { id: a } });
    const swimmerB = await db.swimmer.findUnique({ where: { id: b } });
    if (!swimmerA || !swimmerB) {
      return json({ error: "Swimmer(s) not found" }, 404);
    }
    const style = await db.swimmingStyle.findUnique({ where: { id: styleId } });
    if (!style) return json({ error: "Style not found" }, 404);

    const sessionWhere: any = {
      styleId,
      distanceMeters: distance,
    };
    if (from || to) {
      sessionWhere.sessionDate = {};
      if (from) sessionWhere.sessionDate.gte = new Date(from);
      if (to) sessionWhere.sessionDate.lte = new Date(to);
    }

    async function gather(swimmerId: string) {
      const lanes = await db.sessionLane.findMany({
        where: {
          swimmerId,
          status: "FINISHED",
          elapsedSeconds: { not: null },
          session: sessionWhere,
        },
        include: { session: true, laps: { orderBy: { lapNo: "asc" } } },
        orderBy: { session: { sessionDate: "desc" } },
      });

      if (lanes.length === 0) {
        return {
          bestTime: null as number | null,
          avgTime: null as number | null,
          latestTime: null as number | null,
          consistency: null as number | null,
          lapConsistency: null as number | null,
        };
      }

      const times = lanes.map((l) => l.elapsedSeconds as number);
      const bestTime = min(times);
      const avgTime = avg(times);
      const latestTime = times[0]; // lanes ordered by sessionDate DESC
      const consistency = stddev(times);

      // lapConsistency: average of per-session lap stddevs
      const perSessionLapStddevs: number[] = [];
      for (const l of lanes) {
        if (l.laps.length > 1) {
          const sd = stddev(l.laps.map((p) => p.lapTimeSeconds));
          if (sd !== null) perSessionLapStddevs.push(sd);
        }
      }
      const lapConsistency =
        perSessionLapStddevs.length > 0 ? avg(perSessionLapStddevs) : null;

      return { bestTime, avgTime, latestTime, consistency, lapConsistency };
    }

    const [aStats, bStats] = await Promise.all([gather(a), gather(b)]);

    const report: SwimmerVsSwimmerReport = {
      swimmerAId: a,
      swimmerAName: swimmerA.swimmerName,
      swimmerBId: b,
      swimmerBName: swimmerB.swimmerName,
      bestTimeA: aStats.bestTime,
      bestTimeB: bStats.bestTime,
      avgTimeA: aStats.avgTime,
      avgTimeB: bStats.avgTime,
      latestTimeA: aStats.latestTime,
      latestTimeB: bStats.latestTime,
      consistencyA: aStats.consistency,
      consistencyB: bStats.consistency,
      lapConsistencyA: aStats.lapConsistency,
      lapConsistencyB: bStats.lapConsistency,
    };
    return json(report);
  } catch (err) {
    return errorResponse(err);
  }
}
