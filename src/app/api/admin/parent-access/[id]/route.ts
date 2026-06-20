// LanePulse Pro - Admin: delete / deactivate a parent-child mapping
// DELETE /api/admin/parent-access/[id]
//   body optional: { permanent?: boolean }
//   - default: soft-delete (set isActive = false)
//   - permanent: true -> hard delete (always safe — no other dependencies)
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { json, errorResponse, parseBody, audit } from "@/lib/api";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{ permanent?: boolean }>(req).catch(() => ({}));

    const existing = await db.parentSwimmer.findUnique({
      where: { id },
      include: {
        parent: { select: { fullName: true } },
        swimmer: { select: { swimmerName: true } },
      },
    });
    if (!existing) {
      return json({ error: "Mapping not found" }, 404);
    }

    const parentName = existing.parent?.fullName ?? "unknown";
    const swimmerName = existing.swimmer?.swimmerName ?? "unknown";

    if (body.permanent === true) {
      // Hard delete — no other relations reference ParentSwimmer, so always safe.
      await db.parentSwimmer.delete({ where: { id } });
      await audit(
        session,
        "REMOVE_PARENT_ACCESS",
        "ParentSwimmer",
        id,
        `Permanently deleted parent access: "${parentName}" -> "${swimmerName}"`
      );
      return json({ success: true, permanent: true });
    }

    // Soft-delete (deactivate) by default.
    const updated = await db.parentSwimmer.update({
      where: { id },
      data: { isActive: false },
    });
    await audit(
      session,
      "REMOVE_PARENT_ACCESS",
      "ParentSwimmer",
      id,
      `Deactivated parent access: "${parentName}" -> "${swimmerName}"`
    );
    return json({
      id: updated.id,
      parentUserId: updated.parentUserId,
      swimmerId: updated.swimmerId,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
