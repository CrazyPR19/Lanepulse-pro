// LanePulse Pro - seed default styles + first admin

import { db } from "@/lib/db";
import { DEFAULT_STYLES, hashPassword } from "@/lib/helpers";
import type { Role } from "@/lib/types";

/** Seed default swimming styles if none exist */
export async function seedDefaultStyles(): Promise<number> {
  const existing = await db.swimmingStyle.count();
  if (existing > 0) return 0;
  await db.swimmingStyle.createMany({
    data: DEFAULT_STYLES.map((name, idx) => ({
      styleName: name,
      isActive: true,
      sortOrder: idx,
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
  const userCount = await db.user.count();
  if (userCount > 0) {
    throw new Error("Setup already complete. An admin already exists.");
  }
  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      username: input.username,
      passwordHash,
      role: "SUPER_ADMIN" as Role,
      isActive: true,
    },
  });
  await seedDefaultStyles();
  await db.auditLog.create({
    data: {
      userId: user.id,
      action: "SETUP_CREATE_ADMIN",
      tableName: "users",
      recordId: user.id,
      details: "First super admin created via setup wizard",
    },
  });
  return { id: user.id };
}
