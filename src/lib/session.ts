// LanePulse Pro - auth helpers (session inspection)

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Role, UserDTO } from "@/lib/types";

export interface AppSession {
  userId: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
}

/** Get the current authenticated session (server-side) */
export async function getSession(): Promise<AppSession | null> {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const u = s.user as UserDTO & { id?: string };
  if (!u.id) return null;
  return {
    userId: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
  };
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
export async function requireRole(...roles: Role[]): Promise<AppSession> {
  const s = await requireUser();
  if (!roles.includes(s.role)) {
    throw new ForbiddenError();
  }
  return s;
}

export class UnauthenticatedError extends Error {
  status = 401;
  constructor() {
    super("Unauthenticated");
  }
}
export class ForbiddenError extends Error {
  status = 403;
  constructor() {
    super("Forbidden");
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
  };
}

/** Returns true when the app has any user (used by setup wizard gate) */
export async function hasAnyUser(): Promise<boolean> {
  const c = await db.user.count();
  return c > 0;
}

/** Returns true when styles have been seeded */
export async function hasStyles(): Promise<boolean> {
  const c = await db.swimmingStyle.count();
  return c > 0;
}
