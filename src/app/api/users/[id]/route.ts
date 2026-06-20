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

const VALID_ROLES: Role[] = ["SUPER_ADMIN", "COACH", "VIEWER", "PARENT"];

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

    if (body.role && !VALID_ROLES.includes(body.role as Role)) {
      return json({ error: "Invalid role" }, 400);
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

    // Prevent demoting the last super admin
    if (
      existing.role === "SUPER_ADMIN" &&
      (body.role !== undefined && body.role !== "SUPER_ADMIN" ||
        body.isActive === false)
    ) {
      const superAdminCount = await db.user.count({
        where: { role: "SUPER_ADMIN", isActive: true },
      });
      if (superAdminCount <= 1) {
        return json(
          { error: "Cannot demote or deactivate the last super admin" },
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

    // Cannot delete self
    if (session.userId === id) {
      return json({ error: "Cannot delete your own account" }, 409);
    }

    // Cannot delete the last super admin
    if (existing.role === "SUPER_ADMIN") {
      const superAdminCount = await db.user.count({
        where: { role: "SUPER_ADMIN", isActive: true },
      });
      if (superAdminCount <= 1) {
        return json(
          { error: "Cannot delete the last super admin" },
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
