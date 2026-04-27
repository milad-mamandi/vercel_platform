import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (request: FastifyRequest) => Promise<void>;
    audit: {
      log: (payload: {
        actorUserId?: string;
        action: string;
        entityType: string;
        entityId?: string;
        metadata?: Prisma.InputJsonValue;
      }) => Promise<void>;
    };
    queues: {
      deploymentQueue: Queue;
      connectionQueue: Queue;
      simulatorQueue: Queue;
    };
  }

  interface FastifyJWT {
    payload: {
      sub: string;
      email: string;
      roles: string[];
    };
    user: {
      sub: string;
      email: string;
      roles: string[];
    };
  }
}
