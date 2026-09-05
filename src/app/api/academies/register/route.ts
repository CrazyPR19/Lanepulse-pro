import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { json, parseBody } from "@/lib/api";
import { systemDb } from "@/lib/db";
import { DEFAULT_STYLES, hashPassword } from "@/lib/helpers";

type RegistrationBody = {
  academyName?: string;
  academyCode?: string;
  country?: string;
  city?: string;
  timezone?: string;
  ownerFullName?: string;
  ownerEmail?: string;
  password?: string;
  confirmPassword?: string;
  phone?: string;
};

function codeFor(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);
}

function slugFor(name: string, code: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${base}-${code.toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseBody<RegistrationBody>(req);
    const academyName = body.academyName?.trim() ?? "";
    const academyCode = codeFor(body.academyCode?.trim() || academyName);
    const ownerFullName = body.ownerFullName?.trim() ?? "";
    const ownerEmail = body.ownerEmail?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!academyName || !academyCode || !ownerFullName || !ownerEmail || !password) {
      return json({ error: "Academy name, code, owner name, email and password are required." }, 400);
    }
    if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) return json({ error: "Enter a valid owner email." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    if (password !== body.confirmPassword) return json({ error: "Passwords do not match." }, 400);

    const passwordHash = await hashPassword(password);
    const slug = slugFor(academyName, academyCode);
    const created = await systemDb.$transaction(async (tx) => {
      const academy = await tx.academy.create({
        data: {
          academyName,
          academyCode,
          slug,
          country: body.country?.trim() || null,
          city: body.city?.trim() || null,
          phone: body.phone?.trim() || null,
          email: ownerEmail,
          timezone: body.timezone?.trim() || "UTC",
          subscriptionPlan: "FREE",
          settings: {
            create: { timezone: body.timezone?.trim() || "UTC" },
          },
        },
      });
      const owner = await tx.user.create({
        data: {
          academyId: academy.id,
          fullName: ownerFullName,
          email: ownerEmail,
          username: ownerEmail,
          passwordHash,
          role: "ACADEMY_OWNER",
          isActive: true,
        },
      });
      await tx.swimmingStyle.createMany({
        data: DEFAULT_STYLES.map((styleName, sortOrder) => ({
          academyId: academy.id,
          styleName,
          sortOrder,
          isActive: true,
        })),
      });
      await tx.auditLog.create({
        data: {
          academyId: academy.id,
          userId: owner.id,
          action: "REGISTER_ACADEMY",
          tableName: "Academy",
          recordId: academy.id,
          details: `Registered academy ${academy.academyCode}`,
        },
      });
      return { academy, owner };
    });

    return json({
      message: "Academy created successfully.",
      academyId: created.academy.id,
      academyName: created.academy.academyName,
      ownerLogin: created.owner.email,
      onboardingStep: 1,
    }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return json({ error: "That academy code, owner email, or login is already in use." }, 409);
    }
    console.error("Academy registration failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Academy registration could not be completed." }, 500);
  }
}
