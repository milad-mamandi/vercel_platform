import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

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
  teamId: string | null;
  teamSlug: string | null;
  plan: string | null;
  tokenStatus: string;
  lastValidatedAt: Date | null;
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
      const userId = String(request.user.sub);
      const now = new Date();

      const connection = await instance.prisma.vercelConnection.create({
        data: {
          userId,
          name: body.name,
          teamId: body.teamId,
          teamSlug: body.teamSlug,
          plan: body.plan,
          encryptedToken: Buffer.from(body.token).toString('base64'),
          tokenStatus: 'unknown',
          lastValidatedAt: now
        },
        select: {
          id: true,
          name: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
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
      const userId = String(request.user.sub);

      const connections = await instance.prisma.vercelConnection.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
          lastUsageSyncAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return connections.map(redactConnection);
    });

    instance.get('/api/vercel/connections/:id', async (request, reply) => {
      const userId = String(request.user.sub);
      const { id } = paramsSchema.parse(request.params);

      const connection = await instance.prisma.vercelConnection.findFirst({
        where: { id, userId },
        select: {
          id: true,
          name: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
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
      const userId = String(request.user.sub);
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
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
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
      const userId = String(request.user.sub);
      const { id } = paramsSchema.parse(request.params);

      const existing = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!existing) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const rawToken = Buffer.from(existing.encryptedToken, 'base64').toString('utf8');
      const nextStatus: 'valid' | 'invalid' = rawToken.length >= 10 ? 'valid' : 'invalid';

      const updated = await instance.prisma.vercelConnection.update({
        where: { id },
        data: { tokenStatus: nextStatus, lastValidatedAt: new Date() },
        select: {
          id: true,
          name: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
          lastUsageSyncAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      await instance.audit.log({
        actorUserId: userId,
        action: 'vercel.connection.validate',
        entityType: 'vercel_connection',
        entityId: id,
        metadata: { tokenStatus: nextStatus }
      });

      return redactConnection(updated);
    });

    instance.post('/api/vercel/connections/:id/sync-usage', async (request, reply) => {
      const userId = String(request.user.sub);
      const { id } = paramsSchema.parse(request.params);

      const existing = await instance.prisma.vercelConnection.findFirst({ where: { id, userId } });
      if (!existing) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const syncedAt = new Date();
      await instance.queues.connectionQueue.add(
        'sync-vercel-usage',
        {
          connectionId: id,
          requestedByUserId: userId,
          queuedAt: syncedAt.toISOString()
        },
        {
          removeOnComplete: 100,
          removeOnFail: 500
        }
      );

      const updated = await instance.prisma.vercelConnection.update({
        where: { id },
        data: { lastUsageSyncAt: syncedAt },
        select: {
          id: true,
          name: true,
          teamId: true,
          teamSlug: true,
          plan: true,
          tokenStatus: true,
          lastValidatedAt: true,
          lastUsageSyncAt: true,
          createdAt: true,
          updatedAt: true
        }
      });

      await instance.audit.log({
        actorUserId: userId,
        action: 'vercel.connection.sync_usage',
        entityType: 'vercel_connection',
        entityId: id,
        metadata: { queuedAt: syncedAt.toISOString() }
      });

      return reply.status(202).send({
        message: 'Usage sync queued',
        connection: redactConnection(updated)
      });
    });

    instance.delete('/api/vercel/connections/:id', async (request, reply) => {
      const userId = String(request.user.sub);
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
};

export default vercelRoutes;
