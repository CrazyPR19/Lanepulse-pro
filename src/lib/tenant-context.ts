import { AsyncLocalStorage } from "node:async_hooks";

type TenantContext =
  | { mode: "academy"; academyId: string }
  | { mode: "platform" };

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function enterAcademyContext(academyId: string) {
  tenantStorage.enterWith({ mode: "academy", academyId });
}

export function enterPlatformContext() {
  tenantStorage.enterWith({ mode: "platform" });
}

export function getTenantContext() {
  return tenantStorage.getStore();
}

export class TenantContextError extends Error {
  status = 403;

  constructor() {
    super("An authenticated academy context is required.");
  }
}
