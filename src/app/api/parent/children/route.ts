// LanePulse Pro - Parent Portal: list assigned children
// GET  /api/parent/children
// Returns the active ParentSwimmer mappings for the authenticated parent,
// with the swimmer's name embedded. Only the parent's own mappings are returned.
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import type { ParentSwimmerDTO } from "@/lib/types";

export async function GET() {
  try {
    const session = await requireRole("PARENT");

    // SECURITY: only return mappings for the authenticated parent.
    const mappings = await db.parentSwimmer.findMany({
      where: {
        parentUserId: session.userId,
        isActive: true,
      },
      include: {
        swimmer: { select: { swimmerName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const result: ParentSwimmerDTO[] = mappings.map((m) => ({
      id: m.id,
      parentUserId: m.parentUserId,
      swimmerId: m.swimmerId,
      swimmerName: m.swimmer?.swimmerName ?? null,
      isActive: m.isActive,
      createdAt: m.createdAt.toISOString(),
    }));

    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
