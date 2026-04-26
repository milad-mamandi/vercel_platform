import bcrypt from 'bcryptjs';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const existing = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return reply.status(409).send({ message: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const role = await app.prisma.role.upsert({
      where: { name: 'operator' },
      update: {},
      create: { name: 'operator' }
    });

    const user = await app.prisma.user.create({
      data: {
        email: body.email,
        displayName: body.displayName,
        passwordHash,
        userRoles: {
          create: { roleId: role.id }
        }
      },
      include: {
        userRoles: { include: { role: true } }
      }
    });

    await app.audit.log({
      actorUserId: user.id,
      action: 'auth.register',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email }
    });

    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ur.role.name)
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name)
      }
    };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await app.prisma.user.findUnique({
      where: { email: body.email },
      include: { userRoles: { include: { role: true } } }
    });

    if (!user) {
      return reply.status(401).send({ message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(body.password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({ message: 'Invalid credentials' });
    }

    await app.audit.log({
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id
    });

    const token = await reply.jwtSign({
      sub: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ur.role.name)
    });

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        roles: user.userRoles.map((ur) => ur.role.name)
      }
    };
  });

  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const subject = String(request.user.sub);

    const user = await app.prisma.user.findUnique({
      where: { id: subject },
      include: { userRoles: { include: { role: true } } }
    });

    if (!user) {
      return reply.status(404).send({ message: 'User not found' });
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.userRoles.map((ur) => ur.role.name)
    };
  });
};

export default authRoutes;
