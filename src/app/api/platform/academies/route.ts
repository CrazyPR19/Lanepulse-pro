import { NextRequest } from "next/server";
import { systemDb } from "@/lib/db";
import { errorResponse, json, parseBody } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin();
    const search = req.nextUrl.searchParams.get("search")?.trim();
    const academies = await systemDb.academy.findMany({
      where: search ? { OR: [
        { academyName: { contains: search, mode: "insensitive" } },
        { academyCode: { contains: search, mode: "insensitive" } },
      ] } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { users: true, swimmers: true, trainingSessions: true, practiceRuns: true } },
      },
    });
    const totals = await Promise.all([
      systemDb.academy.count(),
      systemDb.academy.count({ where: { isActive: true } }),
      systemDb.user.count(),
      systemDb.swimmer.count(),
      systemDb.trainingSession.count(),
      systemDb.practiceRun.count(),
    ]);
    return json({
      totals: { academies: totals[0], activeAcademies: totals[1], users: totals[2], swimmers: totals[3], sessions: totals[4], practiceRuns: totals[5] },
      academies,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requirePlatformAdmin();
    const body = await parseBody<{ academyId?: string; isActive?: boolean }>(req);
    if (!body.academyId || typeof body.isActive !== "boolean") return json({ error: "academyId and isActive are required." }, 400);
    const academy = await systemDb.academy.update({
      where: { id: body.academyId },
      data: { isActive: body.isActive },
    });
    await systemDb.auditLog.create({
      data: { userId: session.userId, academyId: academy.id, action: body.isActive ? "ACTIVATE_ACADEMY" : "DEACTIVATE_ACADEMY", tableName: "Academy", recordId: academy.id, details: `${academy.academyCode} status changed by platform administrator` },
    });
    return json(academy);
  } catch (error) {
    return errorResponse(error);
  }
}
