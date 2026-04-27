import type { Prisma } from '@prisma/client';
import fp from 'fastify-plugin';

export default fp(async (app) => {
  app.decorate('audit', {
    log: async (payload: {
      actorUserId?: string;
      action: string;
      entityType: string;
      entityId?: string;
      metadata?: Prisma.InputJsonValue;
    }) => {
      await app.prisma.auditEvent.create({
        data: {
          actorUserId: payload.actorUserId,
          action: payload.action,
          entityType: payload.entityType,
          entityId: payload.entityId,
          metadata: payload.metadata as Prisma.InputJsonValue | undefined
        }
      });
    }
  });
});
