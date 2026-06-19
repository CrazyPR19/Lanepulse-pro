// LanePulse Pro - admin audit log (SUPER_ADMIN only)
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import type { AuditLogDTO } from "@/lib/types";
import { NextRequest } from "next/server";

function toAuditDTO(
  a: {
    id: string;
    userId: string | null;
    action: string;
    tableName: string;
    recordId: string | null;
    details: string | null;
    createdAt: Date;
    user?: { fullName: string; username: string } | null;
  }
): AuditLogDTO {
  return {
    id: a.id,
    userId: a.userId,
    userName: a.user?.fullName ?? a.user?.username ?? null,
    action: a.action,
    tableName: a.tableName,
    recordId: a.recordId,
    details: a.details,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireRole("SUPER_ADMIN");
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get("limit");
    let limit = 100;
    if (limitParam) {
      const n = parseInt(limitParam, 10);
      if (!isNaN(n) && n > 0) limit = Math.min(n, 500);
    }

    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: true },
    });
    return json(logs.map(toAuditDTO));
  } catch (err) {
    return errorResponse(err);
  }
}
