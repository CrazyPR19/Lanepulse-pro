// LanePulse Pro - training group [id] detail
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  audit,
} from "@/lib/api";
import { toGroupDTO } from "@/app/api/groups/route";
import type { GroupMemberDTO } from "@/lib/types";
import { NextRequest } from "next/server";

function toMemberDTO(
  m: {
    id: string;
    groupId: string;
    swimmerId: string;
    laneNo: number;
    isActive: boolean;
    swimmer?: { swimmerName: string } | null;
  }
): GroupMemberDTO {
  return {
    id: m.id,
    groupId: m.groupId,
    swimmerId: m.swimmerId,
    laneNo: m.laneNo,
    isActive: m.isActive,
    swimmerName: m.swimmer?.swimmerName,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;

    const group = await db.trainingGroup.findUnique({
      where: { id },
      include: {
        members: {
          where: { isActive: true },
          include: { swimmer: true },
          orderBy: { laneNo: "asc" },
        },
        _count: { select: { members: true } },
      },
    });
    if (!group) return json({ error: "Group not found" }, 404);

    return json({
      ...toGroupDTO(group as any),
      members: group.members.map(toMemberDTO),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{
      groupName?: string;
      groupLevel?: string | null;
      groupDate?: string | null;
      remarks?: string | null;
      isActive?: boolean;
    }>(req);

    const existing = await db.trainingGroup.findUnique({ where: { id } });
    if (!existing) return json({ error: "Group not found" }, 404);

    const data: any = {};
    if (body.groupName !== undefined) {
      const trimmed = body.groupName.trim();
      if (!trimmed) return json({ error: "groupName cannot be empty" }, 400);
      data.groupName = trimmed;
    }
    if (body.groupLevel !== undefined) {
      data.groupLevel = body.groupLevel?.trim() || null;
    }
    if (body.groupDate !== undefined) {
      if (body.groupDate && String(body.groupDate).trim() !== "") {
        const d = new Date(body.groupDate as string);
        if (isNaN(d.getTime())) {
          return json({ error: "Invalid groupDate" }, 400);
        }
        data.groupDate = d;
      } else {
        data.groupDate = null;
      }
    }
    if (body.remarks !== undefined) {
      data.remarks = body.remarks?.trim() || null;
    }
    if (body.isActive !== undefined) {
      data.isActive = body.isActive;
    }

    const updated = await db.trainingGroup.update({
      where: { id },
      data,
      include: { _count: { select: { members: true } } },
    });
    await audit(
      session,
      "UPDATE_GROUP",
      "training_groups",
      id,
      `Updated group "${updated.groupName}"`
    );
    return json(toGroupDTO(updated as any));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{ confirm?: string }>(req);

    const existing = await db.trainingGroup.findUnique({ where: { id } });
    if (!existing) return json({ error: "Group not found" }, 404);

    // Hard-delete only when explicitly cleared AND no sessions reference it
    if (body.confirm === "CLEAR GROUPS") {
      const sessionCount = await db.trainingSession.count({
        where: { groupId: id },
      });
      if (sessionCount === 0) {
        // Hard delete (members cascade)
        await db.trainingGroup.delete({ where: { id } });
        await audit(
          session,
          "DELETE_GROUP",
          "training_groups",
          id,
          `Hard-deleted group "${existing.groupName}"`
        );
        return json({ success: true, permanent: true });
      }
    }

    // Soft-delete (deactivate) by default
    const updated = await db.trainingGroup.update({
      where: { id },
      data: { isActive: false },
    });
    await audit(
      session,
      "DELETE_GROUP",
      "training_groups",
      id,
      `Deactivated group "${existing.groupName}"`
    );
    return json(toGroupDTO({ ...updated, _count: { members: 0 } }));
  } catch (err) {
    return errorResponse(err);
  }
}
