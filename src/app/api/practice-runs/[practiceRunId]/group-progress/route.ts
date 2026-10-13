import { withAuthenticatedAcademyRoute } from "@/lib/academy-route";
import { errorResponse, json } from "@/lib/api";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

type RouteContext = { params: Promise<{ practiceRunId: string }> };

async function GETHandler(_req: Request, { params }: RouteContext) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { practiceRunId } = await params;
    const run = await db.practiceRun.findUnique({
      where: { id: practiceRunId },
      include: {
        groups: {
          orderBy: { plannedStartOffsetSeconds: "asc" },
          include: { repeats: { orderBy: { repeatNo: "asc" }, include: { results: { select: { status: true } } } } },
        },
      },
    });
    if (!run) return json({ error: "Practice run not found." }, 404);
    if (run.createdByUserId !== session.userId && session.role !== "SUPER_ADMIN") {
      return json({ error: "You cannot view another coach's practice run." }, 403);
    }
    const groups = run.groups.map((group) => {
      const current = group.repeats.find((repeat) => repeat.repeatNo === group.currentRepeatNo);
      const completedSwimmers = current?.results.filter((result) => ["COMPLETED", "DNS", "DQ"].includes(result.status)).length ?? 0;
      return {
        id: group.id,
        groupId: group.groupId,
        groupName: group.groupNameSnapshot,
        currentRepeatNo: group.currentRepeatNo,
        totalRepeats: group.totalRepeats,
        repeatStatus: group.repeatStatus,
        repeatStartTime: group.repeatStartTime,
        repeatEndTime: group.repeatEndTime,
        completedRepeatCount: group.completedRepeatCount,
        remainingRepeats: Math.max(0, group.totalRepeats - group.completedRepeatCount),
        nextRepeatReady: group.nextRepeatReady,
        completedSwimmers,
        resultCount: current?.results.length ?? 0,
      };
    });
    const incomplete = groups.filter((group) => group.completedRepeatCount < group.totalRepeats);
    return json({
      practiceRunId,
      status: run.status,
      canComplete: groups.length > 0 && incomplete.length === 0,
      groups,
      message: incomplete.length
        ? incomplete.map((group) => `${group.groupName} still has ${group.remainingRepeats} repeat${group.remainingRepeats === 1 ? "" : "s"} remaining.`).join(" ")
        : "All groups completed all planned repeats.",
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = withAuthenticatedAcademyRoute(GETHandler);
