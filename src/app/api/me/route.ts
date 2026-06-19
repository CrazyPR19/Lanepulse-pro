// LanePulse Pro - current session user
import { db } from "@/lib/db";
import { requireUser, toUserDTO } from "@/lib/session";
import { json, errorResponse } from "@/lib/api";

export async function GET() {
  try {
    const session = await requireUser();
    const user = await db.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) {
      return json({ error: "User not found" }, 404);
    }
    return json(toUserDTO(user));
  } catch (err) {
    return errorResponse(err);
  }
}
