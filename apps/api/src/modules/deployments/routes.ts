import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';

const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  sourceType: z.enum(['folder', 'zip', 'repo', 'generated']).default('generated'),
  artifactContent: z.string().min(1).optional(),
  variablesSchema: z.record(z.unknown()).optional()
});

const deploymentSchema = z.object({
  templateId: z.string().cuid(),
  connectionId: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  target: z.enum(['preview', 'production']).default('preview'),
  renderPayload: z.record(z.unknown()).optional()
});

const paramsSchema = z.object({ id: z.string().cuid() });

const serializeTemplate = (row: {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  artifactPath: string;
  variablesSchema: unknown;
  createdAt: Date;
  updatedAt: Date;
}) => row;

const serializeDeployment = (row: {
  id: string;
  templateId: string;
  connectionId: string;
  name: string;
  target: string;
  status: string;
  deploymentUrl: string | null;
  deploymentDomain: string | null;
  logs: unknown;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  template?: { name: string };
  connection?: { name: string };
}) => row;

const deploymentsRoutes: FastifyPluginAsync = async (app) => {
  app.register(async (instance) => {
    instance.addHook('preHandler', instance.authenticate);

    instance.post('/api/templates', async (request, reply) => {
      const body = templateSchema.parse(request.body);
      const userId = String((request.user as { sub: string }).sub);

      await mkdir(env.TEMPLATE_ARTIFACT_DIR, { recursive: true });
      const artifactFileName = `${randomUUID()}.json`;
      const artifactPath = join(env.TEMPLATE_ARTIFACT_DIR, artifactFileName);
      await writeFile(
        artifactPath,
        body.artifactContent ?? JSON.stringify({ starter: true, templateName: body.name }, null, 2),
        'utf8'
      );

      const template = await instance.prisma.deploymentTemplate.create({
        data: {
          userId,
          name: body.name,
          description: body.description,
          sourceType: body.sourceType,
          artifactPath,
          variablesSchema: body.variablesSchema as object | undefined
        }
      });

      await instance.audit.log({
        actorUserId: userId,
        action: 'template.create',
        entityType: 'deployment_template',
        entityId: template.id,
        metadata: { name: body.name, sourceType: body.sourceType }
      });

      return reply.status(201).send(serializeTemplate(template));
    });

    instance.get('/api/templates', async (request) => {
      const userId = String((request.user as { sub: string }).sub);
      const templates = await instance.prisma.deploymentTemplate.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });

      return templates.map(serializeTemplate);
    });

    instance.post('/api/deployments', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const body = deploymentSchema.parse(request.body);

      const [template, connection] = await Promise.all([
        instance.prisma.deploymentTemplate.findFirst({ where: { id: body.templateId, userId } }),
        instance.prisma.vercelConnection.findFirst({ where: { id: body.connectionId, userId } })
      ]);

      if (!template) {
        return reply.status(404).send({ message: 'Template not found' });
      }

      if (!connection) {
        return reply.status(404).send({ message: 'Connection not found' });
      }

      const deployment = await instance.prisma.deploymentJob.create({
        data: {
          userId,
          templateId: body.templateId,
          connectionId: body.connectionId,
          name: body.name,
          target: body.target,
          status: 'queued',
          renderPayload: body.renderPayload as object | undefined,
          logs: [{ at: new Date().toISOString(), message: 'Deployment queued' }]
        },
        include: {
          template: { select: { name: true } },
          connection: { select: { name: true } }
        }
      });

      await instance.queues.deploymentQueue.add(
        'render-template',
        { deploymentId: deployment.id, queuedAt: new Date().toISOString() },
        { removeOnComplete: 100, removeOnFail: 500 }
      );

      await instance.audit.log({
        actorUserId: userId,
        action: 'deployment.create',
        entityType: 'deployment_job',
        entityId: deployment.id,
        metadata: { templateId: body.templateId, connectionId: body.connectionId, target: body.target }
      });

      return reply.status(201).send(serializeDeployment(deployment));
    });

    instance.get('/api/deployments', async (request) => {
      const userId = String((request.user as { sub: string }).sub);
      const rows = await instance.prisma.deploymentJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { name: true } },
          connection: { select: { name: true } }
        }
      });

      return rows.map(serializeDeployment);
    });

    instance.get('/api/deployments/:id', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const row = await instance.prisma.deploymentJob.findFirst({
        where: { id, userId },
        include: {
          template: { select: { name: true } },
          connection: { select: { name: true } }
        }
      });

      if (!row) {
        return reply.status(404).send({ message: 'Deployment not found' });
      }

      return serializeDeployment(row);
    });
  });
};

export default deploymentsRoutes;
