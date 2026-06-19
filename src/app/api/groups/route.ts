// LanePulse Pro - training groups / heats
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  requireFields,
  audit,
} from "@/lib/api";
import type { TrainingGroupDTO } from "@/lib/types";
import { NextRequest } from "next/server";

export function toGroupDTO(
  g: {
    id: string;
    groupName: string;
    groupLevel: string | null;
    groupDate: Date | null;
    remarks: string | null;
    isActive: boolean;
    createdAt: Date;
    _count?: { members: number };
  }
): TrainingGroupDTO {
  return {
    id: g.id,
    groupName: g.groupName,
    groupLevel: g.groupLevel,
    groupDate: g.groupDate ? g.groupDate.toISOString() : null,
    remarks: g.remarks,
    isActive: g.isActive,
    createdAt: g.createdAt.toISOString(),
    memberCount: g._count?.members,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const active = searchParams.get("active");

    const where: any = {};
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;

    const groups = await db.trainingGroup.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { members: { where: { isActive: true } } },
        },
      },
    });
    // Map _count.members (filtered to active) into memberCount
    return json(
      groups.map((g) =>
        toGroupDTO({
          ...g,
          _count: { members: (g._count as any).members ?? 0 },
        })
      )
    );
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const body = await parseBody<{
      groupName?: string;
      groupLevel?: string | null;
      groupDate?: string | null;
      remarks?: string | null;
    }>(req);
    const missing = requireFields(body as any, ["groupName"]);
    if (missing) return json({ error: missing }, 400);

    const groupName = body.groupName!.trim();
    if (groupName.length < 1) {
      return json({ error: "groupName must not be empty" }, 400);
    }

    let groupDate: Date | null = null;
    if (body.groupDate && String(body.groupDate).trim() !== "") {
      const d = new Date(body.groupDate as string);
      if (isNaN(d.getTime())) {
        return json({ error: "Invalid groupDate" }, 400);
      }
      groupDate = d;
    }

    const created = await db.trainingGroup.create({
      data: {
        groupName,
        groupLevel: body.groupLevel?.trim() || null,
        groupDate,
        remarks: body.remarks?.trim() || null,
        isActive: true,
      },
      include: { _count: { select: { members: true } } },
    });
    await audit(
      session,
      "CREATE_GROUP",
      "training_groups",
      created.id,
      `Created group "${groupName}"`
    );
    return json(toGroupDTO(created as any), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
