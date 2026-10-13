import { withAuthenticatedAcademyRoute } from "@/lib/academy-route";
import { audit, errorResponse, json, parseBody } from "@/lib/api";
import { db } from "@/lib/db";
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
  status: "COMPLETED" | "DNS" | "DQ";
  laps: LapInput[];
};
type FinalizeInput = { prepareNext?: boolean; results?: ResultInput[] };
type RouteContext = { params: Promise<{ practiceRunId: string; groupId: string; repeatNo: string }> };

async function POSTHandler(req: Request, { params }: RouteContext) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { practiceRunId, groupId, repeatNo: repeatValue } = await params;
    const repeatNo = Number(repeatValue);
    if (!Number.isInteger(repeatNo) || repeatNo < 1) return json({ error: "Invalid repeat number." }, 400);
    const body = await parseBody<FinalizeInput>(req);
    const results = body.results ?? [];
    if (!results.length) return json({ error: "This repeat has no swimmer results to save." }, 400);
    const lanes = new Set<number>();
    for (const result of results) {
      if (!Number.isInteger(result.laneNo) || result.laneNo < 1 || result.laneNo > 12) return json({ error: "Lane numbers must be between 1 and 12." }, 400);
      if (lanes.has(result.laneNo)) return json({ error: `Duplicate lane ${result.laneNo}.` }, 400);
      lanes.add(result.laneNo);
      if (!["COMPLETED", "DNS", "DQ"].includes(result.status)) return json({ error: "All swimmers must be Completed, DNS or DQ before saving the repeat." }, 409);
    }

    const group = await db.practiceRunGroup.findFirst({
      where: { id: groupId, practiceRunId },
      include: { practiceRun: true },
    });
    if (!group) return json({ error: "Practice group not found." }, 404);
    if (group.practiceRun.createdByUserId !== session.userId && session.role !== "SUPER_ADMIN") {
      return json({ error: "You cannot control another coach's practice run." }, 403);
    }
    if (repeatNo !== group.currentRepeatNo || group.repeatStatus !== "RUNNING") {
      return json({ error: `${group.groupNameSnapshot} Repeat ${repeatNo} is not running.` }, 409);
    }

    const repeat = await db.practiceRunGroupRepeat.findUnique({
      where: { practiceRunGroupId_repeatNo: { practiceRunGroupId: group.id, repeatNo } },
    });
    if (!repeat) return json({ error: "Repeat record not found. Start the repeat before saving it." }, 404);
    if (repeat.status === "SAVED") return json({ error: "This repeat has already been saved." }, 409);
    const expectedResultCount = await db.practiceRunResult.count({ where: { groupRepeatId: repeat.id } });
    if (expectedResultCount && results.length !== expectedResultCount) {
      return json({ error: `All ${expectedResultCount} swimmers in this group must be Completed, DNS or DQ before saving the repeat.` }, 409);
    }

    const savedAt = new Date();
    const updatedGroup = await db.$transaction(async (tx) => {
      await tx.practiceRunResult.deleteMany({ where: { practiceRunGroupId: group.id, repeatNo } });
      for (const result of results) {
        await tx.practiceRunResult.create({
          data: {
            practiceRunId,
            practiceRunGroupId: group.id,
            groupRepeatId: repeat.id,
            repeatNo,
            swimmerId: result.swimmerId ?? null,
            swimmerNameSnapshot: result.swimmerNameSnapshot,
            laneNo: result.laneNo,
            startTime: result.startTime ? new Date(result.startTime) : null,
            finishTime: result.finishTime ? new Date(result.finishTime) : null,
            elapsedSeconds: result.elapsedSeconds == null ? null : Number(result.elapsedSeconds),
            resultText: result.resultText ?? null,
            status: result.status,
            academyId: session.academyId,
            laps: {
              create: (result.laps ?? []).map((lap) => ({
                practiceRunId,
                lapNo: lap.lapNo,
                lapTimeSeconds: Number(lap.lapTimeSeconds),
                cumulativeSeconds: Number(lap.cumulativeSeconds),
                lapTimeText: lap.lapTimeText,
                academyId: session.academyId,
              })),
            },
          },
        });
      }
      await tx.practiceRunGroupRepeat.update({
        where: { id: repeat.id },
        data: { status: "SAVED", completedAt: savedAt, savedAt },
      });
      const completedRepeatCount = await tx.practiceRunGroupRepeat.count({
        where: { practiceRunGroupId: group.id, status: "SAVED" },
      });
      const hasNext = repeatNo < group.totalRepeats;
      const nextRepeatNo = repeatNo + 1;
      if (hasNext) {
        const nextRepeat = await tx.practiceRunGroupRepeat.upsert({
          where: { practiceRunGroupId_repeatNo: { practiceRunGroupId: group.id, repeatNo: nextRepeatNo } },
          create: { practiceRunId, practiceRunGroupId: group.id, repeatNo: nextRepeatNo, plannedRepeatCount: group.totalRepeats, status: "READY", academyId: session.academyId },
          update: {},
        });
        const nextRosterCount = await tx.practiceRunResult.count({ where: { groupRepeatId: nextRepeat.id } });
        if (!nextRosterCount) {
          await tx.practiceRunResult.createMany({
            data: results.map((result) => ({
              practiceRunId,
              practiceRunGroupId: group.id,
              groupRepeatId: nextRepeat.id,
              repeatNo: nextRepeatNo,
              swimmerId: result.swimmerId ?? null,
              swimmerNameSnapshot: result.swimmerNameSnapshot,
              laneNo: result.laneNo,
              status: "READY",
              academyId: session.academyId,
            })),
          });
        }
      }
      return tx.practiceRunGroup.update({
        where: { id: group.id },
        data: hasNext
          ? {
              status: "READY",
              currentRepeatNo: body.prepareNext ? nextRepeatNo : repeatNo,
              repeatStatus: body.prepareNext ? "READY" : "SAVED",
              repeatStartTime: null,
              repeatEndTime: savedAt,
              completedRepeatCount,
              nextRepeatReady: true,
            }
          : {
              status: "COMPLETED",
              repeatStatus: "SAVED",
              repeatEndTime: savedAt,
              completedRepeatCount,
              nextRepeatReady: false,
            },
        include: { repeats: { orderBy: { repeatNo: "asc" } } },
      });
    });
    await audit(session, "FINALIZE_GROUP_REPEAT", "PracticeRunGroupRepeat", repeat.id, `${group.groupNameSnapshot} saved Repeat ${repeatNo} of ${group.totalRepeats} with ${results.length} swimmer results`);
    return json(updatedGroup);
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST = withAuthenticatedAcademyRoute(POSTHandler);
