// LanePulse Pro - first-run setup wizard
import { Prisma } from "@prisma/client";
import { systemDb } from "@/lib/db";
import { hasAnyUser, hasStyles } from "@/lib/session";
import { createFirstSuperAdmin } from "@/lib/seed";
import { json, errorResponse, parseBody, requireFields } from "@/lib/api";
import { NextRequest } from "next/server";

function databaseFailure(err: unknown) {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const unavailable =
    err instanceof Prisma.PrismaClientInitializationError ||
    ["P1000", "P1001", "P1002", "P1003", "P1008", "P1011", "P1017"].includes(code);

  if (unavailable) {
    console.error(`[DB] setup connection failed${code ? ` (${code})` : ""}`);
    return json(
      {
        ready: false,
        code: "DATABASE_UNAVAILABLE",
        message: "LanePulse database is temporarily unavailable.",
      },
      503,
    );
  }

  if (["P2021", "P2022"].includes(code)) {
    console.error(`[DB] setup schema check failed (${code})`);
    return json(
      {
        ready: false,
        code: "DATABASE_SCHEMA_NOT_READY",
        message: "LanePulse database setup has not been completed.",
      },
      503,
    );
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`[DB] setup operation failed (${err.code})`);
    return json({ ready: false, message: "The setup request could not be completed." }, 500);
  }

  return errorResponse(err);
}

export async function GET() {
  try {
    const [hasUsers, styles] = await Promise.all([hasAnyUser(), hasStyles()]);
    console.info("[DB] setup schema check successful");
    return json({
      ready: true,
      hasUsers,
      hasStyles: styles,
      needsSetup: !hasUsers,
    });
  } catch (err) {
    return databaseFailure(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only allowed when no users exist
    if (await hasAnyUser()) {
      return json(
        { error: "Setup already complete. Users already exist." },
        409
      );
    }
    const body = await parseBody<{
      fullName?: string;
      email?: string;
      username?: string;
      password?: string;
    }>(req);
    const missing = requireFields(body as any, [
      "fullName",
      "email",
      "username",
      "password",
    ]);
    if (missing) return json({ error: missing }, 400);

    const email = body.email!.trim().toLowerCase();
    const username = body.username!.trim();

    // Validate uniqueness pre-emptively (best-effort)
    const existingEmail = await systemDb.user.findUnique({ where: { email } });
    if (existingEmail) {
      return json({ error: "Email already in use" }, 409);
    }
    const existingUsername = await systemDb.user.findUnique({
      where: { username },
    });
    if (existingUsername) {
      return json({ error: "Username already in use" }, 409);
    }

    const result = await createFirstSuperAdmin({
      fullName: body.fullName!.trim(),
      email,
      username,
      password: body.password!,
    });

    return json({ id: result.id, username }, 201);
  } catch (err) {
    return databaseFailure(err);
  }
}
