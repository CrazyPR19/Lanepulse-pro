// LanePulse Pro - auth helpers (session inspection)

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import {
  getTenantContext,
  runWithTenantContext,
} from "@/lib/tenant-context";
import type { PlatformRole, Role, UserDTO } from "@/lib/types";

export interface AppSession {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  academyId: string | null;
  academyName: string | null;
  academyRole: Role;
  platformRole: PlatformRole | null;
  isActive: boolean;
}

/** Get the current authenticated session (server-side) */
export async function getSession(): Promise<AppSession | null> {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const u = s.user as UserDTO & { id?: string };
  if (!u.id) return null;
  const appSession: AppSession = {
    userId: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    academyId: u.academyId ?? null,
    academyName: u.academyName ?? null,
    academyRole: u.academyRole ?? u.role,
    platformRole: u.platformRole ?? null,
    isActive: u.isActive,
  };
  return appSession;
}

/** Require an authenticated, active user. Returns session or throws 401-style null marker. */
export async function requireUser(): Promise<AppSession> {
  const s = await getSession();
  if (!s || !s.isActive) {
    throw new UnauthenticatedError();
  }
  return s;
}

/** Require a minimum role. */
export async function requireRole(...roles: Role[]): Promise<AcademySession> {
  const s = await requireAcademyContext();
  const accepted = new Set<Role>(roles);
  if (roles.includes("COACH")) {
    accepted.add("ACADEMY_ADMIN");
    accepted.add("ACADEMY_OWNER");
    accepted.add("SUPER_ADMIN");
  }
  if (roles.includes("SUPER_ADMIN") || roles.includes("ACADEMY_ADMIN")) {
    accepted.add("ACADEMY_ADMIN");
    accepted.add("ACADEMY_OWNER");
    accepted.add("SUPER_ADMIN");
  }
  if (!accepted.has(s.academyRole)) {
    throw new ForbiddenError();
  }
  return s;
}

export type AcademySession = AppSession & { academyId: string; academyName: string };

const ACADEMY_ROLES = new Set<Role>([
  "SUPER_ADMIN",
  "ACADEMY_OWNER",
  "ACADEMY_ADMIN",
  "COACH",
  "VIEWER",
  "PARENT",
]);

/** Validate the live account, then execute the full callback in academy scope. */
export async function withAuthenticatedAcademy<T>(
  callback: (session: AcademySession) => Promise<T>,
): Promise<T> {
  const tokenSession = await getSession();
  if (!tokenSession) throw new UnauthenticatedError();

  const user = await systemDb.user.findUnique({
    where: { id: tokenSession.userId },
    include: { academy: { select: { academyName: true, isActive: true } } },
  });
  if (!user || !user.isActive) {
    throw new ForbiddenError("This account is not active.", "ACCESS_DENIED");
  }
  if (!user.academyId || !user.academy) {
    throw new ForbiddenError("Academy assignment is missing.", "ACADEMY_MISSING");
  }
  if (!user.academy.isActive) {
    throw new ForbiddenError("This academy has been disabled.", "ACADEMY_DISABLED");
  }
  if (!ACADEMY_ROLES.has(user.role as Role)) {
    throw new ForbiddenError("This account does not have a valid academy role.", "ACCESS_DENIED");
  }

  const session: AcademySession = {
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role as Role,
    academyId: user.academyId,
    academyName: user.academy.academyName,
    academyRole: user.role as Role,
    platformRole: (user.platformRole as PlatformRole | null) ?? null,
    isActive: user.isActive,
  };

  console.info("[TENANT] authenticated=true academy=true");
  return runWithTenantContext(
    {
      mode: "academy",
      userId: session.userId,
      academyId: session.academyId,
      academyRole: session.academyRole,
      platformRole: session.platformRole,
    },
    async () => {
      const context = getTenantContext();
      console.info(
        `[TENANT] context=${context?.mode === "academy"} academy=${context?.mode === "academy"}`,
      );
      return await callback(session);
    },
  );
}

export async function requireAcademyContext(): Promise<AcademySession> {
  const s = await requireUser();
  if (!s.academyId || !s.academyName) {
    throw new ForbiddenError("Academy assignment is missing.", "ACADEMY_MISSING");
  }
  return s as AcademySession;
}

export async function requireAcademyRole(...roles: Role[]): Promise<AcademySession> {
  const s = await requireRole(...roles);
  return s as AcademySession;
}

export async function requirePlatformAdmin(): Promise<AppSession> {
  const s = await requireUser();
  if (s.platformRole !== "PLATFORM_SUPER_ADMIN") {
    throw new ForbiddenError("Platform administrator access is required.");
  }
  return s;
}

export class UnauthenticatedError extends Error {
  status = 401;
  code = "UNAUTHENTICATED";
  constructor() {
    super("Unauthenticated");
  }
}
export class ForbiddenError extends Error {
  status = 403;
  constructor(
    message = "You do not have permission to perform this action.",
    public readonly code = "ACCESS_DENIED",
  ) {
    super(message);
  }
}

/** Convert session user to a public DTO (without password) */
export function toUserDTO(
  u: {
    id: string;
    fullName: string;
    email: string;
    username: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    lastLoginAt: Date | null;
    academyId?: string | null;
    platformRole?: string | null;
    academy?: { academyName: string } | null;
  }
): UserDTO {
  return {
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    username: u.username,
    role: u.role as Role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    academyId: u.academyId ?? null,
    academyName: u.academy?.academyName ?? null,
    academyRole: u.role as Role,
    platformRole: (u.platformRole as PlatformRole | null | undefined) ?? null,
  };
}

/** Returns true when the app has any user (used by setup wizard gate) */
export async function hasAnyUser(): Promise<boolean> {
  const c = await systemDb.user.count();
  return c > 0;
}

/** Returns true when styles have been seeded */
export async function hasStyles(): Promise<boolean> {
  const c = await systemDb.swimmingStyle.count();
  return c > 0;
}
