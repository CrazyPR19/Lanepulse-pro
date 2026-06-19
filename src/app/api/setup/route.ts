// LanePulse Pro - first-run setup wizard
import { db } from "@/lib/db";
import { hasAnyUser, hasStyles } from "@/lib/session";
import { createFirstSuperAdmin } from "@/lib/seed";
import { json, errorResponse, parseBody, requireFields } from "@/lib/api";
import { NextRequest } from "next/server";

export async function GET() {
  try {
    const [hasUsers, styles] = await Promise.all([hasAnyUser(), hasStyles()]);
    return json({
      hasUsers,
      hasStyles: styles,
      needsSetup: !hasUsers,
    });
  } catch (err) {
    return errorResponse(err);
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

    const result = await createFirstSuperAdmin({
      fullName: body.fullName!.trim(),
      email,
      username,
      password: body.password!,
    });

    return json({ id: result.id, username }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
