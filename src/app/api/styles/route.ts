import { withAuthenticatedAcademyRoute } from "@/lib/academy-route";
// LanePulse Pro - swimming styles
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  requireFields,
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

async function GETHandler() {
  try {
    await requireUser();
    const styles = await db.swimmingStyle.findMany({
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { styleName: "asc" }],
    });
    return json(styles.map(toStyleDTO));
  } catch (err) {
    return errorResponse(err);
  }
}

async function POSTHandler(req: NextRequest) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const body = await parseBody<{
      styleName?: string;
      sortOrder?: number;
      isActive?: boolean;
    }>(req);
    const missing = requireFields(body as any, ["styleName"]);
    if (missing) return json({ error: missing }, 400);

    const styleName = body.styleName!.trim();
    const dup = await db.swimmingStyle.findFirst({
      where: { styleName },
    });
    if (dup) return json({ error: "Style name already exists" }, 409);

    const created = await db.swimmingStyle.create({
      data: {
        styleName,
        sortOrder:
          typeof body.sortOrder === "number" ? body.sortOrder : 0,
        isActive: body.isActive ?? true,
        academyId: session.academyId,
      },
    });
    await audit(
      session,
      "CREATE_STYLE",
      "swimming_styles",
      created.id,
      `Created style "${styleName}"`
    );
    return json(toStyleDTO(created), 201);
  } catch (err) {
    return errorResponse(err);
  }
}

export const GET = withAuthenticatedAcademyRoute(GETHandler);
export const POST = withAuthenticatedAcademyRoute(POSTHandler);
