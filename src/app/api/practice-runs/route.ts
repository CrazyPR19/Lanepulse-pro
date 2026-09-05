import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit, errorResponse, json, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/session";

type LapInput = { lapNo: number; lapTimeSeconds: number; cumulativeSeconds: number; lapTimeText: string };
type ResultInput = {
  swimmerId: string | null;
  swimmerNameSnapshot: string;
  laneNo: number;
  startTime: string | null;
  finishTime: string | null;
  elapsedSeconds: number | null;
  resultText: string | null;
  status: string;
  laps: LapInput[];
};
type GroupInput = {
  groupId: string | null;
  groupNameSnapshot: string;
  plannedStartOffsetSeconds: number;
  actualStartTime: string | null;
  status: string;
  currentRepeatNo?: number;
  totalRepeats?: number;
  repeatStatus?: string;
  completedRepeatCount?: number;
  nextRepeatReady?: boolean;
  results: ResultInput[];
};
type SaveInput = {
  id?: string | null;
  trainingPlanId?: string | null;
  trainingPlanSetId?: string | null;
  sessionDate?: string;
  styleId: string;
  distanceMeters: number;
  repeatNo?: number | null;
  status: string;
  groups: GroupInput[];
};

const fullInclude = {
  trainingPlan: { select: { planName: true } },
  trainingPlanSet: { select: { setLabel: true, repeatCount: true } },
  style: true,
  groups: {
    orderBy: { plannedStartOffsetSeconds: "asc" as const },
    include: {
      repeats: { orderBy: { repeatNo: "asc" as const }, include: { results: { orderBy: { laneNo: "asc" as const }, include: { laps: { orderBy: { lapNo: "asc" as const } } } } } },
      results: { orderBy: [{ repeatNo: "asc" as const }, { laneNo: "asc" as const }], include: { laps: { orderBy: { lapNo: "asc" as const } } } },
    },
  },
};

