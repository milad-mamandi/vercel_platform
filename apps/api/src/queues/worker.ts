import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../env.js';

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

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
