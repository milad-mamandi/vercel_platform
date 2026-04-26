import fp from 'fastify-plugin';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../env.js';

export default fp(async (app) => {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

  const deploymentQueue = new Queue('deployment-jobs', { connection });
  const connectionQueue = new Queue('connection-jobs', { connection });
  const simulatorQueue = new Queue('simulator-jobs', { connection });

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
