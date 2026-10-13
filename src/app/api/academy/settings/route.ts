import { withAuthenticatedAcademyRoute } from "@/lib/academy-route";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, json, parseBody } from "@/lib/api";
import { requireAcademyContext, requireAcademyRole } from "@/lib/session";

async function GETHandler() {
  try {
    const session = await requireAcademyContext();
    const academy = await db.academy.findUnique({
      where: { id: session.academyId },
      include: { settings: true },
    });
    if (!academy) return json({ error: "Academy not found." }, 404);
    return json(academy);
  } catch (error) {
    return errorResponse(error);
  }
}

async function PATCHHandler(req: NextRequest) {
  try {
    const session = await requireAcademyRole("ACADEMY_ADMIN", "SUPER_ADMIN");
    const body = await parseBody<Record<string, unknown>>(req);
    const laneCount = Number(body.defaultLaneCount ?? 8);
    const poolLength = Number(body.poolLengthMeters ?? 25);
    if (![4, 6, 8, 10, 12].includes(laneCount)) return json({ error: "Lane count must be 4, 6, 8, 10 or 12." }, 400);
    if (![25, 50].includes(poolLength)) return json({ error: "Pool length must be 25m or 50m." }, 400);
    const color = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;

    const academy = await db.academy.update({
      where: { id: session.academyId },
      data: {
        ...(typeof body.academyName === "string" && body.academyName.trim() ? { academyName: body.academyName.trim() } : {}),
        ...(typeof body.country === "string" ? { country: body.country.trim() || null } : {}),
        ...(typeof body.city === "string" ? { city: body.city.trim() || null } : {}),
        ...(typeof body.phone === "string" ? { phone: body.phone.trim() || null } : {}),
        ...(typeof body.logoUrl === "string" ? { logoUrl: body.logoUrl.trim() || null } : {}),
        ...(color(body.primaryColor) ? { primaryColor: color(body.primaryColor) } : {}),
        ...(color(body.secondaryColor) ? { secondaryColor: color(body.secondaryColor) } : {}),
        ...(typeof body.timezone === "string" && body.timezone.trim() ? { timezone: body.timezone.trim() } : {}),
        settings: {
          upsert: {
            create: {
              defaultLaneCount: laneCount,
              poolLengthMeters: poolLength,
              timezone: typeof body.timezone === "string" ? body.timezone : "UTC",
              tagline: typeof body.tagline === "string" ? body.tagline.trim() || null : null,
            },
            update: {
              defaultLaneCount: laneCount,
              poolLengthMeters: poolLength,
              ...(typeof body.timezone === "string" ? { timezone: body.timezone } : {}),
              ...(typeof body.dateFormat === "string" ? { dateFormat: body.dateFormat } : {}),
              ...(typeof body.preferredUnits === "string" ? { preferredUnits: body.preferredUnits } : {}),
              ...(typeof body.tagline === "string" ? { tagline: body.tagline.trim() || null } : {}),
              ...(typeof body.onboardingStep === "number" ? { onboardingStep: Math.min(6, Math.max(1, body.onboardingStep)) } : {}),
              ...(typeof body.onboardingCompleted === "boolean" ? { onboardingCompleted: body.onboardingCompleted } : {}),
            },
          },
        },
      },
      include: { settings: true },
    });
    return json(academy);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withAuthenticatedAcademyRoute(GETHandler);
export const PATCH = withAuthenticatedAcademyRoute(PATCHHandler);
