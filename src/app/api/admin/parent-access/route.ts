// LanePulse Pro - Admin: parent-child access management (COACH+)
// GET   /api/admin/parent-access          list ALL mappings (with names)
// POST  /api/admin/parent-access          assign / reactivate a mapping
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  requireFields,
  audit,
} from "@/lib/api";
import type { ParentSwimmerDTO } from "@/lib/types";

function toDTO(m: {
  id: string;
  parentUserId: string;
  swimmerId: string;
  isActive: boolean;
  createdAt: Date;
  parent?: { fullName: string } | null;
  swimmer?: { swimmerName: string } | null;
}): ParentSwimmerDTO {
  return {
    id: m.id,
    parentUserId: m.parentUserId,
    parentName: m.parent?.fullName ?? null,
    swimmerId: m.swimmerId,
    swimmerName: m.swimmer?.swimmerName ?? null,
    isActive: m.isActive,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    await requireRole("COACH", "SUPER_ADMIN");

    const mappings = await db.parentSwimmer.findMany({
      include: {
        parent: { select: { fullName: true } },
        swimmer: { select: { swimmerName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return json(mappings.map(toDTO));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const body = await parseBody<{
      parentUserId?: string;
      swimmerId?: string;
    }>(req);

    const missing = requireFields(body as any, ["parentUserId", "swimmerId"]);
    if (missing) return json({ error: missing }, 400);

    const parentUserId = body.parentUserId!.trim();
    const swimmerId = body.swimmerId!.trim();

    // Validate parent user — must exist, role PARENT, and be active.
    const parentUser = await db.user.findUnique({
      where: { id: parentUserId },
    });
    if (!parentUser) {
      return json({ error: "Parent user not found" }, 404);
    }
    if (parentUser.role !== "PARENT") {
      return json(
        { error: "Selected user is not a PARENT role account" },
        400
      );
    }
    if (!parentUser.isActive) {
      return json({ error: "Parent user is inactive" }, 400);
    }

    // Validate swimmer — must exist and be active.
    const swimmer = await db.swimmer.findUnique({
      where: { id: swimmerId },
    });
    if (!swimmer) {
      return json({ error: "Swimmer not found" }, 404);
    }
    if (!swimmer.activeStatus) {
      return json({ error: "Swimmer is inactive" }, 400);
    }

    // Duplicate check — unique on (parentUserId, swimmerId).
    const existing = await db.parentSwimmer.findUnique({
      where: {
        parentUserId_swimmerId: { parentUserId, swimmerId },
      },
    });
    if (existing && existing.isActive) {
      return json(
        { error: "This parent already has access to this swimmer" },
        409
      );
    }

    let mapping;
    if (existing && !existing.isActive) {
      // Reactivate the previously-deactivated mapping.
      mapping = await db.parentSwimmer.update({
        where: { id: existing.id },
        data: { isActive: true },
        include: {
          parent: { select: { fullName: true } },
          swimmer: { select: { swimmerName: true } },
        },
      });
    } else {
      mapping = await db.parentSwimmer.create({
        data: { parentUserId, swimmerId, isActive: true },
        include: {
          parent: { select: { fullName: true } },
          swimmer: { select: { swimmerName: true } },
        },
      });
    }

    await audit(
      session,
      "ASSIGN_PARENT_ACCESS",
      "ParentSwimmer",
      mapping.id,
      `Granted parent "${parentUser.fullName}" access to swimmer "${swimmer.swimmerName}"`
    );

    return json(toDTO(mapping), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
