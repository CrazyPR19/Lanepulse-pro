// LanePulse Pro - group member [memberId] (transfer / deactivate)
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id, memberId } = await params;
    const body = await parseBody<{
      laneNo?: number;
      swimmerId?: string;
      isActive?: boolean;
    }>(req);

    const member = await db.groupMember.findUnique({
      where: { id: memberId },
      include: { swimmer: true },
    });
    if (!member || member.groupId !== id) {
      return json({ error: "Member not found in this group" }, 404);
    }

    const newLaneNo =
      body.laneNo !== undefined ? clampLane(Number(body.laneNo)) : member.laneNo;
    const newSwimmerId =
      body.swimmerId !== undefined ? body.swimmerId.trim() : member.swimmerId;
    const newIsActive =
      body.isActive !== undefined ? body.isActive : member.isActive;

    // If nothing meaningful changes, just return current
    if (
      newLaneNo === member.laneNo &&
      newSwimmerId === member.swimmerId &&
      newIsActive === member.isActive
    ) {
      return json(toMemberDTO(member));
    }

    // If making active, validate lane conflicts (excluding self)
    if (newIsActive) {
      const swimmerExists = await db.swimmer.findUnique({
        where: { id: newSwimmerId },
      });
      if (!swimmerExists) {
        return json({ error: "Swimmer not found" }, 404);
      }
      const conflict = await db.groupMember.findFirst({
        where: {
          groupId: id,
          laneNo: newLaneNo,
          isActive: true,
          id: { not: memberId },
          swimmerId: { not: newSwimmerId },
        },
      });
      if (conflict) {
        return json(
          {
            error: `Lane ${newLaneNo} is already occupied by another swimmer in this group.`,
          },
          409
        );
      }
      // Same swimmer cannot be active twice — deactivate other active memberships for the same swimmer
      const sameSwimmer = await db.groupMember.findFirst({
        where: {
          groupId: id,
          swimmerId: newSwimmerId,
          isActive: true,
          id: { not: memberId },
        },
      });
      if (sameSwimmer) {
        await deactivateMember(sameSwimmer.id);
      }
    }

    // Handle the unique constraint when lane changes or isActive toggles
    if (newLaneNo !== member.laneNo || !newIsActive) {
      // If we're vacating the old (group, lane, isActive=true) slot, delete any
      // conflicting inactive record with the old (group, lane) so we can later
      // safely deactivate this record if needed.
      // For now, we just update — the unique constraint on (group, newLane, isActive)
      // must not conflict. We've already validated the active case above.
    }

    // If we're flipping isActive from true to false, clean up existing inactive rows
    if (member.isActive && !newIsActive) {
      await db.groupMember.deleteMany({
        where: {
          groupId: id,
          laneNo: member.laneNo,
          isActive: false,
          id: { not: memberId },
        },
      });
    }

    // If we're flipping isActive from false to true at a new lane, delete any
    // inactive record at that (group, lane)
    if (!member.isActive && newIsActive && newLaneNo !== member.laneNo) {
      await db.groupMember.deleteMany({
        where: { groupId: id, laneNo: newLaneNo, isActive: false },
      });
    }
    // If lane is changing while staying active, delete any inactive record at new lane
    if (member.isActive && newIsActive && newLaneNo !== member.laneNo) {
      await db.groupMember.deleteMany({
        where: { groupId: id, laneNo: newLaneNo, isActive: false },
      });
    }

    const updated = await db.groupMember.update({
      where: { id: memberId },
      data: {
        laneNo: newLaneNo,
        swimmerId: newSwimmerId,
        isActive: newIsActive,
      },
      include: { swimmer: true },
    });

    await audit(
      session,
      "TRANSFER_LANE",
      "group_members",
      memberId,
      `Updated lane assignment (lane ${member.laneNo} → ${newLaneNo}, swimmer ${member.swimmerId} → ${newSwimmerId})`
    );
    return json(toMemberDTO(updated));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id, memberId } = await params;

    const member = await db.groupMember.findUnique({
      where: { id: memberId },
      include: { swimmer: true },
    });
    if (!member || member.groupId !== id) {
      return json({ error: "Member not found in this group" }, 404);
    }

    if (member.isActive) {
      // Deactivate (with cleanup of conflicting inactive record at same lane)
      await db.groupMember.deleteMany({
        where: {
          groupId: id,
          laneNo: member.laneNo,
          isActive: false,
          id: { not: memberId },
        },
      });
      await db.groupMember.update({
        where: { id: memberId },
        data: { isActive: false },
      });
    }

    await audit(
      session,
      "REMOVE_FROM_LANE",
      "group_members",
      memberId,
      `Removed swimmer "${member.swimmer?.swimmerName ?? member.swimmerId}" from lane ${member.laneNo}`
    );
    return json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
