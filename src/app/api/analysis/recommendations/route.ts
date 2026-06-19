// LanePulse Pro - Smart training recommendations engine
// Compare only same swimmer + same style + same distance.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { json, errorResponse, audit } from "@/lib/api";
import { improvementBucket, avg, stddev } from "@/lib/analysis";
import type { RecommendationReport } from "@/lib/types";

// ---------- Style-based coaching tips ----------
function styleTips(styleName: string): { why: string[]; train: string[] } {
  const name = styleName.toLowerCase();
  if (name.includes("free style") || name.includes("freestyle relay")) {
    return {
      why: [
        "Freestyle economy depends on stroke length, body rotation and breathing rhythm.",
        "Small drops in distance-per-stroke usually signal fatigue or technique drift.",
      ],
      train: [
        "Drill: 6-kick switch to reinforce body rotation and long axis stability.",
        "Add 4x50m descend freestyle with count strokes per length (aim for fewer strokes at the same pace).",
        "Practice bilateral breathing 3-5-7 pattern to balance the stroke.",
      ],
    };
  }
  if (name.includes("back stroke") || name.includes("medley relay")) {
    return {
      why: [
        "Backstroke relies on stable head position, hip rotation and clean arm entry.",
        "Sinking hips or crossing the midline on entry reduce speed.",
      ],
      train: [
        "Drill: single-arm backstroke with thumb-out-thumb-in finger-tip drag.",
        "6x50m backstroke with 6-kick underwater dolphin off each wall.",
        "Practice hip-rotation 90deg each side with steady 12-oclock hand entry.",
      ],
    };
  }
  if (name.includes("breast stroke")) {
    return {
      why: [
        "Breaststroke speed comes from kick timing, glide and pullout efficiency.",
        "Rushing the stroke or shortening the glide kills momentum.",
      ],
      train: [
        "Drill: 2-kick / 1-pull to emphasize a long streamline glide.",
        "4x25m pullout-only work (push, dolphin, pull, kick, breakout).",
        "Kick sets with a board: 8x25m breast kick focusing on whip and finish.",
      ],
    };
  }
  if (name.includes("butterfly")) {
    return {
      why: [
        "Butterfly hinges on a steady dolphin rhythm, arm recovery and breathing timing.",
        "Lifting the head too high or late breathing breaks the wave.",
      ],
      train: [
        "Drill: 4-kick / 1-stroke butterfly to lock in the undulation rhythm.",
        "8x25m dolphin kick underwater on the back (no arms).",
        "Breathe every 2 strokes for 6x50m to keep the chest low and hips high.",
      ],
    };
  }
  if (name.includes("individual medley")) {
    return {
      why: [
        "IM performance is decided by transitions and stroke-specific efficiency.",
        "Weak turn execution costs more time than any single stroke.",
      ],
      train: [
        "Drill: transition turns (fly→back, back→breast, breast→free) for 8x50m.",
        "4x100m IM with a coach watching each turn for a 1-step fix.",
        "Targeted weak-stroke 50s: 6x50m on the weakest of the 4 strokes.",
      ],
    };
  }
  if (name.includes("relay")) {
    return {
      why: [
        "Relay results depend on exchange timing, start reaction and clean finishes.",
        "Early or late take-offs cost tenths that decide races.",
      ],
      train: [
        "Drill: relay exchanges with a coach calling 'go' on touch.",
        "6x15m sprint starts to sharpen reaction time.",
        "Practice finishing with a strong 2-stroke extension into the wall.",
      ],
    };
  }
  // Generic technique tips for drill / sprint / endurance styles
  return {
    why: [
      "Drill and training sets build the foundation that race strokes depend on.",
      "Holding technique under fatigue is the main goal of these sets.",
    ],
    train: [
      "Keep the set quality high — slow down rather than letting stroke form break.",
      "Mix in 4x25m technique focus at the end of every set to lock in good mechanics.",
      "Record one lap per week on video and compare side-by-side.",
    ],
  };
}

