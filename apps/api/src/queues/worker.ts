import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../env.js';
import { PrismaClient } from '@prisma/client';
import { revalidateConnection } from '../modules/vercel/service.js';
import { syncUsageSnapshot } from '../modules/vercel/usage.js';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const connectionJobsQueue = new Queue('connection-jobs', { connection });
const deploymentJobsQueue = new Queue('deployment-jobs', { connection });

const appendLog = async (deploymentId: string, message: string) => {
  const row = await prisma.deploymentJob.findUnique({ where: { id: deploymentId }, select: { logs: true } });
  const current = Array.isArray(row?.logs) ? row.logs : [];
  const next = [...current, { at: new Date().toISOString(), message }];
  await prisma.deploymentJob.update({ where: { id: deploymentId }, data: { logs: next } });
};

const worker = new Worker(
  'deployment-jobs',
  async (job) => {
    const payload = job.data as { deploymentId?: string };
    if (!payload.deploymentId) {
      return { skipped: true, reason: 'missing_deployment_id' };
    }

    const deployment = await prisma.deploymentJob.findUnique({
      where: { id: payload.deploymentId },
      include: { template: true, templateVersion: true }
    });

    if (!deployment) {
      return { skipped: true, reason: 'missing_deployment' };
    }

    if (job.name === 'render-template') {
      await prisma.deploymentJob.update({ where: { id: deployment.id }, data: { status: 'rendering' } });
      await appendLog(deployment.id, 'Rendering template started');

      await mkdir(env.TEMPLATE_ARTIFACT_DIR, { recursive: true });
      const renderedPath = join(env.TEMPLATE_ARTIFACT_DIR, `rendered-${deployment.id}.json`);
      const artifactPath = deployment.templateVersion?.artifactPath ?? deployment.template.artifactPath;
      const templateSource = await readFile(artifactPath, 'utf8').catch(() => '{}');
      const rendered = {
        templateSource,
        payload: deployment.renderPayload,
        target: deployment.target,
        renderedAt: new Date().toISOString()
      };
      await writeFile(renderedPath, JSON.stringify(rendered, null, 2), 'utf8');

      await prisma.deploymentJob.update({ where: { id: deployment.id }, data: { renderedArtifactPath: renderedPath } });
      await appendLog(deployment.id, 'Rendering template complete');
      await deploymentJobsQueue.add('deploy-project', { deploymentId: deployment.id }, { removeOnComplete: 100, removeOnFail: 500 });
      return { deploymentId: deployment.id, stage: 'rendered' };
    }

    if (job.name === 'deploy-project') {
      await prisma.deploymentJob.update({ where: { id: deployment.id }, data: { status: 'deploying' } });
      await appendLog(deployment.id, 'Deploying rendered project (simulated)');

      const providerDeploymentId = `dep_${deployment.id.slice(0, 10)}`;
      const deploymentDomain = `${deployment.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${deployment.id.slice(0, 6)}.vercel.app`;
      const deploymentUrl = `https://${deploymentDomain}`;

      await prisma.deploymentJob.update({
        where: { id: deployment.id },
        data: { providerDeploymentId, deploymentDomain, deploymentUrl }
      });

      await appendLog(deployment.id, `Deployment accepted by provider as ${providerDeploymentId}`);
      await deploymentJobsQueue.add(
        'poll-deployment-status',
        { deploymentId: deployment.id, pollCount: 1 },
        { delay: 1500, removeOnComplete: 100, removeOnFail: 500 }
      );

      return { deploymentId: deployment.id, stage: 'deploying' };
    }

    if (job.name === 'poll-deployment-status') {
      const pollCount = Number((job.data as { pollCount?: number }).pollCount ?? 1);

      if (pollCount < 2) {
        await appendLog(deployment.id, `Poll attempt ${pollCount}: deployment still building`);
        await deploymentJobsQueue.add(
          'poll-deployment-status',
          { deploymentId: deployment.id, pollCount: pollCount + 1 },
          { delay: 1500, removeOnComplete: 100, removeOnFail: 500 }
        );
        return { deploymentId: deployment.id, stage: 'polling', pollCount };
      }

      await prisma.deploymentJob.update({ where: { id: deployment.id }, data: { status: 'ready', errorMessage: null } });
      await appendLog(deployment.id, 'Deployment reached READY status');
      await connectionJobsQueue.add(
        'sync-vercel-usage',
        { connectionId: deployment.connectionId, queuedAt: new Date().toISOString(), triggeredBy: 'deployment-ready' },
        { removeOnComplete: 100, removeOnFail: 500 }
      );
      return { deploymentId: deployment.id, stage: 'ready' };
    }

    return { skipped: true, reason: `unsupported_job_${job.name}` };
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`[worker] completed job ${job?.id}`);
});

worker.on('failed', async (job, err) => {
  console.error(`[worker] failed job ${job?.id}`, err);

  const payload = job?.data as { deploymentId?: string } | undefined;
  if (!payload?.deploymentId) {
    return;
  }

  await prisma.deploymentJob.update({
    where: { id: payload.deploymentId },
    data: { status: 'failed', errorMessage: err.message }
  });
  await appendLog(payload.deploymentId, `Deployment failed: ${err.message}`);
});

const connectionWorker = new Worker(
  'connection-jobs',
  async (job) => {
    if (job.name === 'connection-health-scan') {
      const staleCutoff = new Date(Date.now() - env.CONNECTION_STALE_AFTER_MS);
      const staleConnections = await prisma.vercelConnection.findMany({
        where: {
          OR: [{ lastValidatedAt: null }, { lastValidatedAt: { lt: staleCutoff } }]
        },
        select: { id: true }
      });

      await Promise.all(
        staleConnections.map((item: { id: string }) =>
          connectionJobsQueue.add(
            'revalidate-connection',
            { connectionId: item.id, queuedAt: new Date().toISOString() },
            { removeOnComplete: 100, removeOnFail: 500 }
          )
        )
      );

      return { scanned: staleConnections.length };
    }

    if (job.name === 'revalidate-connection') {
      const payload = job.data as { connectionId?: string };
      if (!payload.connectionId) {
        return { skipped: true, reason: 'missing_connection_id' };
      }

      const updated = await revalidateConnection(prisma, payload.connectionId);
      return { connectionId: payload.connectionId, tokenStatus: updated?.tokenStatus ?? 'missing' };
    }

    if (job.name === 'sync-vercel-usage') {
      const payload = job.data as { connectionId?: string };
      if (!payload.connectionId) {
        return { skipped: true, reason: 'missing_connection_id' };
      }

      const snapshot = await syncUsageSnapshot(prisma, payload.connectionId);
      return { connectionId: payload.connectionId, snapshotId: snapshot?.id ?? null };
    }

    return { skipped: true, reason: `unsupported_job_${job.name}` };
  },
  { connection }
);

connectionWorker.on('completed', (job) => {
  console.log(`[connection-worker] completed job ${job?.id}`);
});

connectionWorker.on('failed', (job, err) => {
  console.error(`[connection-worker] failed job ${job?.id}`, err);
});
