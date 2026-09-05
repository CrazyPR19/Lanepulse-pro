import { audit, errorResponse, json } from "@/lib/api";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

type RouteContext = { params: Promise<{ practiceRunId: string; groupId: string; repeatNo: string }> };

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { practiceRunId, groupId, repeatNo: repeatValue } = await params;
    const repeatNo = Number(repeatValue);
    if (!Number.isInteger(repeatNo) || repeatNo < 1) return json({ error: "Invalid repeat number." }, 400);
    const group = await db.practiceRunGroup.findFirst({ where: { id: groupId, practiceRunId }, include: { practiceRun: true } });
    if (!group) return json({ error: "Practice group not found." }, 404);
    if (group.practiceRun.createdByUserId !== session.userId && session.role !== "SUPER_ADMIN") {
      return json({ error: "You cannot control another coach's practice run." }, 403);
    }
    if (group.completedRepeatCount >= group.totalRepeats) return json({ error: "All planned repeats are complete for this group." }, 409);

    const savedRepeat = await db.practiceRunGroupRepeat.findUnique({
      where: { practiceRunGroupId_repeatNo: { practiceRunGroupId: group.id, repeatNo } },
    });
    if (!savedRepeat || savedRepeat.status !== "SAVED") return json({ error: `Save Repeat ${repeatNo} before preparing the next repeat.` }, 409);
    const nextRepeatNo = repeatNo + 1;
    if (nextRepeatNo > group.totalRepeats) return json({ error: "All planned repeats are complete for this group." }, 409);

    const prepared = await db.$transaction(async (tx) => {
      await tx.practiceRunGroupRepeat.upsert({
        where: { practiceRunGroupId_repeatNo: { practiceRunGroupId: group.id, repeatNo: nextRepeatNo } },
        create: { practiceRunId, practiceRunGroupId: group.id, repeatNo: nextRepeatNo, plannedRepeatCount: group.totalRepeats, status: "READY", academyId: session.academyId },
        update: { status: "READY" },
      });
      return tx.practiceRunGroup.update({
        where: { id: group.id },
        data: { status: "READY", currentRepeatNo: nextRepeatNo, repeatStatus: "READY", repeatStartTime: null, repeatEndTime: null, nextRepeatReady: true },
        include: { repeats: { orderBy: { repeatNo: "asc" } } },
      });
    });
    await audit(session, "PREPARE_GROUP_REPEAT", "PracticeRunGroup", group.id, `${group.groupNameSnapshot} prepared Repeat ${nextRepeatNo} of ${group.totalRepeats}`);
    return json(prepared);
  } catch (err) {
    return errorResponse(err);
  }
}
