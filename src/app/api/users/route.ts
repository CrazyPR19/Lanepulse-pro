// LanePulse Pro - user management (SUPER_ADMIN only)
import { db } from "@/lib/db";
import { requireRole, toUserDTO } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  requireFields,
  audit,
} from "@/lib/api";
import { hashPassword } from "@/lib/helpers";
import type { Role } from "@/lib/types";
import { NextRequest } from "next/server";

const VALID_ROLES: Role[] = ["SUPER_ADMIN", "COACH", "VIEWER"];

export async function GET() {
  try {
    await requireRole("SUPER_ADMIN");
    const users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
    });
    return json(users.map(toUserDTO));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const body = await parseBody<{
      fullName?: string;
      email?: string;
      username?: string;
      password?: string;
      role?: string;
      isActive?: boolean;
    }>(req);
    const missing = requireFields(body as any, [
      "fullName",
      "email",
      "username",
      "password",
      "role",
    ]);
    if (missing) return json({ error: missing }, 400);

    if (!VALID_ROLES.includes(body.role as Role)) {
      return json({ error: "Invalid role" }, 400);
    }

    const email = body.email!.trim().toLowerCase();
    const username = body.username!.trim();

    const existingEmail = await db.user.findUnique({ where: { email } });
    if (existingEmail) {
      return json({ error: "Email already in use" }, 409);
    }
    const existingUsername = await db.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      return json({ error: "Username already in use" }, 409);
    }

    const passwordHash = await hashPassword(body.password!);
    const created = await db.user.create({
      data: {
        fullName: body.fullName!.trim(),
        email,
        username,
        passwordHash,
        role: body.role as Role,
        isActive: body.isActive ?? true,
      },
    });
    await audit(
      session,
      "CREATE_USER",
      "users",
      created.id,
      `Created user "${username}" with role ${body.role}`
    );
    return json(toUserDTO(created), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
