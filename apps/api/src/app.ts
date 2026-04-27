import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './env.js';
import prismaPlugin from './plugins/prisma.js';
import jwtPlugin from './plugins/jwt.js';
import auditPlugin from './plugins/audit.js';
import queuesPlugin from './plugins/queues.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import healthRoutes from './modules/health/routes.js';
import authRoutes from './modules/auth/routes.js';
import vercelRoutes from './modules/vercel/routes.js';
import deploymentsRoutes from './modules/deployments/routes.js';

export const buildApp = () => {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });

  app.register(prismaPlugin);
  app.register(jwtPlugin);
  app.register(auditPlugin);
  app.register(queuesPlugin);
  app.register(errorHandlerPlugin);

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(vercelRoutes);
  app.register(deploymentsRoutes);

  return app;
};
