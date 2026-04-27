import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../env.js';
import { PrismaClient } from '@prisma/client';
import { revalidateConnection } from '../modules/vercel/service.js';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const connectionJobsQueue = new Queue('connection-jobs', { connection });

const worker = new Worker(
  'deployment-jobs',
  async (job) => {
    // Milestone 1 placeholder worker process.
    return { accepted: true, jobName: job.name, data: job.data };
  },
  { connection }
);

worker.on('completed', (job) => {
  console.log(`[worker] completed job ${job?.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker] failed job ${job?.id}`, err);
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
      return { accepted: true, note: 'Usage sync worker placeholder until Milestone 4' };
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
