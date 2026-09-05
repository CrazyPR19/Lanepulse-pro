import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit, errorResponse, json, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/session";
import {
  generateTrainingPlanName,
  trainingPlanSetData,
  validateTrainingPlanSets,
  type TrainingPlanSetInput,
} from "@/lib/training-plan";

const includePlan = {
  createdBy: { select: { fullName: true } },
  sets: { include: { style: true }, orderBy: { sequenceNo: "asc" as const } },
  copiedFrom: { select: { id: true, planName: true } },
  _count: { select: { runs: true, copies: true } },
};

export async function GET(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const status = req.nextUrl.searchParams.get("status");
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    const coachId = req.nextUrl.searchParams.get("coachId");
    const styleId = req.nextUrl.searchParams.get("styleId");
    const name = req.nextUrl.searchParams.get("name");
    const groupId = req.nextUrl.searchParams.get("groupId");
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "true";
    const where: any = {
      ...(session.role === "COACH" ? { createdByUserId: session.userId } : coachId ? { createdByUserId: coachId } : {}),
      ...(includeArchived && session.role === "SUPER_ADMIN" ? {} : { isActive: true }),
    };
    if (status) where.status = status;
    if (from || to) where.planDate = { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}) };
    if (styleId) where.sets = { some: { swimmingStyleId: styleId, isActive: true } };
    if (name) where.planName = { contains: name, mode: "insensitive" };
    if (groupId) where.runs = { some: { groups: { some: { groupId } } } };
    const plans = await db.trainingPlan.findMany({
      where,
      orderBy: [{ planDate: "desc" }, { createdAt: "desc" }],
      include: includePlan,
    });
    return json(plans);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const body = await parseBody<{ planDate?: string; planName?: string; period?: string; remarks?: string; status?: string; sets?: TrainingPlanSetInput[] }>(req);
    const sets = body.sets ?? [];
    const validation = validateTrainingPlanSets(sets);
    if (validation) return json({ error: validation }, 400);
    const styleIds = [...new Set(sets.map((set) => String(set.swimmingStyleId)))];
    const styles = await db.swimmingStyle.findMany({ where: { id: { in: styleIds }, isActive: true } });
    if (styles.length !== styleIds.length) return json({ error: "One or more swimming styles are invalid." }, 400);
    const styleMap = new Map<string, string>(
      styles.map(
        (style): [string, string] => [String(style.id), String(style.styleName)]
      )
    );
    const selectedStyleNames: string[] = sets.flatMap((set) => {
      const styleName = styleMap.get(String(set.swimmingStyleId));
      return styleName ? [styleName] : [];
    });
    const planDate = body.planDate ? new Date(body.planDate) : new Date();
    const planName = body.planName?.trim() || generateTrainingPlanName(planDate, selectedStyleNames, body.period);
    if (!planName) return json({ error: "Plan name could not be generated. Select a swimming style." }, 400);
    const status = ["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"].includes(body.status ?? "") ? body.status! : "DRAFT";
    const created = await db.trainingPlan.create({
      data: {
        planDate,
        planName,
        remarks: body.remarks?.trim() || null,
        status,
        createdByUserId: session.userId,
        academyId: session.academyId,
        sets: { create: sets.map((set) => trainingPlanSetData(set, styleMap.get(String(set.swimmingStyleId))!)) },
      },
      include: includePlan,
    });
    await audit(session, "CREATE_TRAINING_PLAN", "TrainingPlan", created.id, `Created training plan "${planName}" with ${sets.length} sets`);
    return json(created, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
