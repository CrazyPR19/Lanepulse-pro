// LanePulse Pro - swimming styles [id]
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  audit,
} from "@/lib/api";
import type { SwimmingStyleDTO } from "@/lib/types";
import { NextRequest } from "next/server";

function toStyleDTO(s: {
  id: string;
  styleName: string;
  isActive: boolean;
  sortOrder: number;
}): SwimmingStyleDTO {
  return {
    id: s.id,
    styleName: s.styleName,
    isActive: s.isActive,
    sortOrder: s.sortOrder,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{
      styleName?: string;
      isActive?: boolean;
      sortOrder?: number;
    }>(req);

    const existing = await db.swimmingStyle.findUnique({ where: { id } });
    if (!existing) return json({ error: "Style not found" }, 404);

    if (body.styleName !== undefined) {
      const trimmed = body.styleName.trim();
      if (!trimmed) {
        return json({ error: "styleName cannot be empty" }, 400);
      }
      const dup = await db.swimmingStyle.findFirst({
        where: { styleName: trimmed, NOT: { id } },
      });
      if (dup) return json({ error: "Style name already in use" }, 409);
    }

    const data: any = {};
    if (body.styleName !== undefined) data.styleName = body.styleName.trim();
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

    const updated = await db.swimmingStyle.update({
      where: { id },
      data,
    });
    await audit(
      session,
      "UPDATE_STYLE",
      "swimming_styles",
      id,
      `Updated style "${updated.styleName}"`
    );
    return json(toStyleDTO(updated));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;

    const existing = await db.swimmingStyle.findUnique({ where: { id } });
    if (!existing) return json({ error: "Style not found" }, 404);

    // Check active sessions referencing this style
    const activeSessions = await db.trainingSession.count({
      where: {
        styleId: id,
        status: { in: ["DRAFT", "RUNNING"] },
      },
    });
    if (activeSessions > 0) {
      return json(
        {
          error: `Cannot delete: ${activeSessions} active session(s) reference this style. Archive or delete those sessions first.`,
        },
        409
      );
    }

    // Soft-delete (deactivate)
    const updated = await db.swimmingStyle.update({
      where: { id },
      data: { isActive: false },
    });
    await audit(
      session,
      "DELETE_STYLE",
      "swimming_styles",
      id,
      `Deactivated style "${updated.styleName}"`
    );
    return json(toStyleDTO(updated));
  } catch (err) {
    return errorResponse(err);
  }
}
