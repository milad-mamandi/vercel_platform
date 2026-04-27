import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppRole } from '../../types.js';

export const requireRole =
  (roles: AppRole[]) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await request.jwtVerify();

    const userRoles = (((request.user as { roles?: string[] })?.roles) ?? []) as string[];
    const authorized = roles.some((role) => userRoles.includes(role));

    if (!authorized) {
      await reply.status(403).send({ message: 'Insufficient permissions' });
    }
  };