function validate(body: SaveInput) {
  if (!body.styleId) return "Swimming style is required.";
  if (!Number.isFinite(body.distanceMeters) || body.distanceMeters <= 0) return "Distance must be greater than zero.";
  if (!["DRAFT", "RUNNING", "COMPLETED", "CANCELLED"].includes(body.status)) return "Invalid practice run status.";
  if (!body.groups?.length) return "Prepare at least one group.";
  for (const group of body.groups) {
    if (!group.groupNameSnapshot?.trim()) return "Every group needs a name.";
    const lanes = new Set<number>();
    for (const result of group.results ?? []) {
      if (!Number.isInteger(result.laneNo) || result.laneNo < 1 || result.laneNo > 12) return "Lane numbers must be between 1 and 12.";
      if (lanes.has(result.laneNo)) return `Duplicate lane ${result.laneNo} in ${group.groupNameSnapshot}.`;
      lanes.add(result.laneNo);
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await requireRole("COACH", "SUPER_ADMIN");
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 30)));
    const runs = await db.practiceRun.findMany({ orderBy: { sessionDate: "desc" }, take: limit, include: fullInclude });
    return json(runs);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const body = await parseBody<SaveInput>(req);
    const academySettings = await db.academySettings.findUnique({ where: { academyId: session.academyId } });
    const academyLaneCount = academySettings?.defaultLaneCount ?? 8;
    const invalid = validate(body);
    if (invalid) return json({ error: invalid }, 400);
    if (body.groups.some((group) => group.results.some((result) => result.laneNo > academyLaneCount))) {
      return json({ error: `Lane numbers must be between 1 and ${academyLaneCount} for this academy.` }, 400);
    }
    const [style, planSet, plan] = await Promise.all([
      db.swimmingStyle.findUnique({ where: { id: body.styleId } }),
      body.trainingPlanSetId ? db.trainingPlanSet.findUnique({ where: { id: body.trainingPlanSetId } }) : null,
      body.trainingPlanId ? db.trainingPlan.findUnique({ where: { id: body.trainingPlanId } }) : null,
    ]);
    if (!style) return json({ error: "Swimming style not found." }, 400);
    if (body.trainingPlanSetId && (!planSet || planSet.planId !== body.trainingPlanId)) {
      return json({ error: "The selected set does not belong to this training plan." }, 400);
    }
    if (body.id) {
      const existing = await db.practiceRun.findUnique({ where: { id: body.id } });
      if (!existing) return json({ error: "Practice run not found." }, 404);
      if (existing.createdByUserId !== session.userId && session.role !== "SUPER_ADMIN") return json({ error: "You cannot update another coach's practice run." }, 403);
      if (existing.status === "COMPLETED") return json({ error: "Completed practice runs cannot be overwritten." }, 409);
    }

    const saved = await db.$transaction(async (tx) => {
      const run = body.id
        ? await tx.practiceRun.update({ where: { id: body.id }, data: {
            trainingPlanId: body.trainingPlanId ?? null, trainingPlanSetId: body.trainingPlanSetId ?? null,
            sessionDate: body.sessionDate ? new Date(body.sessionDate) : new Date(), styleId: body.styleId,
            distanceMeters: Number(body.distanceMeters), repeatNo: body.repeatNo ?? null, status: body.status,
            planNameSnapshot: plan?.planName ?? null, setLabelSnapshot: planSet?.setLabel ?? null,
            styleNameSnapshot: style.styleName, repeatCountSnapshot: planSet?.repeatCount ?? null,
            targetTimeSecondsSnapshot: planSet?.targetTimeSeconds ?? null,
            restIntervalSecondsSnapshot: planSet?.restIntervalSeconds ?? null,
          } })
        : await tx.practiceRun.create({ data: {
            trainingPlanId: body.trainingPlanId ?? null, trainingPlanSetId: body.trainingPlanSetId ?? null,
            sessionDate: body.sessionDate ? new Date(body.sessionDate) : new Date(), styleId: body.styleId,
            distanceMeters: Number(body.distanceMeters), repeatNo: body.repeatNo ?? null, status: body.status,
            planNameSnapshot: plan?.planName ?? null, setLabelSnapshot: planSet?.setLabel ?? null,
            styleNameSnapshot: style.styleName, repeatCountSnapshot: planSet?.repeatCount ?? null,
            targetTimeSecondsSnapshot: planSet?.targetTimeSeconds ?? null,
            restIntervalSecondsSnapshot: planSet?.restIntervalSeconds ?? null,
            createdByUserId: session.userId,
            academyId: session.academyId,
          } });

      if (!body.id) for (const group of body.groups) {
        const initialRepeatNo = Math.max(1, Number(group.currentRepeatNo ?? body.repeatNo ?? 1));
        const totalRepeats = Math.max(initialRepeatNo, Number(group.totalRepeats ?? planSet?.repeatCount ?? 1));
        const createdGroup = await tx.practiceRunGroup.create({ data: {
          practiceRunId: run.id, groupId: group.groupId ?? null,
          groupNameSnapshot: group.groupNameSnapshot.trim(),
          plannedStartOffsetSeconds: Number(group.plannedStartOffsetSeconds) || 0,
          actualStartTime: group.actualStartTime ? new Date(group.actualStartTime) : null,
          status: group.status,
          currentRepeatNo: initialRepeatNo,
          totalRepeats,
          repeatStatus: group.repeatStatus ?? group.status,
          repeatStartTime: group.actualStartTime ? new Date(group.actualStartTime) : null,
          completedRepeatCount: Math.max(0, Number(group.completedRepeatCount ?? 0)),
          nextRepeatReady: group.nextRepeatReady ?? true,
          academyId: session.academyId,
        } });
        const createdRepeat = await tx.practiceRunGroupRepeat.create({ data: {
          practiceRunId: run.id,
          practiceRunGroupId: createdGroup.id,
          repeatNo: initialRepeatNo,
          plannedRepeatCount: totalRepeats,
          status: group.repeatStatus ?? group.status,
          actualStartTime: group.actualStartTime ? new Date(group.actualStartTime) : null,
          academyId: session.academyId,
        } });
        for (const result of group.results ?? []) {
          const createdResult = await tx.practiceRunResult.create({ data: {
            practiceRunId: run.id, practiceRunGroupId: createdGroup.id, groupRepeatId: createdRepeat.id,
            repeatNo: initialRepeatNo, swimmerId: result.swimmerId ?? null,
            swimmerNameSnapshot: result.swimmerNameSnapshot, laneNo: result.laneNo,
            startTime: result.startTime ? new Date(result.startTime) : null,
            finishTime: result.finishTime ? new Date(result.finishTime) : null,
            elapsedSeconds: result.elapsedSeconds == null ? null : Number(result.elapsedSeconds),
            resultText: result.resultText ?? null, status: result.status,
            academyId: session.academyId,
          } });
          if (result.laps?.length) await tx.practiceRunLap.createMany({ data: result.laps.map((lap) => ({
            practiceRunId: run.id, practiceRunResultId: createdResult.id, lapNo: lap.lapNo,
            lapTimeSeconds: Number(lap.lapTimeSeconds), cumulativeSeconds: Number(lap.cumulativeSeconds), lapTimeText: lap.lapTimeText,
            academyId: session.academyId,
          })) });
        }
      }
      return tx.practiceRun.findUniqueOrThrow({ where: { id: run.id }, include: fullInclude });
    });
    await audit(session, body.status === "COMPLETED" ? "COMPLETE_PRACTICE_RUN" : "SAVE_PRACTICE_RUN", "PracticeRun", saved.id, `${body.status} practice run with ${body.groups.length} groups`);
    return json(saved, body.id ? 200 : 201);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const body = await parseBody<{ id?: string; status?: string; forceComplete?: boolean }>(req);
    if (!body.id || !body.status || !["DRAFT", "RUNNING", "COMPLETED", "CANCELLED"].includes(body.status)) {
      return json({ error: "A practice run id and valid status are required." }, 400);
    }
    const existing = await db.practiceRun.findUnique({ where: { id: body.id } });
    if (!existing) return json({ error: "Practice run not found." }, 404);
    if (existing.createdByUserId !== session.userId && session.role !== "SUPER_ADMIN") return json({ error: "You cannot cancel another coach's practice run." }, 403);
    if (existing.status === "COMPLETED") return json({ error: "Completed practice runs cannot be changed." }, 409);
    if (body.status === "COMPLETED") {
      const groups = await db.practiceRunGroup.findMany({ where: { practiceRunId: body.id } });
      const incomplete = groups.filter((group) => group.completedRepeatCount < group.totalRepeats);
      if (!groups.length || (incomplete.length && !body.forceComplete)) {
        const message = incomplete.length
          ? incomplete.map((group) => `${group.groupNameSnapshot} still has ${group.totalRepeats - group.completedRepeatCount} repeat${group.totalRepeats - group.completedRepeatCount === 1 ? "" : "s"} remaining.`).join(" ")
          : "Prepare at least one group before completing the practice run.";
        return json({ error: message }, 409);
      }
      if (incomplete.length && body.forceComplete) {
        const endedAt = new Date();
        const completed = await db.$transaction(async (tx) => {
          await tx.practiceRunGroupRepeat.updateMany({
            where: { practiceRunId: body.id, status: { in: ["READY", "RUNNING"] } },
            data: { status: "CANCELLED", completedAt: endedAt },
          });
          await tx.practiceRunGroup.updateMany({
            where: { id: { in: incomplete.map((group) => group.id) } },
            data: { status: "COMPLETED", repeatStatus: "ENDED", repeatEndTime: endedAt, nextRepeatReady: false },
          });
          return tx.practiceRun.update({ where: { id: body.id }, data: { status: "COMPLETED" } });
        });
        await audit(session, "FORCE_COMPLETE_PRACTICE_RUN", "PracticeRun", body.id, "Coach confirmed ending all remaining unsaved repeats");
        return json(completed);
      }
    }
    const updated = await db.practiceRun.update({ where: { id: body.id }, data: { status: body.status } });
    const action = body.status === "CANCELLED" ? "CANCEL_PRACTICE_RUN" : body.status === "COMPLETED" ? "COMPLETE_PRACTICE_RUN" : "SAVE_PRACTICE_RUN";
    await audit(session, action, "PracticeRun", body.id, `${body.status} practice run from the poolside console`);
    return json(updated);
  } catch (err) {
    return errorResponse(err);
  }
}
