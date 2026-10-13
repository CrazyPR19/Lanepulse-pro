import { AsyncLocalStorage } from "node:async_hooks";

import type { PlatformRole, Role } from "@/lib/types";

export type TenantContext =
  | {
      mode: "academy";
      userId: string;
      academyId: string;
      academyRole: Role;
      platformRole: PlatformRole | null;
    }
  | { mode: "platform"; userId?: string };

const globalForTenant = globalThis as unknown as {
  lanePulseTenantStorage?: AsyncLocalStorage<TenantContext>;
};

// Next.js can evaluate server modules in more than one bundle. Anchoring the
// storage on globalThis keeps the Prisma extension and route helpers aligned.
const tenantStorage =
  globalForTenant.lanePulseTenantStorage ?? new AsyncLocalStorage<TenantContext>();

globalForTenant.lanePulseTenantStorage = tenantStorage;

export function runWithTenantContext<T>(
  context: TenantContext,
  callback: () => T,
): T {
  return tenantStorage.run(context, callback);
}

export function getTenantContext() {
  return tenantStorage.getStore();
}

export class TenantContextError extends Error {
  status = 403;
  code = "ACADEMY_MISSING";

  constructor() {
    super("An authenticated academy context is required.");
  }
}