// ---------- Main handler ----------
export async function GET(req: NextRequest) {
  try {
    const session = await requireUser();
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

    // 1) Gather all finished lanes (with their sessions) for this swimmer+style+distance
    const lanes = await db.sessionLane.findMany({
      where: {
        swimmerId,
        status: "FINISHED",
        elapsedSeconds: { not: null },
        session: { styleId, distanceMeters: distance },
      },
      include: {
        session: true,
        laps: { orderBy: { lapNo: "asc" } },
      },
      orderBy: { session: { sessionDate: "asc" } },
    });

    // 2) Compute improvement status
    let previousBestSeconds: number | null = null;
    let latestTimeSeconds: number | null = null;
    if (lanes.length > 0) {
      latestTimeSeconds = lanes[lanes.length - 1].elapsedSeconds as number;
      if (lanes.length > 1) {
        const previous = lanes.slice(0, -1);
        previousBestSeconds = Math.min(...previous.map((l) => l.elapsedSeconds as number));
      }
    }
    const improvement = improvementBucket(previousBestSeconds, latestTimeSeconds);

    // 3) Collect all laps across all matching sessions (for lap-pattern analysis)
    const allLaps = lanes.flatMap((l) =>
      l.laps.map((lap) => ({
        lapNo: lap.lapNo,
        lapTimeSeconds: lap.lapTimeSeconds,
        cumulativeSeconds: lap.cumulativeSeconds,
      }))
    );

    // 4) Determine lap trend from the most recent session that has laps
    const latestWithLaps = [...lanes]
      .reverse()
      .find((l) => l.laps.length >= 2);
    let lapsMonotonicallyIncreasing = false;
    let fastStartDrop = false;
    let lapConsistencyLow = false;
    let latestLapTimes: number[] = [];
    if (latestWithLaps) {
      const sorted = [...latestWithLaps.laps].sort((a, b) => a.lapNo - b.lapNo);
      latestLapTimes = sorted.map((l) => l.lapTimeSeconds);

      // monotonic increase (allow tiny tolerance 0.05s)
      let mono = true;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].lapTimeSeconds < sorted[i - 1].lapTimeSeconds - 0.05) {
          mono = false;
          break;
        }
      }
      lapsMonotonicallyIncreasing = mono && sorted.length >= 2;

      const avgLap = avg(latestLapTimes);
      const sd = stddev(latestLapTimes);
      if (avgLap !== null && avgLap > 0) {
        const firstLap = sorted[0].lapTimeSeconds;
        const lastLap = sorted[sorted.length - 1].lapTimeSeconds;
        fastStartDrop =
          firstLap < avgLap * 0.85 && lastLap > avgLap * 1.1;
        lapConsistencyLow = sd !== null && sd / avgLap < 0.05;
      }
    }

    // 5) Categorize
    let category: RecommendationReport["category"];
    if (lanes.length < 2 || allLaps.length === 0) {
      category = "NOT_ENOUGH_DATA";
    } else if (lapsMonotonicallyIncreasing) {
      category = "ENDURANCE_DROP";
    } else if (fastStartDrop) {
      category = "FAST_START_DROP";
    } else if (improvement.status === "IMPROVED") {
      category = "IMPROVED";
    } else if (improvement.status === "SLOWER") {
      category = "SLOWER";
    } else {
      // SAME status — check consistency
      category = lapConsistencyLow ? "CONSISTENT" : "CONSISTENT";
    }

    // 6) Build the recommendation text
    const tips = styleTips(style.styleName);
    let whatHappened = "";
    const whyItMayHappen: string[] = [];
    const whatToTrainNext: string[] = [];

    switch (category) {
      case "IMPROVED":
        whatHappened = `Great news — ${swimmer.swimmerName} improved their ${style.styleName} ${distance}m time`;
        if (improvement.improvementSeconds !== null) {
          whatHappened += ` by about ${improvement.improvementSeconds.toFixed(2)}s`;
        }
        whatHappened += ".";
        whyItMayHappen.push(
          "The current training plan is working — technique, conditioning and race strategy are aligning."
        );
        whyItMayHappen.push(...tips.why);
        whatToTrainNext.push(
          "Continue the current training block with a slight progression (5–10% more volume or intensity)."
        );
        whatToTrainNext.push("Keep one quality session per week to lock in the new pace.");
        whatToTrainNext.push(...tips.train);
        break;

      case "SLOWER":
        whatHappened = `${swimmer.swimmerName}'s ${style.styleName} ${distance}m time was slower than their previous best.`;
        whyItMayHappen.push(
          "Possible causes: residual fatigue, disrupted sleep or nutrition, technique drift, or race-day execution (start, turns, breathing)."
        );
        whyItMayHappen.push(...tips.why);
        whatToTrainNext.push(
          "Run a short technique check: video one lap, compare to a previous good session."
        );
        whatToTrainNext.push(
          "Lighten the load for 3–5 days, then re-test — fatigue is the most common cause."
        );
        whatToTrainNext.push("Add 4x25m starts and 4x25m turns to recover sharpness.");
        whatToTrainNext.push(...tips.train);
        break;

      case "ENDURANCE_DROP":
        whatHappened = `${swimmer.swimmerName}'s laps got progressively slower through the ${style.styleName} ${distance}m race — a classic endurance drop-off.`;
        whyItMayHappen.push(
          "Aerobic capacity and pacing are limiting the back half of the race."
        );
        whyItMayHappen.push("Going out too fast in the first lap can also cause this.");
        whyItMayHappen.push(...tips.why);
        whatToTrainNext.push(
          "Add 1 endurance set per week: 8–12x100m at moderate pace with short rest."
        );
        whatToTrainNext.push(
          "Practice negative-split pacing: 4x50m where the 2nd 25m is faster than the 1st."
        );
        whatToTrainNext.push("Drill pacing with a stopwatch callout every 25m.");
        whatToTrainNext.push(...tips.train);
        break;

      case "FAST_START_DROP":
        whatHappened = `${swimmer.swimmerName} started much faster than their average lap and faded badly — a fast-start drop-off.`;
        whyItMayHappen.push(
          "Adrenaline at the start often produces a too-fast first lap that the body cannot sustain."
        );
        whyItMayHappen.push(
          "The opening pace needs to match the realistic race pace, not the sprint pace."
        );
        whyItMayHappen.push(...tips.why);
        whatToTrainNext.push(
          "Drill a controlled start: 6x50m with the first 15m at 90% effort, then settle to race pace."
        );
        whatToTrainNext.push(
          "Practice strong-finish sets: 4x50m descend 1→4 with the last 10m at max effort."
        );
        whatToTrainNext.push(
          "Use a tempo trainer to lock in the target stroke rate from the first stroke."
        );
        whatToTrainNext.push(...tips.train);
        break;

      case "CONSISTENT":
        whatHappened = `${swimmer.swimmerName}'s ${style.styleName} ${distance}m performance is steady — laps are consistent and times are stable.`;
        whyItMayHappen.push(
          "Technique and conditioning are solid; the swimmer is ready to push to the next level."
        );
        whyItMayHappen.push(...tips.why);
        whatToTrainNext.push(
          "Add a sprint-finish block: 6x25m max effort with full recovery, to lift top-end speed."
        );
        whatToTrainNext.push(
          "Add power work: 8x15m resistance sprints (parachute or band)."
        );
        whatToTrainNext.push("Re-test in 2 weeks with a small technique tweak to break the plateau.");
        whatToTrainNext.push(...tips.train);
        break;

      case "NOT_ENOUGH_DATA":
      default:
        whatHappened = `We don't have enough data yet for ${swimmer.swimmerName}'s ${style.styleName} ${distance}m to give specific advice.`;
        whyItMayHappen.push(
          "We need at least 2 finished sessions with recorded laps to analyze trends."
        );
        whatToTrainNext.push(
          "Record 2 more sessions of this exact stroke and distance, with full lap splits."
        );
        whatToTrainNext.push(
          "Until then, focus on a balanced mix of technique drills and aerobic conditioning."
        );
        whatToTrainNext.push(...tips.train);
        break;
    }

    const report: RecommendationReport = {
      swimmerId,
      swimmerName: swimmer.swimmerName,
      styleId,
      styleName: style.styleName,
      distanceMeters: distance,
      whatHappened,
      whyItMayHappen,
      whatToTrainNext,
      category,
    };

    // 7) Persist a PerformanceNote so coach can review later
    const recommendationText = [
      `Category: ${category}`,
      ``,
      `What happened: ${whatHappened}`,
      ``,
      `Why it may happen:`,
      ...whyItMayHappen.map((s) => `  - ${s}`),
      ``,
      `What to train next:`,
      ...whatToTrainNext.map((s) => `  - ${s}`),
    ].join("\n");

    const note = await db.performanceNote.create({
      data: {
        swimmerId,
        styleId,
        distanceMeters: distance,
        recommendationText,
        createdByUserId: session.userId,
      },
    });

    await audit(
      session,
      "GENERATE_RECOMMENDATION",
      "PerformanceNote",
      note.id,
      `Generated ${category} recommendation for ${swimmer.swimmerName} (${style.styleName} ${distance}m)`
    );

    return json({ ...report, performanceNoteId: note.id });
  } catch (err) {
    return errorResponse(err);
  }
}
