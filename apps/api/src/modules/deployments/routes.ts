import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

const templateVersionSchema = z.object({
  artifactContent: z.string().min(1).optional(),
  variablesSchema: z.record(z.unknown()).optional(),
  changelog: z.string().trim().max(1000).optional()
});

const deploymentSchema = z.object({
  templateId: z.string().cuid(),
  templateVersionId: z.string().cuid().optional(),
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

const serializeTemplateVersion = (row: {
  id: string;
  templateId: string;
  version: number;
  artifactPath: string;
  variablesSchema: unknown;
  changelog: string | null;
  createdAt: Date;
}) => row;

const serializeDeployment = (row: {
  id: string;
  templateId: string;
  templateVersionId: string | null;
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
  templateVersion?: { version: number } | null;
  connection?: { name: string };
}) => row;

const validatePayloadAgainstSchema = (payload: Record<string, unknown> | undefined, schemaValue: unknown) => {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) {
    return;
  }

  const schema = schemaValue as { properties?: Record<string, { type?: string }>; required?: string[] };
  if (!schema.properties && !schema.required) {
    return;
  }

  const data = payload ?? {};
  for (const requiredField of schema.required ?? []) {
    if (!(requiredField in data)) {
      throw new Error(`Missing required payload field: ${requiredField}`);
    }
  }

  for (const [key, fieldSchema] of Object.entries(schema.properties ?? {})) {
    if (!(key in data) || fieldSchema.type === undefined) {
      continue;
    }

    const value = data[key];
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    const normalizedType = actualType === 'number' && Number.isInteger(value) ? 'integer' : actualType;

    if (fieldSchema.type === 'number' && typeof value === 'number') {
      continue;
    }

    if (normalizedType !== fieldSchema.type) {
      throw new Error(`Payload field \"${key}\" must be ${fieldSchema.type}`);
    }
  }
};

const renderPreview = (templateBody: string, renderPayload: Record<string, unknown> | undefined) => {
  const payload = renderPayload ?? {};

  let previewText = templateBody;
  for (const [key, value] of Object.entries(payload)) {
    const token = `{{${key}}}`;
    previewText = previewText.split(token).join(typeof value === 'string' ? value : JSON.stringify(value));
  }

  return {
    previewText,
    unresolvedPlaceholders: Array.from(new Set(previewText.match(/{{\s*[^}]+\s*}}/g) ?? []))
  };
};

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

      const created = await instance.prisma.$transaction(async (tx) => {
        const template = await tx.deploymentTemplate.create({
          data: {
            userId,
            name: body.name,
            description: body.description,
            sourceType: body.sourceType,
            artifactPath,
            variablesSchema: body.variablesSchema as object | undefined
          }
        });

        const version = await tx.deploymentTemplateVersion.create({
          data: {
            templateId: template.id,
            version: 1,
            artifactPath,
            variablesSchema: body.variablesSchema as object | undefined,
            changelog: 'Initial version'
          }
        });

        return { template, version };
      });

      await instance.audit.log({
        actorUserId: userId,
        action: 'template.create',
        entityType: 'deployment_template',
        entityId: created.template.id,
        metadata: { name: body.name, sourceType: body.sourceType, initialVersionId: created.version.id }
      });

      return reply.status(201).send({
        ...serializeTemplate(created.template),
        latestVersion: serializeTemplateVersion(created.version)
      });
    });

    instance.get('/api/templates', async (request) => {
      const userId = String((request.user as { sub: string }).sub);
      const templates = await instance.prisma.deploymentTemplate.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          versions: { take: 1, orderBy: { version: 'desc' } }
        }
      });

      return templates.map((item) => ({
        ...serializeTemplate(item),
        latestVersion: item.versions[0] ? serializeTemplateVersion(item.versions[0]) : null
      }));
    });

    instance.get('/api/templates/:id/versions', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const template = await instance.prisma.deploymentTemplate.findFirst({ where: { id, userId } });
      if (!template) {
        return reply.status(404).send({ message: 'Template not found' });
      }

      const versions = await instance.prisma.deploymentTemplateVersion.findMany({
        where: { templateId: id },
        orderBy: { version: 'desc' }
      });

      return versions.map(serializeTemplateVersion);
    });

    instance.post('/api/templates/:id/versions', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);
      const body = templateVersionSchema.parse(request.body);

      const template = await instance.prisma.deploymentTemplate.findFirst({ where: { id, userId } });
      if (!template) {
        return reply.status(404).send({ message: 'Template not found' });
      }

      await mkdir(env.TEMPLATE_ARTIFACT_DIR, { recursive: true });
      const artifactFileName = `${randomUUID()}.json`;
      const artifactPath = join(env.TEMPLATE_ARTIFACT_DIR, artifactFileName);
      await writeFile(artifactPath, body.artifactContent ?? (await readFile(template.artifactPath, 'utf8')), 'utf8');

      const lastVersion = await instance.prisma.deploymentTemplateVersion.findFirst({
        where: { templateId: id },
        orderBy: { version: 'desc' }
      });

      const version = await instance.prisma.deploymentTemplateVersion.create({
        data: {
          templateId: id,
          version: (lastVersion?.version ?? 0) + 1,
          artifactPath,
          variablesSchema: (body.variablesSchema as object | undefined) ?? (template.variablesSchema as object | undefined),
          changelog: body.changelog
        }
      });

      if (version.version > 0) {
        await instance.prisma.deploymentTemplate.update({
          where: { id },
          data: {
            artifactPath,
            variablesSchema: version.variablesSchema as object | undefined
          }
        });
      }

      await instance.audit.log({
        actorUserId: userId,
        action: 'template.version.create',
        entityType: 'deployment_template',
        entityId: id,
        metadata: { version: version.version, versionId: version.id }
      });

      return reply.status(201).send(serializeTemplateVersion(version));
    });

    instance.post('/api/templates/:id/preview', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);
      const body = z.object({
        templateVersionId: z.string().cuid().optional(),
        renderPayload: z.record(z.unknown()).optional()
      }).parse(request.body);

      const template = await instance.prisma.deploymentTemplate.findFirst({ where: { id, userId } });
      if (!template) {
        return reply.status(404).send({ message: 'Template not found' });
      }

      let selectedVersion = body.templateVersionId
        ? await instance.prisma.deploymentTemplateVersion.findFirst({
            where: { id: body.templateVersionId, templateId: id }
          })
        : await instance.prisma.deploymentTemplateVersion.findFirst({
            where: { templateId: id },
            orderBy: { version: 'desc' }
          });

      if (!selectedVersion) {
        return reply.status(404).send({ message: 'Template version not found' });
      }

      validatePayloadAgainstSchema(body.renderPayload, selectedVersion.variablesSchema ?? template.variablesSchema);
      const artifactText = await readFile(selectedVersion.artifactPath, 'utf8').catch(() => '{}');

      return {
        templateId: id,
        templateVersionId: selectedVersion.id,
        version: selectedVersion.version,
        ...renderPreview(artifactText, body.renderPayload)
      };
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

      const templateVersion = body.templateVersionId
        ? await instance.prisma.deploymentTemplateVersion.findFirst({ where: { id: body.templateVersionId, templateId: body.templateId } })
        : await instance.prisma.deploymentTemplateVersion.findFirst({ where: { templateId: body.templateId }, orderBy: { version: 'desc' } });

      if (!templateVersion) {
        return reply.status(400).send({ message: 'No template version exists for this template' });
      }

      try {
        validatePayloadAgainstSchema(body.renderPayload, templateVersion.variablesSchema ?? template.variablesSchema);
      } catch (error) {
        return reply.status(400).send({ message: (error as Error).message });
      }

      const deployment = await instance.prisma.deploymentJob.create({
        data: {
          userId,
          templateId: body.templateId,
          templateVersionId: templateVersion.id,
          connectionId: body.connectionId,
          name: body.name,
          target: body.target,
          status: 'queued',
          renderPayload: body.renderPayload as object | undefined,
          logs: [{ at: new Date().toISOString(), message: `Deployment queued for template version ${templateVersion.version}` }]
        },
        include: {
          template: { select: { name: true } },
          templateVersion: { select: { version: true } },
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
        metadata: {
          templateId: body.templateId,
          templateVersionId: templateVersion.id,
          connectionId: body.connectionId,
          target: body.target
        }
      });

      return reply.status(201).send(serializeDeployment(deployment));
    });

    instance.post('/api/deployments/:id/retry', async (request, reply) => {
      const userId = String((request.user as { sub: string }).sub);
      const { id } = paramsSchema.parse(request.params);

      const original = await instance.prisma.deploymentJob.findFirst({ where: { id, userId } });
      if (!original) {
        return reply.status(404).send({ message: 'Deployment not found' });
      }

      const retried = await instance.prisma.deploymentJob.create({
        data: {
          userId,
          templateId: original.templateId,
          templateVersionId: original.templateVersionId,
          connectionId: original.connectionId,
          name: `${original.name} (retry)`,
          target: original.target,
          status: 'queued',
          renderPayload: original.renderPayload as object | undefined,
          logs: [{ at: new Date().toISOString(), message: `Retry queued from deployment ${original.id}` }]
        },
        include: {
          template: { select: { name: true } },
          templateVersion: { select: { version: true } },
          connection: { select: { name: true } }
        }
      });

      await instance.queues.deploymentQueue.add(
        'render-template',
        { deploymentId: retried.id, queuedAt: new Date().toISOString(), retriedFrom: original.id },
        { removeOnComplete: 100, removeOnFail: 500 }
      );

      return reply.status(201).send(serializeDeployment(retried));
    });

    instance.get('/api/deployments', async (request) => {
      const userId = String((request.user as { sub: string }).sub);
      const rows = await instance.prisma.deploymentJob.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { name: true } },
          templateVersion: { select: { version: true } },
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
          templateVersion: { select: { version: true } },
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
