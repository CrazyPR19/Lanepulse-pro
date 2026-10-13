import { PrismaClient } from '@prisma/client'
import { getTenantContext, TenantContextError } from '@/lib/tenant-context'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const systemDb =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = systemDb

const academyOwnedModels = new Set([
  'Academy',
  'AcademySettings',
  'User',
  'Swimmer',
  'SwimmingStyle',
  'TrainingGroup',
  'GroupMember',
  'TrainingSession',
  'SessionLane',
  'SessionLap',
  'PerformanceNote',
  'AuditLog',
  'ParentSwimmer',
  'TrainingPlan',
  'TrainingPlanSet',
  'PracticeRun',
  'PracticeRunGroup',
  'PracticeRunGroupRepeat',
  'PracticeRunResult',
  'PracticeRunLap',
])

const whereOperations = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy',
])

function tenantArgs(model: string, operation: string, args: unknown, academyId: string): unknown {
  const scoped = { ...((args ?? {}) as Record<string, unknown>) }
  const tenantWhere = model === 'Academy'
    ? { id: academyId }
    : model === 'TrainingPlanSet'
      ? { plan: { academyId } }
      : { academyId }

  if (whereOperations.has(operation)) {
    scoped.where = {
      ...((scoped.where ?? {}) as Record<string, unknown>),
      ...tenantWhere,
    }
  } else if (operation === 'create' && model !== 'TrainingPlanSet' && model !== 'Academy') {
    scoped.data = {
      ...((scoped.data ?? {}) as Record<string, unknown>),
      academyId,
    }
  } else if (operation === 'createMany' && model !== 'TrainingPlanSet' && model !== 'Academy') {
    const data = scoped.data
    scoped.data = Array.isArray(data)
      ? data.map((row) => ({ ...(row as Record<string, unknown>), academyId }))
      : { ...((data ?? {}) as Record<string, unknown>), academyId }
  } else if (operation === 'upsert' && model !== 'TrainingPlanSet' && model !== 'Academy') {
    scoped.where = {
      ...((scoped.where ?? {}) as Record<string, unknown>),
      academyId,
    }
    scoped.create = {
      ...((scoped.create ?? {}) as Record<string, unknown>),
      academyId,
    }
  }

  return scoped
}

export const db = systemDb.$extends({
  name: 'academyTenantIsolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!academyOwnedModels.has(model)) return query(args)

        const context = getTenantContext()
        if (model === 'Swimmer' || model === 'User') {
          console.info(`[TENANT] prisma-context=${context?.mode === 'academy'}`)
        }
        if (context?.mode === 'platform') return query(args)
        if (!context || context.mode !== 'academy') throw new TenantContextError()

        return query(tenantArgs(model, operation, args, context.academyId) as typeof args)
      },
    },
  },
})
