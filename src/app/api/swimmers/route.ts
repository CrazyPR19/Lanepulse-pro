// LanePulse Pro - swimmer master
import { db } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  requireFields,
  audit,
} from "@/lib/api";
import type { SwimmerDTO, Gender } from "@/lib/types";
import { NextRequest } from "next/server";

export function toSwimmerDTO(s: {
  id: string;
  swimmerName: string;
  age: number | null;
  gender: string | null;
  dateOfBirth: Date | null;
  activeStatus: boolean;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SwimmerDTO {
  return {
    id: s.id,
    swimmerName: s.swimmerName,
    age: s.age,
    gender: (s.gender as Gender | null) ?? null,
    dateOfBirth: s.dateOfBirth ? s.dateOfBirth.toISOString() : null,
    activeStatus: s.activeStatus,
    remarks: s.remarks,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";
    const active = searchParams.get("active");

    const where: any = {};
    if (search) {
      where.swimmerName = { contains: search };
    }
    if (active === "true") where.activeStatus = true;
    else if (active === "false") where.activeStatus = false;

    const swimmers = await db.swimmer.findMany({
      where,
      orderBy: { swimmerName: "asc" },
    });
    return json(swimmers.map(toSwimmerDTO));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("COACH", "SUPER_ADMIN");
    const body = await parseBody<{
      swimmerName?: string;
      age?: number | null;
      gender?: Gender | null;
      dateOfBirth?: string | null;
      remarks?: string | null;
    }>(req);
    const missing = requireFields(body as any, ["swimmerName"]);
    if (missing) return json({ error: missing }, 400);

    const swimmerName = body.swimmerName!.trim();
    if (swimmerName.length < 1) {
      return json({ error: "swimmerName must not be empty" }, 400);
    }

    let dateOfBirth: Date | null = null;
    if (body.dateOfBirth && String(body.dateOfBirth).trim() !== "") {
      const d = new Date(body.dateOfBirth as string);
      if (isNaN(d.getTime())) {
        return json({ error: "Invalid dateOfBirth" }, 400);
      }
      dateOfBirth = d;
    }

    if (
      body.gender &&
      !["MALE", "FEMALE", "OTHER"].includes(body.gender)
    ) {
      return json({ error: "Invalid gender" }, 400);
    }

    const created = await db.swimmer.create({
      data: {
        swimmerName,
        age:
          typeof body.age === "number" && Number.isFinite(body.age)
            ? Math.max(0, Math.floor(body.age))
            : null,
        gender: body.gender ?? null,
        dateOfBirth,
        remarks: body.remarks?.trim() || null,
        activeStatus: true,
      },
    });
    await audit(
      session,
      "CREATE_SWIMMER",
      "swimmers",
      created.id,
      `Created swimmer "${swimmerName}"`
    );
    return json(toSwimmerDTO(created), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
