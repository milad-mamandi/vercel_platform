import bcrypt from 'bcryptjs';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { requireRole } from './requireRole.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const assignRoleSchema = z.object({
  role: z.enum(['admin', 'operator', 'viewer'])
});

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/api/auth/seed-admin', async (request, reply) => {
    if (!env.ADMIN_SEED_KEY) {
      return reply.status(400).send({ message: 'ADMIN_SEED_KEY is not configured' });
    }

    const body = z.object({ email: z.string().email(), seedKey: z.string().min(1) }).parse(request.body);
    if (body.seedKey !== env.ADMIN_SEED_KEY) {
      return reply.status(403).send({ message: 'Invalid seed key' });
    }

    const user = await app.prisma.user.findUnique({
      where: { email: body.email },
      include: { userRoles: { include: { role: true } } }
    });

    if (!user) {
      return reply.status(404).send({ message: 'User not found' });
    }

    const adminRole = await app.prisma.role.upsert({ where: { name: 'admin' }, update: {}, create: { name: 'admin' } });
    await app.prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
      update: {},
      create: { userId: user.id, roleId: adminRole.id }
    });

    await app.audit.log({
      actorUserId: user.id,
      action: 'auth.seed_admin',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email }
    });

    return { message: 'Admin role assigned' };
  });

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
    const subject = String((request.user as { sub: string }).sub);

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

  app.get('/api/admin/users', { preHandler: [requireRole(['admin'])] }, async () => {
    const users = await app.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: { userRoles: { include: { role: true } } }
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.userRoles.map((item) => item.role.name)
    }));
  });

  app.post('/api/admin/users/:id/roles', { preHandler: [requireRole(['admin'])] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().cuid() }).parse(request.params);
    const { role } = assignRoleSchema.parse(request.body);
    const actorId = String((request.user as { sub: string }).sub);

    const user = await app.prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.status(404).send({ message: 'User not found' });
    }

    const roleRow = await app.prisma.role.upsert({ where: { name: role }, update: {}, create: { name: role } });
    await app.prisma.userRole.upsert({
      where: { userId_roleId: { userId: id, roleId: roleRow.id } },
      update: {},
      create: { userId: id, roleId: roleRow.id }
    });

    await app.audit.log({
      actorUserId: actorId,
      action: 'admin.user.role.assign',
      entityType: 'user',
      entityId: id,
      metadata: { role }
    });

    return { message: `Assigned ${role}` };
  });
};

export default authRoutes;
