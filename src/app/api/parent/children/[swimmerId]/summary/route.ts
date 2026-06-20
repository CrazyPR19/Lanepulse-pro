// LanePulse Pro - Parent Portal: full child summary
// GET  /api/parent/children/[swimmerId]/summary
// Returns a parent-friendly summary of one child's progress.
// SECURITY: the authenticated parent MUST have an active ParentSwimmer
// mapping for this swimmerId — otherwise 403 Forbidden.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import { formatSeconds } from "@/lib/helpers";
import { avg, min, max, changeBucket } from "@/lib/analysis";
import type { ParentChildSummaryDTO, Gender } from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ swimmerId: string }> }
) {
  try {
    const session = await requireRole("PARENT");
    const { swimmerId } = await params;

    // SECURITY: verify the parent has an active mapping for this swimmer.
    const mapping = await db.parentSwimmer.findFirst({
      where: {
        parentUserId: session.userId,
        swimmerId,
        isActive: true,
      },
    });
    if (!mapping) {
      return json({ error: "No access to this swimmer" }, 403);
    }

    const swimmer = await db.swimmer.findUnique({ where: { id: swimmerId } });
    if (!swimmer) {
      return json({ error: "Swimmer not found" }, 404);
    }

    // --------------------------------------------------------------
    // QUERY A: all FINISHED lanes for this swimmer (with style + laps)
    // ordered by sessionDate ASC — single source for most computations.
    // --------------------------------------------------------------
    const finishedLanes = await db.sessionLane.findMany({
      where: {
        swimmerId,
        status: "FINISHED",
        elapsedSeconds: { not: null },
      },
      include: {
        session: { include: { style: true } },
        laps: { orderBy: { lapNo: "asc" } },
      },
      orderBy: { session: { sessionDate: "asc" } },
    });

    // --------------------------------------------------------------
    // QUERY B: all lanes (any status) for last5Sessions.
    // --------------------------------------------------------------
    const allLanes = await db.sessionLane.findMany({
      where: { swimmerId },
      include: { session: { include: { style: true } } },
      orderBy: { session: { sessionDate: "desc" } },
    });

    // --------------------------------------------------------------
    // totalSessions — count of FINISHED lanes for this swimmer.
    // --------------------------------------------------------------
    const totalSessions = finishedLanes.length;

    // --------------------------------------------------------------
    // latestSession — most recent FINISHED lane (last in ASC order).
    // --------------------------------------------------------------
    let latestSession:
      | ParentChildSummaryDTO["latestSession"]
      | null = null;
    if (finishedLanes.length > 0) {
      const l = finishedLanes[finishedLanes.length - 1];
      latestSession = {
        sessionName: l.session.sessionName,
        sessionDate: l.session.sessionDate.toISOString(),
        styleName: l.session.style.styleName,
        distanceMeters: l.session.distanceMeters,
        resultText: l.resultText,
        elapsedSeconds: l.elapsedSeconds,
      };
    }

    // --------------------------------------------------------------
    // bestTimes — group FINISHED lanes by (styleId, distanceMeters),
    // take min(elapsedSeconds).
    // --------------------------------------------------------------
    const bestMap = new Map<
      string,
      {
        styleId: string;
        styleName: string;
        distanceMeters: number;
        bestSeconds: number;
        bestText: string;
        sessionDate: string;
      }
    >();
    for (const l of finishedLanes) {
      const key = `${l.session.styleId}|${l.session.distanceMeters}`;
      const time = l.elapsedSeconds as number;
      const existing = bestMap.get(key);
      if (!existing || time < existing.bestSeconds) {
        bestMap.set(key, {
          styleId: l.session.styleId,
          styleName: l.session.style.styleName,
          distanceMeters: l.session.distanceMeters,
          bestSeconds: time,
          bestText: formatSeconds(time),
          sessionDate: l.session.sessionDate.toISOString(),
        });
      }
    }
    const bestTimes = Array.from(bestMap.values()).sort(
      (a, b) => a.distanceMeters - b.distanceMeters
    );

    // --------------------------------------------------------------
    // latestVsPrevious — compare latest lane's style+distance to the
    // previous FINISHED lane with the SAME style+distance.
    // --------------------------------------------------------------
    let latestVsPrevious: ParentChildSummaryDTO["latestVsPrevious"] = null;
    if (finishedLanes.length > 0) {
      const latestLane = finishedLanes[finishedLanes.length - 1];
      const latestStyleId = latestLane.session.styleId;
      const latestDistance = latestLane.session.distanceMeters;
      const last = latestLane.elapsedSeconds as number;

      // Find the most recent FINISHED lane with the same style+distance,
      // occurring BEFORE the latest lane (i.e. earlier in the ASC-ordered array).
      const sameStyleDistance = finishedLanes
        .slice(0, -1)
        .filter(
          (l) =>
            l.session.styleId === latestStyleId &&
            l.session.distanceMeters === latestDistance
        );

      const previous =
        sameStyleDistance.length > 0
          ? (sameStyleDistance[sameStyleDistance.length - 1]
              .elapsedSeconds as number)
          : null;

      const bucket = changeBucket(last, previous);
      latestVsPrevious = {
        lastTimeSeconds: last,
        previousTimeSeconds: previous,
        changeSeconds: bucket.changeSeconds,
        changePercent: bucket.changePercent,
        direction: bucket.direction,
      };
    }

    // --------------------------------------------------------------
    // trend — every FINISHED lane, ASC by sessionDate, for charting.
    // --------------------------------------------------------------
    const trend = finishedLanes.map((l) => ({
      sessionDate: l.session.sessionDate.toISOString(),
      timeSeconds: l.elapsedSeconds as number,
      styleName: l.session.style.styleName,
      distanceMeters: l.session.distanceMeters,
    }));

    // --------------------------------------------------------------
    // lapConsistency — from the latest lane (by sessionDate) that has laps.
    // --------------------------------------------------------------
    let lapConsistency: ParentChildSummaryDTO["lapConsistency"] = null;
    const lanesWithLaps = finishedLanes.filter((l) => l.laps.length > 0);
    if (lanesWithLaps.length > 0) {
      const latestWithLaps = lanesWithLaps[lanesWithLaps.length - 1];
      const laps = [...latestWithLaps.laps].sort((a, b) => a.lapNo - b.lapNo);
      const times = laps.map((lp) => lp.lapTimeSeconds);
      const avgLap = avg(times);
      const fastestLap = min(times);
      const slowestLap = max(times);
      const dropOffPercent =
        fastestLap !== null && fastestLap > 0 && slowestLap !== null
          ? ((slowestLap - fastestLap) / fastestLap) * 100
          : null;
      const lastLap = times[times.length - 1];
      const enduranceDrop =
        avgLap !== null &&
        slowestLap !== null &&
        lastLap === slowestLap &&
        lastLap > avgLap * 1.1;
      lapConsistency = {
        avgLap: avgLap !== null ? Number(avgLap.toFixed(2)) : null,
        fastestLap: fastestLap !== null ? Number(fastestLap.toFixed(2)) : null,
        slowestLap: slowestLap !== null ? Number(slowestLap.toFixed(2)) : null,
        dropOffPercent:
          dropOffPercent !== null ? Number(dropOffPercent.toFixed(2)) : null,
        enduranceDrop,
      };
    }

    // --------------------------------------------------------------
    // last5Sessions — 5 most recent sessions where this swimmer has a
    // lane (any status). Dedupe by sessionId, prefer FINISHED lane.
    // --------------------------------------------------------------
    const sessionMap = new Map<
      string,
      {
        id: string;
        sessionName: string;
        sessionDate: string;
        styleName: string;
        distanceMeters: number;
        resultText: string | null;
        elapsedSeconds: number | null;
        status: string;
        sortKey: number;
      }
    >();
    for (const l of allLanes) {
      const sid = l.sessionId;
      const candidate = {
        id: l.sessionId,
        sessionName: l.session.sessionName,
        sessionDate: l.session.sessionDate.toISOString(),
        styleName: l.session.style.styleName,
        distanceMeters: l.session.distanceMeters,
        resultText: l.resultText,
        elapsedSeconds: l.elapsedSeconds,
        status: l.status,
        sortKey: new Date(l.session.sessionDate).getTime(),
      };
      const existing = sessionMap.get(sid);
      if (!existing) {
        sessionMap.set(sid, candidate);
      } else {
        // Prefer FINISHED over other statuses; keep existing if already FINISHED.
        if (existing.status !== "FINISHED" && candidate.status === "FINISHED") {
          sessionMap.set(sid, candidate);
        }
      }
    }
    const last5Sessions = Array.from(sessionMap.values())
      .sort((a, b) => b.sortKey - a.sortKey)
      .slice(0, 5)
      .map(({ id, sessionName, sessionDate, styleName, distanceMeters, resultText, elapsedSeconds }) => ({
        id,
        sessionName,
        sessionDate,
        styleName,
        distanceMeters,
        resultText,
        elapsedSeconds,
      }));

    // --------------------------------------------------------------
    // recommendations — 2-4 parent-friendly, POSITIVE recommendations.
    // --------------------------------------------------------------
    const recs: ParentChildSummaryDTO["recommendations"] = [];
    const childName = swimmer.swimmerName;

    // 1) Always include a direction-based recommendation.
    if (latestVsPrevious && latestVsPrevious.direction === "IMPROVED") {
      const delta =
        latestVsPrevious.changeSeconds !== null
          ? Math.abs(latestVsPrevious.changeSeconds).toFixed(2)
          : null;
      recs.push({
        category: "IMPROVED",
        whatHappened:
          delta !== null
            ? `Good improvement — ${childName} improved their latest ${latestSession?.styleName ?? ""} ${latestSession?.distanceMeters ?? ""}m time by about ${delta}s compared with the previous session of the same stroke and distance.`
            : `Good improvement in ${childName}'s latest ${latestSession?.styleName ?? ""} ${latestSession?.distanceMeters ?? ""}m session. Continue the great work!`,
        whatToTrainNext: [
          "Continue regular practice and maintain technique consistency.",
          "Celebrate this progress together — small wins build long-term confidence.",
          "Keep a steady weekly routine so the improvement sticks.",
        ],
      });
    } else if (latestVsPrevious && latestVsPrevious.direction === "SLOWER") {
      recs.push({
        category: "SLOWER",
        whatHappened: `Timing increased in the latest ${latestSession?.styleName ?? ""} ${latestSession?.distanceMeters ?? ""}m session. This is completely normal — every swimmer has ups and downs.`,
        whatToTrainNext: [
          "Coach may review fatigue, start, turn, breathing rhythm, and stroke control.",
          "Encourage good sleep, hydration and a light snack before training.",
          "Stay positive — consistency over time matters more than any single session.",
        ],
      });
    } else if (latestVsPrevious && latestVsPrevious.direction === "SAME") {
      recs.push({
        category: "CONSISTENT",
        whatHappened: `${childName}'s latest time is holding steady — a sign of consistent effort and solid technique.`,
        whatToTrainNext: [
          "Continue the current routine; consistency is the foundation of progress.",
          "Add small fun challenges in practice to keep motivation high.",
          "Re-test in a couple of weeks to look for the next small gain.",
        ],
      });
    } else {
      recs.push({
        category: "NOT_ENOUGH_DATA",
        whatHappened:
          "More recorded sessions are needed to generate a reliable progress trend.",
        whatToTrainNext: [
          "Attend sessions regularly so the coach can capture more timed results.",
          "Encourage your child to enjoy the process — every session counts.",
          "Ask the coach which strokes and distances to focus on next.",
        ],
      });
    }

    // 2) Endurance drop — if lapConsistency flagged it.
    if (lapConsistency && lapConsistency.enduranceDrop) {
      recs.push({
        category: "ENDURANCE_DROP",
        whatHappened: `Endurance drop detected — ${childName}'s laps got slower toward the end of the latest session with lap splits. This is a normal part of building stamina.`,
        whatToTrainNext: [
          "Child may benefit from pacing and endurance sets.",
          "Practice steady, even splits in training to build stamina gradually.",
          "Encourage hydration and good nutrition before training.",
        ],
      });
    }

    // 3) Positive lap consistency — low drop-off.
    if (
      lapConsistency &&
      lapConsistency.dropOffPercent !== null &&
      lapConsistency.dropOffPercent < 10
    ) {
      recs.push({
        category: "CONSISTENT",
        whatHappened: `Lap splits are consistent (drop-off only ${lapConsistency.dropOffPercent.toFixed(1)}%) — great pace control!`,
        whatToTrainNext: [
          "Maintain this consistency while gradually increasing intensity.",
          "Try fun pacing games in training to stay engaged.",
        ],
      });
    }

    // 4) Celebrate a personal best.
    if (bestTimes.length > 0) {
      const recentBest = [...bestTimes].sort(
        (a, b) =>
          new Date(b.sessionDate).getTime() -
          new Date(a.sessionDate).getTime()
      )[0];
      recs.push({
        category: "POSITIVE",
        whatHappened: `${childName}'s current best ${recentBest.styleName} ${recentBest.distanceMeters}m time is ${recentBest.bestText}.`,
        whatToTrainNext: [
          "Celebrate this milestone together — personal bests are worth recognizing.",
          "Set the next small, achievable goal with the coach.",
        ],
      });
    }

    // Ensure at least 1, cap at 4.
    const recommendations = recs.slice(0, 4);

    // --------------------------------------------------------------
    // Assemble final DTO.
    // --------------------------------------------------------------
    const summary: ParentChildSummaryDTO = {
      swimmerId: swimmer.id,
      swimmerName: swimmer.swimmerName,
      age: swimmer.age,
      gender: (swimmer.gender as Gender | null) ?? null,
      totalSessions,
      latestSession,
      bestTimes,
      latestVsPrevious,
      trend,
      recommendations,
      lapConsistency,
      last5Sessions,
    };

    return json(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
