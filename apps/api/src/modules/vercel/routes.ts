import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createEncryptedConnectionToken, revalidateConnection } from './service.js';
import { requireRole } from '../auth/requireRole.js';

const createConnectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  token: z.string().trim().min(10),
  teamId: z.string().trim().min(1).max(120).optional(),
  teamSlug: z.string().trim().min(1).max(120).optional(),
  plan: z.string().trim().min(1).max(120).optional()
});

const updateConnectionSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    teamId: z.string().trim().min(1).max(120).nullable().optional(),
    teamSlug: z.string().trim().min(1).max(120).nullable().optional(),
    plan: z.string().trim().min(1).max(120).nullable().optional(),
    tokenStatus: z.enum(['valid', 'invalid', 'unknown']).optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be supplied');

const paramsSchema = z.object({ id: z.string().cuid() });

const redactConnection = (connection: {
  id: string;
  name: string;
  vercelUserId: string | null;
  vercelEmail: string | null;
  vercelUsername: string | null;
  teamId: string | null;
  teamSlug: string | null;
  plan: string | null;
  tokenStatus: string;
  lastValidatedAt: Date | null;
  lastHealthCheckAt: Date | null;
  lastUsageSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...connection,
  tokenPreview: '••••••••'
});

const vercelRoutes: FastifyPluginAsync = async (app) => {
  app.register(async (instance) => {
    instance.addHook('preHandler', instance.authenticate);

    instance.post('/api/vercel/connections', async (request, reply) => {
      const body = createConnectionSchema.parse(request.body);
      const userId = String((request.user as { sub: string }).sub);
      const connection = await instance.prisma.vercelConnection.create({
        data: {
          userId,
          name: body.name,
          teamId: body.teamId,
          teamSlug: body.teamSlug,
          plan: body.plan,
          encryptedToken: createEncryptedConnectionToken(body.token),
          tokenStatus: 'unknown'
        },
        select: {
          id: true,
          name: true,
          vercelUserId: true,
          vercelEmail: true,
          vercelUsername: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
          lastHealthCheckAt: true,
          lastUsageSyncAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      await instance.audit.log({
        actorUserId: userId,
        action: 'vercel.connection.create',
        entityType: 'vercel_connection',
        entityId: connection.id,
        metadata: { name: connection.name, teamId: connection.teamId, teamSlug: connection.teamSlug }
      });

      return reply.status(201).send(redactConnection(connection));
    });

    instance.get('/api/vercel/connections', async (request) => {
      const userId = String((request.user as { sub: string }).sub);

      const connections = await instance.prisma.vercelConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          vercelUserId: true,
          vercelEmail: true,
          vercelUsername: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
          lastHealthCheckAt: true,
          lastUsageSyncAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return connections.map(redactConnection);
    });

    instance.get('/api/vercel/connections/:id', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const connection = await instance.prisma.vercelConnection.findFirst({
        where: { id, userId },
        select: {
          id: true,
          name: true,
          vercelUserId: true,
          vercelEmail: true,
          vercelUsername: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
          lastHealthCheckAt: true,
          lastUsageSyncAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!connection) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      return redactConnection(connection);
    });

    instance.patch('/api/vercel/connections/:id', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);
      const body = updateConnectionSchema.parse(request.body);

      const existing = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!existing) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const updated = await instance.prisma.vercelConnection.update({
        where: { id },
        data: body,
        select: {
          id: true,
          name: true,
          vercelUserId: true,
          vercelEmail: true,
          vercelUsername: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
          lastHealthCheckAt: true,
          lastUsageSyncAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      await instance.audit.log({
        actorUserId: userId,
        action: 'vercel.connection.update',
        entityType: 'vercel_connection',
        entityId: id,
        metadata: body
      });

      return redactConnection(updated);
    });

    instance.post('/api/vercel/connections/:id/validate', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const existing = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!existing) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const updated = await revalidateConnection(instance.prisma, id);
      if (!updated) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      await instance.audit.log({
        actorUserId: userId,
        action: 'vercel.connection.validate',
        entityType: 'vercel_connection',
        entityId: id,
        metadata: { tokenStatus: updated.tokenStatus, triggeredBy: 'manual' }
      });

      return redactConnection(updated);
    });

    instance.post('/api/vercel/connections/:id/sync-usage', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const existing = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!existing) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const queuedAt = new Date();

      await instance.queues.connectionQueue.add(
        'sync-vercel-usage',
        {
          connectionId: id,
          requestedByUserId: userId,
          queuedAt: queuedAt.toISOString()
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 100, removeOnFail: 500 }
      );

      await instance.audit.log({
        actorUserId: userId,
        action: 'vercel.connection.sync_usage',
        entityType: 'vercel_connection',
        entityId: id,
        metadata: { queuedAt: queuedAt.toISOString() }
      });

      return reply.status(202).send({
        message: 'Usage sync queued',
        connection: redactConnection(existing)
      });
    });


    instance.get('/api/vercel/connections/:id/usage/summary', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const connection = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!connection) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const latestSnapshot = await instance.prisma.usageSnapshot.findFirst({
        where: { connectionId: id },
        orderBy: { createdAt: 'desc' },
        include: { services: true }
      });
      const quotaRules = await instance.prisma.quotaRule.findMany();
      const quotaRuleMap = Object.fromEntries(quotaRules.map((rule) => [rule.serviceName, rule]));

      if (!latestSnapshot) {
        return { connectionId: id, hasData: false, services: [] };
      }

      const services = latestSnapshot.services.map((service) => {
        const rule = quotaRuleMap[service.serviceName];
        const includedLimit = service.includedLimit ?? rule?.defaultLimit ?? null;
        return {
          serviceName: service.serviceName,
          quantity: service.quantity,
          unit: service.unit,
          includedLimit,
          estimatedRemaining:
            service.estimatedRemaining ??
            (typeof includedLimit === 'number' ? Math.max(includedLimit - service.quantity, 0) : null),
          percentUsed:
            typeof includedLimit === 'number' && includedLimit > 0
              ? Math.min((service.quantity / includedLimit) * 100, 100)
              : null
        };
      });

      return {
        connectionId: id,
        hasData: true,
        snapshotId: latestSnapshot.id,
        periodStart: latestSnapshot.periodStart,
        periodEnd: latestSnapshot.periodEnd,
        createdAt: latestSnapshot.createdAt,
        services
      };
    });

    instance.get('/api/vercel/connections/:id/usage/services', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const connection = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!connection) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const query = z
        .object({
          days: z.coerce.number().int().min(1).max(365).default(30),
          serviceName: z.string().trim().min(1).optional()
        })
        .parse(request.query);

      const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
      const items = await instance.prisma.usageService.findMany({
        where: {
          connectionId: id,
          createdAt: { gte: since },
          ...(query.serviceName ? { serviceName: query.serviceName } : {})
        },
        orderBy: { createdAt: 'desc' }
      });

      return items;
    });

    instance.get('/api/vercel/connections/:id/usage/history', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const connection = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!connection) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const query = z.object({ limit: z.coerce.number().int().min(1).max(90).default(20) }).parse(request.query);

      const snapshots = await instance.prisma.usageSnapshot.findMany({
        where: { connectionId: id },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        include: {
          services: {
            select: { serviceName: true, quantity: true, unit: true, includedLimit: true, estimatedRemaining: true }
          }
        }
      });

      return snapshots;
    });

    instance.delete('/api/vercel/connections/:id', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const existing = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!existing) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      await instance.prisma.vercelConnection.delete({ where: { id } });

      await instance.audit.log({
        actorUserId: userId,
        action: 'vercel.connection.delete',
        entityType: 'vercel_connection',
        entityId: id
      });

      return reply.status(204).send();
    });
  });

  app.get('/api/admin/quota-rules', { preHandler: [requireRole(['admin'])] }, async () => {
    return app.prisma.quotaRule.findMany({ orderBy: { serviceName: 'asc' } });
  });

  app.put('/api/admin/quota-rules/:serviceName', { preHandler: [requireRole(['admin'])] }, async (request) => {
    const actorUserId = String((request.user as { sub: string }).sub);
    const { serviceName } = z.object({ serviceName: z.string().trim().min(1) }).parse(request.params);
    const body = z
      .object({
        defaultLimit: z.number().positive(),
        unit: z.string().trim().min(1),
        warningAtPct: z.number().min(1).max(100).default(80),
        criticalAtPct: z.number().min(1).max(100).default(95)
      })
      .parse(request.body);

    const rule = await app.prisma.quotaRule.upsert({
      where: { serviceName },
      update: body,
      create: { serviceName, ...body }
    });

    await app.audit.log({
      actorUserId,
      action: 'admin.quota_rule.upsert',
      entityType: 'quota_rule',
      entityId: rule.id,
      metadata: { serviceName: rule.serviceName }
    });

    return rule;
  });
};

export default vercelRoutes;
