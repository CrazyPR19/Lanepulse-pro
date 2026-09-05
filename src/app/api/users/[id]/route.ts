// LanePulse Pro - user [id] management (SUPER_ADMIN only)
import { db } from "@/lib/db";
import { requireRole, toUserDTO } from "@/lib/session";
import {
  json,
  errorResponse,
  parseBody,
  audit,
} from "@/lib/api";
import { hashPassword } from "@/lib/helpers";
import type { Role } from "@/lib/types";
import { NextRequest } from "next/server";

const VALID_ROLES: Role[] = ["ACADEMY_OWNER", "ACADEMY_ADMIN", "COACH", "VIEWER", "PARENT"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{
      fullName?: string;
      email?: string;
      username?: string;
      role?: string;
      isActive?: boolean;
      password?: string;
    }>(req);

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return json({ error: "User not found" }, 404);
    if (session.academyRole === "ACADEMY_ADMIN" && (["ACADEMY_OWNER", "SUPER_ADMIN", "ACADEMY_ADMIN"].includes(existing.role) || body.role === "ACADEMY_ADMIN")) {
      return json({ error: "Academy Admins cannot modify owner or admin accounts." }, 403);
    }

    if (body.role && !VALID_ROLES.includes(body.role as Role)) {
      return json({ error: "Invalid role" }, 400);
    }
    if (body.role === "ACADEMY_OWNER" && existing.role !== "ACADEMY_OWNER") {
      return json({ error: "Academy ownership transfer requires a dedicated support workflow." }, 403);
    }

    const data: any = {};
    if (body.fullName !== undefined) {
      const trimmed = body.fullName.trim();
      if (!trimmed) return json({ error: "fullName cannot be empty" }, 400);
      data.fullName = trimmed;
    }
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!email) return json({ error: "email cannot be empty" }, 400);
      const dup = await db.user.findFirst({
        where: { email, NOT: { id } },
      });
      if (dup) return json({ error: "Email already in use" }, 409);
      data.email = email;
    }
    if (body.username !== undefined) {
      const username = body.username.trim();
      if (!username) return json({ error: "username cannot be empty" }, 400);
      const dup = await db.user.findFirst({
        where: { username, NOT: { id } },
      });
      if (dup) return json({ error: "Username already in use" }, 409);
      data.username = username;
    }
    if (body.role !== undefined) data.role = body.role;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.password !== undefined && body.password.length > 0) {
      data.passwordHash = await hashPassword(body.password);
    }

    // Every academy must retain an active owner.
    if (
      ["SUPER_ADMIN", "ACADEMY_OWNER"].includes(existing.role) &&
      (body.role !== undefined && !["SUPER_ADMIN", "ACADEMY_OWNER"].includes(body.role) ||
        body.isActive === false)
    ) {
      const ownerCount = await db.user.count({
        where: { role: { in: ["SUPER_ADMIN", "ACADEMY_OWNER"] }, isActive: true },
      });
      if (ownerCount <= 1) {
        return json(
          { error: "Cannot demote or deactivate the last academy owner" },
          409
        );
      }
    }

    const updated = await db.user.update({ where: { id }, data });
    await audit(
      session,
      "UPDATE_USER",
      "users",
      id,
      `Updated user "${updated.username}"`
    );
    return json(toUserDTO(updated));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole("SUPER_ADMIN");
    const { id } = await params;
    const body = await parseBody<{ confirm?: string }>(req);

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return json({ error: "User not found" }, 404);
    if (session.academyRole === "ACADEMY_ADMIN" && ["ACADEMY_OWNER", "SUPER_ADMIN", "ACADEMY_ADMIN"].includes(existing.role)) {
      return json({ error: "Academy Admins cannot delete owner or admin accounts." }, 403);
    }

    // Cannot delete self
    if (session.userId === id) {
      return json({ error: "Cannot delete your own account" }, 409);
    }

    // Cannot delete the last super admin
    if (["SUPER_ADMIN", "ACADEMY_OWNER"].includes(existing.role)) {
      const superAdminCount = await db.user.count({
        where: { role: { in: ["SUPER_ADMIN", "ACADEMY_OWNER"] }, isActive: true },
      });
      if (superAdminCount <= 1) {
        return json(
          { error: "Cannot delete the last academy owner" },
          409
        );
      }
    }

    if (body.confirm === "DELETE USER") {
      // Hard-delete only if no audit logs reference them
      const auditCount = await db.auditLog.count({
        where: { userId: id },
      });
      if (auditCount > 0) {
        return json(
          {
            error: `Cannot permanently delete: user is referenced by ${auditCount} audit log(s). Soft-delete instead (omit confirm field).`,
          },
          409
        );
      }
      // Also clean up other relations that could reference the user
      // (training_sessions.createdByUserId is NOT NULL — block if any sessions exist)
      const sessionCount = await db.trainingSession.count({
        where: { createdByUserId: id },
      });
      if (sessionCount > 0) {
        return json(
          {
            error: `Cannot permanently delete: user created ${sessionCount} session(s). Soft-delete instead.`,
          },
          409
        );
      }
      // performance_notes.createdByUserId is nullable — clean up
      await db.performanceNote.deleteMany({
        where: { createdByUserId: id },
      });
      await db.user.delete({ where: { id } });
      await audit(
        session,
        "DELETE_USER",
        "users",
        id,
        `Permanently deleted user "${existing.username}"`
      );
      return json({ success: true, permanent: true });
    }

    // Soft-delete (deactivate) by default
    const updated = await db.user.update({
      where: { id },
      data: { isActive: false },
    });
    await audit(
      session,
      "DELETE_USER",
      "users",
      id,
      `Deactivated user "${existing.username}"`
    );
    return json(toUserDTO(updated));
  } catch (err) {
    return errorResponse(err);
  }
}
