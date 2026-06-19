// LanePulse Pro - API utilities

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  UnauthenticatedError,
  ForbiddenError,
  type AppSession,
} from "@/lib/session";

/** Standard JSON response */
export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/** Standard error response */
export function errorResponse(err: unknown) {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const msg =
    err instanceof Error ? err.message : "Internal Server Error";
  // Don't leak internal errors in production, but useful in dev
  return NextResponse.json({ error: msg }, { status: 500 });
}

/** Write an audit log entry */
export async function audit(
  session: AppSession,
  action: string,
  tableName: string,
  recordId?: string | null,
  details?: string
) {
  try {
    await db.auditLog.create({
      data: {
        userId: session.userId,
        action,
        tableName,
        recordId: recordId ?? null,
        details: details ?? null,
      },
    });
  } catch {
    // best-effort
  }
}

/** Parse JSON body safely */
export async function parseBody<T = any>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/** Validate required string fields */
export function requireFields(
  obj: Record<string, any>,
  fields: string[]
): string | null {
  for (const f of fields) {
    if (
      obj[f] === undefined ||
      obj[f] === null ||
      (typeof obj[f] === "string" && obj[f].trim() === "")
    ) {
      return `Missing required field: ${f}`;
    }
  }
  return null;
}

/** Clamp lane number 1..12 */
export function clampLane(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(12, Math.floor(n)));
}
