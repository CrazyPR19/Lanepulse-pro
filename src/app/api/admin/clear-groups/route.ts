// LanePulse Pro - admin clear groups (SUPER_ADMIN only)
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { json, errorResponse, parseBody, audit } from "@/lib/api";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const body = await parseBody<{ confirm?: string }>(req);
    if (body.confirm !== "CLEAR GROUPS") {
      return json(
        { error: "Confirmation required: confirm must equal 'CLEAR GROUPS'" },
        400
      );
    }

    // Strategy: hard-delete groups that have no sessions; soft-delete (isActive=false)
    // the rest. Also clear all group_members (cascade handles it for hard-delete;
    // we delete explicitly for soft-deleted groups to actually empty them).
    const groupsWithSessions = await db.trainingGroup.findMany({
      where: { sessions: { some: {} } },
      select: { id: true },
    });
    const idsWithSessions = new Set(groupsWithSessions.map((g) => g.id));

    const result = await db.$transaction(async (tx) => {
      // Delete all members for ALL groups (so even soft-deleted ones are cleared)
      const members = await tx.groupMember.deleteMany({});

      // Hard-delete groups with no sessions
      const hardDelete = await tx.trainingGroup.deleteMany({
        where: { sessions: { none: {} } },
      });

      // Soft-delete groups with sessions
      const softDelete = await tx.trainingGroup.updateMany({
        where: { sessions: { some: {} } },
        data: { isActive: false },
      });

      return { members, hardDelete, softDelete };
    });

    await audit(
      session,
      "CLEAR_GROUPS",
      "training_groups",
      null,
      `Cleared groups: deleted ${result.members.count} member(s), hard-deleted ${result.hardDelete.count} group(s), soft-deleted ${result.softDelete.count} group(s) with sessions`
    );
    return json({
      success: true,
      deleted: {
        members: result.members.count,
        groupsHardDeleted: result.hardDelete.count,
        groupsSoftDeleted: result.softDelete.count,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
