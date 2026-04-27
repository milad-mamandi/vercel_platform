import fp from 'fastify-plugin';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../env.js';

export default fp(async (app) => {
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const deploymentQueue = new Queue('deployment-jobs', { connection });
  const connectionQueue = new Queue('connection-jobs', { connection });
  const simulatorQueue = new Queue('simulator-jobs', { connection });

  await connectionQueue.add(
    'connection-health-scan',
    { queuedAt: new Date().toISOString() },
    {
      repeat: { every: env.CONNECTION_REVALIDATION_SCHEDULE_MS },
      jobId: 'connection-health-scan-scheduler',
      removeOnComplete: 20,
      removeOnFail: 50
    }
  );

  app.decorate('queues', {
    deploymentQueue,
    connectionQueue,
    simulatorQueue
  });

  app.addHook('onClose', async () => {
    await Promise.all([
      deploymentQueue.close(),
      connectionQueue.close(),
      simulatorQueue.close()
    ]);
    await connection.quit();
  });
});
