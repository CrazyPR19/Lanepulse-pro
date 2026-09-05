// LanePulse Pro - seed default styles + first admin

import { systemDb } from "@/lib/db";
import { DEFAULT_STYLES, hashPassword } from "@/lib/helpers";
import type { Role } from "@/lib/types";

/** Seed default swimming styles if none exist */
export async function seedDefaultStyles(academyId: string): Promise<number> {
  const existing = await systemDb.swimmingStyle.count({ where: { academyId } });
  if (existing > 0) return 0;
  await systemDb.swimmingStyle.createMany({
    data: DEFAULT_STYLES.map((name, idx) => ({
      styleName: name,
      isActive: true,
      sortOrder: idx,
      academyId,
    })),
  });
  return DEFAULT_STYLES.length;
}

/** Create the first super admin (only allowed when no users exist) */
export async function createFirstSuperAdmin(input: {
  fullName: string;
  email: string;
  username: string;
  password: string;
}): Promise<{ id: string }> {
  const userCount = await systemDb.user.count();
  if (userCount > 0) {
    throw new Error("Setup already complete. An admin already exists.");
  }
  const passwordHash = await hashPassword(input.password);
  const user = await systemDb.$transaction(async (tx) => {
    const academy = await tx.academy.upsert({
      where: { academyCode: "LP-DEMO" },
      update: {},
      create: {
        id: "cmultiacademydefault0001",
        academyName: "LanePulse Demo Academy",
        academyCode: "LP-DEMO",
        slug: "lanepulse-demo",
        settings: { create: { defaultLaneCount: 12, poolLengthMeters: 25 } },
      },
    });
    const created = await tx.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        username: input.username,
        passwordHash,
        role: "ACADEMY_OWNER" as Role,
        isActive: true,
        academyId: academy.id,
      },
    });
    await tx.swimmingStyle.createMany({
      data: DEFAULT_STYLES.map((name, idx) => ({
        styleName: name,
        isActive: true,
        sortOrder: idx,
        academyId: academy.id,
      })),
      skipDuplicates: true,
    });
    await tx.auditLog.create({
      data: {
        userId: created.id,
        academyId: academy.id,
        action: "SETUP_CREATE_ADMIN",
        tableName: "users",
        recordId: created.id,
        details: "First academy owner created via setup wizard",
      },
    });
    return created;
  });
  return { id: user.id };
}
