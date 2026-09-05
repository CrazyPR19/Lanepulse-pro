import { audit, errorResponse, json } from "@/lib/api";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

type RouteContext = {
  params: Promise<{ practiceRunId: string; groupId: string; repeatNo: string }>;
};

export async function POST(_req: Request, { params }: RouteContext) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { practiceRunId, groupId, repeatNo: repeatValue } = await params;
    const repeatNo = Number(repeatValue);
    if (!Number.isInteger(repeatNo) || repeatNo < 1) return json({ error: "Invalid repeat number." }, 400);

    const group = await db.practiceRunGroup.findFirst({
      where: { id: groupId, practiceRunId },
      include: { practiceRun: true },
    });
    if (!group) return json({ error: "Practice group not found." }, 404);
    if (group.practiceRun.createdByUserId !== session.userId && session.role !== "SUPER_ADMIN") {
      return json({ error: "You cannot control another coach's practice run." }, 403);
    }
    if (["COMPLETED", "CANCELLED"].includes(group.practiceRun.status)) {
      return json({ error: "This practice run can no longer be changed." }, 409);
    }
    if (repeatNo !== group.currentRepeatNo) {
      return json({ error: `Prepare Repeat ${repeatNo} for ${group.groupNameSnapshot} before starting it.` }, 409);
    }
    if (repeatNo > group.totalRepeats) return json({ error: "All planned repeats are already complete." }, 409);

    const existingRepeat = await db.practiceRunGroupRepeat.findUnique({
      where: { practiceRunGroupId_repeatNo: { practiceRunGroupId: group.id, repeatNo } },
    });
    if (existingRepeat?.status === "SAVED") return json({ error: "A saved repeat cannot be restarted." }, 409);

    const now = new Date();
    const started = await db.$transaction(async (tx) => {
      await tx.practiceRunGroupRepeat.upsert({
        where: { practiceRunGroupId_repeatNo: { practiceRunGroupId: group.id, repeatNo } },
        create: {
          practiceRunId,
          practiceRunGroupId: group.id,
          repeatNo,
          plannedRepeatCount: group.totalRepeats,
          status: "RUNNING",
          actualStartTime: now,
          academyId: session.academyId,
        },
        update: { status: "RUNNING", actualStartTime: existingRepeat?.actualStartTime ?? now },
      });
      await tx.practiceRun.update({ where: { id: practiceRunId }, data: { status: "RUNNING" } });
      return tx.practiceRunGroup.update({
        where: { id: group.id },
        data: {
          status: "RUNNING",
          repeatStatus: "RUNNING",
          repeatStartTime: existingRepeat?.actualStartTime ?? now,
          repeatEndTime: null,
          actualStartTime: group.actualStartTime ?? now,
          nextRepeatReady: false,
        },
        include: { repeats: { orderBy: { repeatNo: "asc" } } },
      });
    });
    await audit(session, "START_GROUP_REPEAT", "PracticeRunGroupRepeat", existingRepeat?.id, `${group.groupNameSnapshot} started Repeat ${repeatNo} of ${group.totalRepeats}`);
    return json(started);
  } catch (err) {
    return errorResponse(err);
  }
}
