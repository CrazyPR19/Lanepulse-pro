// LanePulse Pro - current session user
import { systemDb } from "@/lib/db";
import { getSession, toUserDTO } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";
import type { Role } from "@/lib/types";

const ACADEMY_ROLES = new Set<Role>([
  "SUPER_ADMIN",
  "ACADEMY_OWNER",
  "ACADEMY_ADMIN",
  "COACH",
  "VIEWER",
  "PARENT",
]);

function accessError(error: string, code: string, status: number) {
  return json({ error, code }, status);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return accessError("Authentication is required", "UNAUTHENTICATED", 401);
    }

    // Identity bootstrap must not depend on a possibly stale tenant claim.
    const user = await systemDb.user.findUnique({
      where: { id: session.userId },
      include: {
        academy: { select: { academyName: true, isActive: true } },
      },
    });
    if (!user) {
      return accessError("User account was not found", "USER_NOT_FOUND", 404);
    }
    if (!user.isActive) {
      return accessError("This account has been disabled", "ACCOUNT_DISABLED", 403);
    }
    if (user.platformRole === "PLATFORM_SUPER_ADMIN") {
      return json(toUserDTO(user));
    }
    if (!user.academyId || !user.academy) {
      return accessError("Academy assignment is missing", "ACADEMY_MISSING", 403);
    }
    if (!user.academy.isActive) {
      return accessError("This academy has been disabled", "ACADEMY_DISABLED", 403);
    }
    if (!ACADEMY_ROLES.has(user.role as Role)) {
      return accessError("This account does not have a valid academy role", "ACCESS_DENIED", 403);
    }
    return json(toUserDTO(user));
  } catch (err) {
    return errorResponse(err);
  }
}
