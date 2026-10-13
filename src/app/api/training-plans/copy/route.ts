import { withAuthenticatedAcademyRoute } from "@/lib/academy-route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit, errorResponse, json, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { generateTrainingPlanName } from "@/lib/training-plan";

type CopyMode = "SOURCE" | "PREVIOUS_DAY" | "SAME_DAY_LAST_WEEK" | "DATE";

function dayRange(date: Date) {
  const start = new Date(date); start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date); end.setUTCHours(23, 59, 59, 999);
  return { gte: start, lte: end };
}

async function POSTHandler(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const body = await parseBody<{ sourcePlanId?: string; mode?: CopyMode; sourceDate?: string; newPlanDate?: string; period?: string }>(req);
    if (!body.newPlanDate) return json({ error: "New plan date is required." }, 400);
    const newPlanDate = new Date(`${body.newPlanDate.slice(0, 10)}T12:00:00Z`);
    let sourcePlanId = body.sourcePlanId;

    if (!sourcePlanId) {
      let sourceDate: Date;
      if (body.mode === "PREVIOUS_DAY") sourceDate = new Date(newPlanDate.getTime() - 86400000);
      else if (body.mode === "SAME_DAY_LAST_WEEK") sourceDate = new Date(newPlanDate.getTime() - 7 * 86400000);
      else if (body.mode === "DATE" && body.sourceDate) sourceDate = new Date(`${body.sourceDate.slice(0, 10)}T12:00:00Z`);
      else return json({ error: "Choose a source plan or copy mode." }, 400);
      const source = await db.trainingPlan.findFirst({
        where: { planDate: dayRange(sourceDate), ...(session.role === "COACH" ? { createdByUserId: session.userId } : {}) },
        orderBy: { createdAt: "desc" }, select: { id: true },
      });
      if (!source) return json({ error: "No matching source training plan was found." }, 404);
      sourcePlanId = source.id;
    }

    const source = await db.trainingPlan.findUnique({
      where: { id: sourcePlanId },
      include: { sets: { where: { isActive: true }, include: { style: true }, orderBy: { sequenceNo: "asc" } } },
    });
    if (!source) return json({ error: "Source training plan not found." }, 404);
    if (session.role === "COACH" && source.createdByUserId !== session.userId) return json({ error: "Coaches can only copy their own training plans." }, 403);
    if (!source.sets.length) return json({ error: "The source plan has no active sets to copy." }, 400);

    const planName = generateTrainingPlanName(newPlanDate, source.sets.map((set) => set.style.styleName), body.period);
    const copied = await db.trainingPlan.create({
      data: {
        planDate: newPlanDate, planName, remarks: source.remarks, status: "DRAFT",
        createdByUserId: session.userId, copiedFromPlanId: source.id,
        academyId: session.academyId,
        sets: { create: source.sets.map((set) => ({
          sequenceNo: set.sequenceNo, distanceMeters: set.distanceMeters, repeatCount: set.repeatCount,
          swimmingStyleId: set.swimmingStyleId, setLabel: set.setLabel,
          targetTimeSeconds: set.targetTimeSeconds, restIntervalSeconds: set.restIntervalSeconds,
          notes: set.notes, isActive: true,
        })) },
      },
      include: { createdBy: { select: { fullName: true } }, sets: { include: { style: true }, orderBy: { sequenceNo: "asc" } }, _count: { select: { runs: true, copies: true } } },
    });
    await audit(session, "COPY_TRAINING_PLAN", "TrainingPlan", copied.id, `Copied "${source.planName}" (${source.id}) to ${planName}`);
    return json({ ...copied, sourcePlan: { id: source.id, planName: source.planName, planDate: source.planDate } }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}

export const POST = withAuthenticatedAcademyRoute(POSTHandler);
