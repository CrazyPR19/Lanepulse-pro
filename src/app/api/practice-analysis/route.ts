import { db } from "@/lib/db";
import { errorResponse, json } from "@/lib/api";
import { requireRole } from "@/lib/session";

export async function GET() {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const plans = await db.trainingPlan.findMany({
      where: session.role === "COACH" ? { createdByUserId: session.userId } : undefined,
      orderBy: { planDate: "desc" }, take: 100,
      include: {
        createdBy: { select: { fullName: true } },
        sets: { include: { style: true }, orderBy: { sequenceNo: "asc" } },
        runs: { include: { style: true, groups: { include: { results: { include: { laps: true } } } }, results: true } },
        copies: { select: { id: true } },
      },
    });
    const results = plans.flatMap((plan) => plan.runs.flatMap((run) => run.groups.flatMap((group) =>
      group.results.filter((result) => result.status === "COMPLETED" && result.elapsedSeconds != null && result.swimmerId)
        .map((result) => ({ ...result, practiceRun: run, runGroup: group }))
    ))).sort((a, b) => b.practiceRun.sessionDate.getTime() - a.practiceRun.sessionDate.getTime());

    const comparisons: any[] = [];
    const seen = new Set<string>();
    for (const current of results) {
      const key = `${current.swimmerId}|${current.practiceRun.styleId}|${current.practiceRun.distanceMeters}|${current.practiceRun.trainingPlanSetId ?? "none"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const previous = results.find((candidate) => candidate.id !== current.id &&
        candidate.swimmerId === current.swimmerId && candidate.practiceRun.styleId === current.practiceRun.styleId &&
        candidate.practiceRun.distanceMeters === current.practiceRun.distanceMeters &&
        candidate.practiceRun.trainingPlanSetId === current.practiceRun.trainingPlanSetId);
      const changeSeconds = previous?.elapsedSeconds != null && current.elapsedSeconds != null
        ? current.elapsedSeconds - previous.elapsedSeconds : null;
      comparisons.push({
        swimmerId: current.swimmerId, swimmerName: current.swimmerNameSnapshot,
        styleName: current.practiceRun.styleNameSnapshot ?? current.practiceRun.style.styleName, distanceMeters: current.practiceRun.distanceMeters,
        setLabel: current.practiceRun.setLabelSnapshot ?? null,
        currentSeconds: current.elapsedSeconds, previousSeconds: previous?.elapsedSeconds ?? null, changeSeconds,
        direction: changeSeconds == null ? "NOT_ENOUGH_DATA" : changeSeconds < -0.01 ? "IMPROVED" : changeSeconds > 0.01 ? "SLOWER" : "SAME",
        recommendation: changeSeconds == null
          ? "Keep capturing this set to build a useful comparison."
          : changeSeconds > 0.01
          ? "Use steady pacing and endurance work across the next repeats."
          : changeSeconds < -0.01
          ? "Good progression. Keep the controlled build through the set."
          : "Performance is consistent. Maintain the current pacing plan.",
      });
    }

    const planReports = plans.map((plan) => {
      const activeSets = plan.sets.filter((set) => set.isActive);
      const completedRuns = plan.runs.filter((run) => run.status === "COMPLETED");
      const completedSetIds = new Set(completedRuns.map((run) => run.trainingPlanSetId).filter(Boolean));
      const plannedMeters = activeSets.reduce((sum, set) => sum + set.distanceMeters * set.repeatCount, 0);
      const completedMeters = completedRuns.reduce((sum, run) => sum + run.distanceMeters, 0);
      const swimmers = new Set(completedRuns.flatMap((run) => run.results.map((result) => result.swimmerId).filter(Boolean)));
      return {
        id: plan.id, planName: plan.planName, planDate: plan.planDate, coachName: plan.createdBy.fullName,
        status: plan.status, isActive: plan.isActive, totalSets: activeSets.length,
        completedSets: completedSetIds.size, remainingSets: Math.max(0, activeSets.length - completedSetIds.size),
        completionPercent: activeSets.length ? Math.round(completedSetIds.size / activeSets.length * 100) : 0,
        plannedMeters, completedMeters, plannedRepeats: activeSets.reduce((sum, set) => sum + set.repeatCount, 0),
        completedRepeats: completedRuns.length, swimmerCount: swimmers.size, copyCount: plan.copies.length,
      };
    });

    const setReports = plans.flatMap((plan) => plan.sets.filter((set) => set.isActive).map((set) => {
      const runs = plan.runs.filter((run) => run.status === "COMPLETED" && (run.trainingPlanSetId === set.id || run.setLabelSnapshot === set.setLabel));
      const actual = runs.flatMap((run) => run.results).filter((result) => result.status === "COMPLETED" && result.elapsedSeconds != null).map((result) => result.elapsedSeconds!);
      const target = set.targetTimeSeconds;
      const meetingTarget = target == null ? 0 : actual.filter((time) => time <= target).length;
      return {
        planId: plan.id, planName: plan.planName, setId: set.id, setLabel: set.setLabel,
        styleName: set.style.styleName, distanceMeters: set.distanceMeters, repeatCount: set.repeatCount,
        targetTimeSeconds: target, actualAverageSeconds: actual.length ? actual.reduce((a, b) => a + b, 0) / actual.length : null,
        bestActualSeconds: actual.length ? Math.min(...actual) : null,
        differenceFromTarget: target != null && actual.length ? actual.reduce((a, b) => a + b, 0) / actual.length - target : null,
        swimmerResults: actual.length, meetingTarget,
        targetAchievementPercent: target != null && actual.length ? Math.round(meetingTarget / actual.length * 100) : null,
      };
    }));

    const repeatMap = new Map<string, any>();
    for (const plan of plans) for (const run of plan.runs.filter((item) => item.status === "COMPLETED")) {
      for (const result of run.results.filter((item) => item.status === "COMPLETED" && item.elapsedSeconds != null && item.swimmerId)) {
        const key = `${plan.id}|${run.setLabelSnapshot ?? run.trainingPlanSetId}|${result.swimmerId}`;
        const row = repeatMap.get(key) ?? { planName: plan.planName, setLabel: run.setLabelSnapshot ?? `${run.distanceMeters}m ${run.styleNameSnapshot ?? run.style.styleName}`, swimmerId: result.swimmerId, swimmerName: result.swimmerNameSnapshot, repeats: [] };
        row.repeats.push({ repeatNo: result.repeatNo, seconds: result.elapsedSeconds }); repeatMap.set(key, row);
      }
    }
    const repeatReports = [...repeatMap.values()].map((row) => {
      row.repeats.sort((a: any, b: any) => a.repeatNo - b.repeatNo);
      const times = row.repeats.map((repeat: any) => repeat.seconds as number); const avg = times.reduce((a: number, b: number) => a + b, 0) / times.length;
      const variance = times.reduce((sum: number, time: number) => sum + Math.pow(time - avg, 2), 0) / times.length;
      const dropOff = times.length > 1 ? times[times.length - 1] - times[0] : 0;
      return { ...row, fastest: Math.min(...times), slowest: Math.max(...times), average: avg, dropOff,
        consistencyScore: Math.max(0, Math.round(100 - Math.sqrt(variance) / avg * 100)),
        recommendation: times.length < 2 ? "Capture more repeats to assess consistency."
          : dropOff > avg * 0.08 ? "Endurance drop detected. Use steady pacing and consider slightly more rest."
          : times[0] < avg * 0.94 ? "Fast first repeat with slowdown. Focus on controlled starts and pacing."
          : times[times.length - 1] < times[0] ? "Strong finishing capacity. Keep the progressive effort pattern."
          : "Good consistency across repeats.",
      };
    });

    const dailyMap = new Map<string, any>();
    for (const report of planReports) {
      const date = new Date(report.planDate).toISOString().slice(0, 10);
      const row = dailyMap.get(date) ?? { date, plannedMeters: 0, completedMeters: 0, sets: 0, repetitions: 0, swimmers: 0 };
      row.plannedMeters += report.plannedMeters; row.completedMeters += report.completedMeters; row.sets += report.totalSets;
      row.repetitions += report.plannedRepeats; row.swimmers += report.swimmerCount; dailyMap.set(date, row);
    }
    const distanceByStyle = new Map<string, number>();
    plans.flatMap((plan) => plan.sets).forEach((set) => distanceByStyle.set(set.style.styleName, (distanceByStyle.get(set.style.styleName) ?? 0) + set.distanceMeters * set.repeatCount));
    const restValues = plans.flatMap((plan) => plan.sets.map((set) => set.restIntervalSeconds).filter((value): value is number => value != null));
    const targetValues = plans.flatMap((plan) => plan.sets.map((set) => set.targetTimeSeconds).filter((value): value is number => value != null));
    const groupMap = new Map<string, any>();
    for (const plan of plans) for (const run of plan.runs) for (const group of run.groups) {
      const row = groupMap.get(group.groupNameSnapshot) ?? { groupName: group.groupNameSnapshot, practiceRuns: 0, swimmers: new Set<string>(), completedResults: 0, totalResults: 0 };
      row.practiceRuns += 1; group.results.forEach((result) => { if (result.swimmerId) row.swimmers.add(result.swimmerId); row.totalResults += 1; if (result.status === "COMPLETED") row.completedResults += 1; }); groupMap.set(group.groupNameSnapshot, row);
    }
    const weeklyMap = new Map<string, { week: string; plannedMeters: number; completedMeters: number }>();
    for (const day of dailyMap.values()) {
      const date = new Date(`${day.date}T12:00:00Z`); const weekday = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - weekday);
      const week = date.toISOString().slice(0, 10); const row = weeklyMap.get(week) ?? { week, plannedMeters: 0, completedMeters: 0 };
      row.plannedMeters += day.plannedMeters; row.completedMeters += day.completedMeters; weeklyMap.set(week, row);
    }
    const overallCompletion = planReports.length ? Math.round(planReports.reduce((sum, plan) => sum + plan.completionPercent, 0) / planReports.length) : 0;
    const targetRows = setReports.filter((set) => set.targetAchievementPercent != null);
    const insights = [
      `Recent plans achieved ${overallCompletion}% average completion.`,
      targetRows.length ? `Target time was achieved in ${Math.round(targetRows.reduce((sum, row) => sum + row.targetAchievementPercent!, 0) / targetRows.length)}% of measured results.` : "Add target times to sets to unlock target-achievement insights.",
      repeatReports.filter((row) => row.dropOff > row.average * 0.08).length ? `${repeatReports.filter((row) => row.dropOff > row.average * 0.08).length} swimmer set(s) showed endurance drop across repeats.` : "Captured repeat blocks show stable pacing overall.",
      plans.some((plan) => plan.runs.some((run) => run.groups.length > 1)) ? "Multi-group staggered practice runs were captured successfully." : "Use multi-group practice runs to evaluate staggered group execution.",
    ];

    return json({
      plans: planReports, comparisons: comparisons.slice(0, 100), setReports,
      repeatReports: repeatReports.slice(0, 200), dailyLoad: [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      weeklyLoad: [...weeklyMap.values()].sort((a, b) => a.week.localeCompare(b.week)),
      distanceByStyle: [...distanceByStyle].map(([swimmingStyleName, meters]) => ({ swimmingStyleName, meters })),
      groupLoad: [...groupMap.values()].map((row) => ({ ...row, swimmers: row.swimmers.size, completionPercent: row.totalResults ? Math.round(row.completedResults / row.totalResults * 100) : 0 })),
      averages: { restIntervalSeconds: restValues.length ? restValues.reduce((a, b) => a + b, 0) / restValues.length : null, targetTimeSeconds: targetValues.length ? targetValues.reduce((a, b) => a + b, 0) / targetValues.length : null },
      reuse: [...planReports].sort((a, b) => b.copyCount - a.copyCount).slice(0, 10), insights,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
