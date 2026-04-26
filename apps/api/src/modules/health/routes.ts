import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return { ok: true, service: 'api' };
  });
};

export default healthRoutes;
