import type { PrismaClient } from '@prisma/client';
import { decryptToken, encryptToken } from '../../lib/token-crypto.js';
import { validateTokenAndFetchMetadata } from '../../lib/vercel-api.js';

export const createEncryptedConnectionToken = (token: string) => encryptToken(token);
export const decryptConnectionToken = (encryptedToken: string) => decryptToken(encryptedToken);

export const revalidateConnection = async (prisma: PrismaClient, connectionId: string) => {
  const existing = await prisma.vercelConnection.findUnique({ where: { id: connectionId } });
  if (!existing) {
    return null;
  }

  const token = decryptToken(existing.encryptedToken);

  try {
    const metadata = await validateTokenAndFetchMetadata({
      token,
      teamId: existing.teamId,
      teamSlug: existing.teamSlug
    });

    return prisma.vercelConnection.update({
      where: { id: connectionId },
      data: {
        tokenStatus: 'valid',
        lastValidatedAt: new Date(),
        lastHealthCheckAt: new Date(),
        vercelUserId: metadata.vercelUserId,
        vercelEmail: metadata.vercelEmail,
        vercelUsername: metadata.vercelUsername,
        plan: metadata.plan ?? existing.plan,
        teamId: metadata.teamId,
        teamSlug: metadata.teamSlug
      }
    });
  } catch {
    return prisma.vercelConnection.update({
      where: { id: connectionId },
      data: {
        tokenStatus: 'invalid',
        lastValidatedAt: new Date(),
        lastHealthCheckAt: new Date()
      }
    });
  }
};
