import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  providerConfig: z
    .object({
      accountProvider: z.enum(['mock-basic', 'mock-advanced']).default('mock-basic'),
      emailProvider: z.enum(['mock-mailbox']).default('mock-mailbox'),
      phoneProvider: z.enum(['mock-sms']).default('mock-sms'),
      proxyProvider: z.enum(['mock-proxy-pool']).default('mock-proxy-pool')
    })
    .optional()
});

const paramsSchema = z.object({ id: z.string().cuid() });

const simulatorRoutes: FastifyPluginAsync = async (app) => {
  app.register(async (instance) => {
    instance.addHook('preHandler', instance.authenticate);

    instance.post('/api/simulations', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const body = createSchema.parse(request.body);

      const run = await instance.prisma.simulatorRun.create({
        data: {
          userId,
          name: body.name,
          providerConfig: body.providerConfig as object | undefined,
          status: 'queued',
          logs: [{ at: new Date().toISOString(), message: 'Simulation queued' }]
        }
      });

      await instance.queues.simulatorQueue.add(
        'run-simulation',
        { runId: run.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 500 }
      );

      return reply.status(201).send(run);
    });

    instance.get('/api/simulations', async (request) => {
      const userId = String((request.user as { sub: string }).sub);
      return instance.prisma.simulatorRun.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    });

    instance.post('/api/simulations/:id/start', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const run = await instance.prisma.simulatorRun.findFirst({ where: { id, userId } });
      if (!run) {
        return reply.status(404).send({ message: 'Simulation not found' });
      }

      await instance.prisma.simulatorRun.update({ where: { id }, data: { status: 'queued', errorMessage: null } });
      await instance.queues.simulatorQueue.add(
        'run-simulation',
        { runId: id },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 500 }
      );

      return { message: 'Simulation start queued', id };
    });

    instance.post('/api/simulations/:id/cancel', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const run = await instance.prisma.simulatorRun.findFirst({ where: { id, userId } });
      if (!run) {
        return reply.status(404).send({ message: 'Simulation not found' });
      }

      const existingLogs = Array.isArray(run.logs) ? run.logs : [];
      const updated = await instance.prisma.simulatorRun.update({
        where: { id },
        data: {
          status: 'canceled',
          logs: [...existingLogs, { at: new Date().toISOString(), message: 'Simulation canceled by user' }]
        }
      });

      return updated;
    });
  });
};

export default simulatorRoutes;
