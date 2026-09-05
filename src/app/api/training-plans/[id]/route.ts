import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit, errorResponse, json, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/session";
import {
  trainingPlanSetData,
  validateTrainingPlanSets,
  type TrainingPlanSetInput,
} from "@/lib/training-plan";

const detailInclude = {
  createdBy: { select: { id: true, fullName: true } },
  sets: { include: { style: true }, orderBy: { sequenceNo: "asc" as const } },
  _count: { select: { runs: true, copies: true } },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id } = await params;
    const plan = await db.trainingPlan.findUnique({ where: { id }, include: detailInclude });
    if (!plan) return json({ error: "Training plan not found." }, 404);
    if (session.role === "COACH" && plan.createdByUserId !== session.userId) return json({ error: "You can only view your own training plans." }, 403);
    const completedRunCount = await db.practiceRun.count({ where: { trainingPlanId: id, status: "COMPLETED" } });
    return json({ ...plan, completedRunCount });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{ planDate?: string; planName?: string; remarks?: string | null; status?: string; sets?: TrainingPlanSetInput[] }>(req);
    const existing = await db.trainingPlan.findUnique({ where: { id }, include: { sets: true } });
    if (!existing) return json({ error: "Training plan not found." }, 404);
    if (session.role === "COACH" && existing.createdByUserId !== session.userId) return json({ error: "You can only edit your own training plans." }, 403);
    if (session.role === "COACH" && !["DRAFT", "ACTIVE"].includes(existing.status)) return json({ error: "Coaches can only edit Draft or Active plans." }, 403);
    if (body.status && !["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"].includes(body.status)) return json({ error: "Invalid training plan status." }, 400);
    if (body.planName !== undefined && !body.planName.trim()) return json({ error: "Plan name cannot be empty." }, 400);

    let styleMap = new Map<string, string>();
    if (body.sets) {
      const validation = validateTrainingPlanSets(body.sets);
      if (validation) return json({ error: validation }, 400);
      const styles = await db.swimmingStyle.findMany({ where: { id: { in: [...new Set(body.sets.map((set) => set.swimmingStyleId))] } } });
      styleMap = new Map(styles.map((style) => [style.id, style.styleName]));
      if (styleMap.size !== new Set(body.sets.map((set) => set.swimmingStyleId)).size) return json({ error: "One or more swimming styles are invalid." }, 400);
    }

    const completedRunCount = await db.practiceRun.count({ where: { trainingPlanId: id, status: "COMPLETED" } });
    const updated = await db.$transaction(async (tx) => {
      await tx.trainingPlan.update({ where: { id }, data: {
        ...(body.planDate ? { planDate: new Date(body.planDate) } : {}),
        ...(body.planName !== undefined ? { planName: body.planName.trim() } : {}),
        ...(body.remarks !== undefined ? { remarks: body.remarks?.trim() || null } : {}),
        ...(body.status ? { status: body.status } : {}),
      } });
      if (body.sets) {
        await tx.trainingPlanSet.deleteMany({ where: { planId: id } });
        await tx.trainingPlanSet.createMany({ data: body.sets.map((set) => ({ planId: id, ...trainingPlanSetData(set, styleMap.get(set.swimmingStyleId)!) })) });
      }
      return tx.trainingPlan.findUniqueOrThrow({ where: { id }, include: detailInclude });
    });
    await audit(session, "EDIT_TRAINING_PLAN", "TrainingPlan", id, `Edited plan "${updated.planName}"${completedRunCount ? ` with ${completedRunCount} completed run(s); snapshots preserved` : ""}`);
    return json({ ...updated, completedRunCount, warning: completedRunCount ? "This plan has completed practice history. Historical run snapshots were preserved." : null });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{ action?: "ARCHIVE" | "RESTORE" | "PERMANENT"; confirmation?: string }>(req);
    const existing = await db.trainingPlan.findUnique({ where: { id }, include: { _count: { select: { runs: true } } } });
    if (!existing) return json({ error: "Training plan not found." }, 404);
    if (body.action === "ARCHIVE") {
      const archived = await db.trainingPlan.update({ where: { id }, data: { isActive: false, deletedAt: new Date(), deletedByUserId: session.userId } });
      await audit(session, "ARCHIVE_TRAINING_PLAN", "TrainingPlan", id, `Archived plan "${existing.planName}"`);
      return json(archived);
    }
    if (body.action === "RESTORE") {
      const restored = await db.trainingPlan.update({ where: { id }, data: { isActive: true, deletedAt: null, deletedByUserId: null } });
      await audit(session, "RESTORE_TRAINING_PLAN", "TrainingPlan", id, `Restored plan "${existing.planName}"`);
      return json(restored);
    }
    if (body.action !== "PERMANENT" || body.confirmation !== "DELETE PLAN") return json({ error: "Type DELETE PLAN exactly to permanently delete this plan." }, 400);
    if (existing._count.runs > 0) return json({ error: "This plan has practice history and cannot be permanently deleted. Archive it instead." }, 409);
    await db.$transaction(async (tx) => {
      await tx.trainingPlanSet.deleteMany({ where: { planId: id } });
      await tx.trainingPlan.delete({ where: { id } });
    });
    await audit(session, "DELETE_TRAINING_PLAN", "TrainingPlan", id, `Permanently deleted unused plan "${existing.planName}"`);
    return json({ message: "Training plan permanently deleted." });
  } catch (err) {
    return errorResponse(err);
  }
}
