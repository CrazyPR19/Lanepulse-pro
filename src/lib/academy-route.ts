import { errorResponse } from "@/lib/api";
import { withAuthenticatedAcademy } from "@/lib/session";

type RouteResult = Response | Promise<Response>;

/** Wrap a Next.js route so all tenant-aware Prisma calls share one ALS scope. */
export function withAuthenticatedAcademyRoute<TArgs extends unknown[]>(
  handler: (...args: TArgs) => RouteResult,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await withAuthenticatedAcademy(async () => {
        return await handler(...args);
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
