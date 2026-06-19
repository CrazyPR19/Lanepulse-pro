// LanePulse Pro - group members (list + add + bulk replace)
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  requireFields,
  audit,
  clampLane,
} from "@/lib/api";
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

/**
 * Deactivate a group member safely, handling the unique constraint
 * @@unique([groupId, laneNo, isActive]) by first deleting any existing
 * inactive record that shares the same (groupId, laneNo).
 */
async function deactivateMember(memberId: string) {
  const member = await db.groupMember.findUnique({ where: { id: memberId } });
  if (!member || !member.isActive) return;
  await db.groupMember.deleteMany({
    where: {
      groupId: member.groupId,
      laneNo: member.laneNo,
      isActive: false,
      id: { not: member.id },
    },
  });
  await db.groupMember.update({
    where: { id: memberId },
    data: { isActive: false },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
    const { id } = await params;
    const members = await db.groupMember.findMany({
      where: { groupId: id, isActive: true },
      include: { swimmer: true },
      orderBy: { laneNo: "asc" },
    });
    return json(members.map(toMemberDTO));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{ swimmerId?: string; laneNo?: number }>(req);
    const missing = requireFields(body as any, ["swimmerId", "laneNo"]);
    if (missing) return json({ error: missing }, 400);

    const swimmerId = body.swimmerId!.trim();
    const laneNo = clampLane(Number(body.laneNo));

    const group = await db.trainingGroup.findUnique({ where: { id } });
    if (!group) return json({ error: "Group not found" }, 404);
    if (!group.isActive) {
      return json({ error: "Cannot add members to an inactive group" }, 400);
    }

    const swimmer = await db.swimmer.findUnique({ where: { id: swimmerId } });
    if (!swimmer) return json({ error: "Swimmer not found" }, 404);

    // Check if another swimmer is already ACTIVE in this lane
    const laneConflict = await db.groupMember.findFirst({
      where: { groupId: id, laneNo, isActive: true, swimmerId: { not: swimmerId } },
    });
    if (laneConflict) {
      return json(
        {
          error: `Lane ${laneNo} is already occupied by another swimmer in this group. Choose a different lane or remove the existing swimmer first.`,
        },
        409
      );
    }

    // Same swimmer cannot be active twice — deactivate old membership for this swimmer
    const existing = await db.groupMember.findFirst({
      where: { groupId: id, swimmerId, isActive: true },
    });
    if (existing && existing.laneNo !== laneNo) {
      await deactivateMember(existing.id);
    } else if (existing && existing.laneNo === laneNo) {
      // Already in this exact lane — return existing record
      const refetched = await db.groupMember.findUnique({
        where: { id: existing.id },
        include: { swimmer: true },
      });
      return json(toMemberDTO(refetched!), 200);
    }

    // Clean up any inactive record with the same (group, lane) before creating active
    await db.groupMember.deleteMany({
      where: { groupId: id, laneNo, isActive: false },
    });

    const created = await db.groupMember.create({
      data: { groupId: id, swimmerId, laneNo, isActive: true },
      include: { swimmer: true },
    });
    await audit(
      session,
      "ASSIGN_LANE",
      "group_members",
      created.id,
      `Assigned swimmer "${swimmer.swimmerName}" to lane ${laneNo} in group "${group.groupName}"`
    );
    return json(toMemberDTO(created), 201);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{
      members?: { swimmerId: string; laneNo: number }[];
    }>(req);

    if (!Array.isArray(body.members)) {
      return json({ error: "members must be an array" }, 400);
    }

    const group = await db.trainingGroup.findUnique({ where: { id } });
    if (!group) return json({ error: "Group not found" }, 404);

    // Normalize and validate the incoming list
    const incoming = body.members.map((m) => ({
      swimmerId: m.swimmerId?.trim(),
      laneNo: clampLane(Number(m.laneNo)),
    }));

    // Validate every entry has swimmerId + laneNo
    for (const m of incoming) {
      if (!m.swimmerId) {
        return json({ error: "Each member must have a swimmerId" }, 400);
      }
    }

    // Validate no two entries occupy the same lane
    const laneSet = new Set<number>();
    for (const m of incoming) {
      if (laneSet.has(m.laneNo)) {
        return json(
          { error: `Duplicate lane ${m.laneNo} in request payload` },
          400
        );
      }
      laneSet.add(m.laneNo);
    }

    // Validate no swimmer appears twice
    const swimmerSet = new Set<string>();
    for (const m of incoming) {
      if (swimmerSet.has(m.swimmerId!)) {
        return json(
          { error: `Swimmer ${m.swimmerId} appears more than once in payload` },
          400
        );
      }
      swimmerSet.add(m.swimmerId!);
    }

    // Validate swimmers exist
    const swimmerIds = Array.from(swimmerSet);
    const swimmers = await db.swimmer.findMany({
      where: { id: { in: swimmerIds } },
    });
    if (swimmers.length !== swimmerIds.length) {
      return json({ error: "One or more swimmers not found" }, 404);
    }

    await db.$transaction(async (tx) => {
      // Deactivate all currently-active members (with cleanup of conflicting inactive records)
      const activeMembers = await tx.groupMember.findMany({
        where: { groupId: id, isActive: true },
      });
      for (const m of activeMembers) {
        await tx.groupMember.deleteMany({
          where: {
            groupId: id,
            laneNo: m.laneNo,
            isActive: false,
            id: { not: m.id },
          },
        });
        await tx.groupMember.update({
          where: { id: m.id },
          data: { isActive: false },
        });
      }

      // Create new active members
      for (const m of incoming) {
        // Clean up any inactive record with the same (group, lane)
        await tx.groupMember.deleteMany({
          where: { groupId: id, laneNo: m.laneNo, isActive: false },
        });
        await tx.groupMember.create({
          data: {
            groupId: id,
            swimmerId: m.swimmerId!,
            laneNo: m.laneNo,
            isActive: true,
          },
        });
      }
    });

    await audit(
      session,
      "BULK_ASSIGN_LANES",
      "group_members",
      id,
      `Bulk-replaced ${incoming.length} lane assignments in group "${group.groupName}"`
    );

    const refreshed = await db.groupMember.findMany({
      where: { groupId: id, isActive: true },
      include: { swimmer: true },
      orderBy: { laneNo: "asc" },
    });
    return json(refreshed.map(toMemberDTO));
  } catch (err) {
    return errorResponse(err);
  }
}
