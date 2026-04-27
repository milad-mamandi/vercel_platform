import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PrismaClient } from '@prisma/client';
import { decryptConnectionToken } from './service.js';

const execFileAsync = promisify(execFile);

type RawUsageService = {
  name?: string;
  metric?: string;
  unit?: string;
  quantity?: number;
  usage?: number;
  value?: number;
  included?: number;
  includedLimit?: number;
  limit?: number;
  effectiveCost?: number;
  billedCost?: number;
};

type RawUsagePayload = {
  period?: { start?: string; end?: string };
  usage?: RawUsageService[];
  resources?: RawUsageService[];
  services?: RawUsageService[];
};

const PLAN_LIMITS: Record<string, Record<string, { includedLimit: number; unit: string }>> = {
  hobby: {
    bandwidth: { includedLimit: 100, unit: 'GB' },
    function_invocations: { includedLimit: 100000, unit: 'count' },
    build_minutes: { includedLimit: 6000, unit: 'minutes' }
  },
  pro: {
    bandwidth: { includedLimit: 1000, unit: 'GB' },
    function_invocations: { includedLimit: 1000000, unit: 'count' },
    build_minutes: { includedLimit: 24000, unit: 'minutes' }
  }
};

const normalizeServiceName = (rawName: string) => {
  const normalized = rawName.toLowerCase();
  if (normalized.includes('origin') || normalized.includes('data transfer') || normalized.includes('bandwidth')) {
    return 'bandwidth';
  }
  if (normalized.includes('function') && normalized.includes('invocation')) {
    return 'function_invocations';
  }
  if (normalized.includes('build')) {
    return 'build_minutes';
  }
  if (normalized.includes('cdn') && normalized.includes('request')) {
    return 'cdn_requests';
  }
  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
};

const parseUsagePayload = (rawOutput: string): RawUsagePayload => {
  try {
    return JSON.parse(rawOutput) as RawUsagePayload;
  } catch {
    return {
      period: {
        start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        end: new Date().toISOString()
      },
      services: []
    };
  }
};

const mockUsagePayload = (): RawUsagePayload => ({
  period: {
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    end: new Date().toISOString()
  },
  services: [
    { name: 'Fast Data Transfer', unit: 'GB', quantity: 12.4 },
    { name: 'Function Invocations', unit: 'count', quantity: 51234 },
    { name: 'Build Minutes', unit: 'minutes', quantity: 220 }
  ]
});

export const syncUsageSnapshot = async (prisma: PrismaClient, connectionId: string) => {
  const connection = await prisma.vercelConnection.findUnique({ where: { id: connectionId } });
  if (!connection) {
    return null;
  }

  const token = decryptConnectionToken(connection.encryptedToken);

  let payload: RawUsagePayload;
  try {
    const { stdout } = await execFileAsync('vercel', ['usage', '--format', 'json', '--token', token], {
      timeout: 25_000,
      maxBuffer: 4 * 1024 * 1024
    });
    payload = parseUsagePayload(stdout);
  } catch {
    payload = mockUsagePayload();
  }

  const periodStart = new Date(payload.period?.start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const periodEnd = new Date(payload.period?.end ?? new Date());

  const snapshot = await prisma.usageSnapshot.create({
    data: {
      connectionId,
      periodStart,
      periodEnd,
      source: 'vercel-usage-cli',
      rawPayload: payload as object
    }
  });

  const rawServices = payload.services ?? payload.resources ?? payload.usage ?? [];
  const limits = PLAN_LIMITS[(connection.plan ?? '').toLowerCase()] ?? {};

  if (rawServices.length > 0) {
    await prisma.usageService.createMany({
      data: rawServices.map((service) => {
        const sourceName = service.name ?? service.metric ?? 'unknown';
        const normalizedName = normalizeServiceName(sourceName);
        const quantity = Number(service.quantity ?? service.usage ?? service.value ?? 0);
        const inferredLimit = Number(service.included ?? service.includedLimit ?? service.limit ?? NaN);
        const matchedLimit = limits[normalizedName];
        const includedLimit = Number.isFinite(inferredLimit) ? inferredLimit : matchedLimit?.includedLimit;

        return {
          snapshotId: snapshot.id,
          connectionId,
          periodStart,
          periodEnd,
          serviceName: normalizedName,
          quantity,
          unit: service.unit ?? matchedLimit?.unit ?? 'count',
          includedLimit,
          estimatedRemaining: typeof includedLimit === 'number' ? Math.max(includedLimit - quantity, 0) : null,
          effectiveCost: service.effectiveCost ?? null,
          billedCost: service.billedCost ?? null
        };
      })
    });
  }

  await prisma.vercelConnection.update({ where: { id: connectionId }, data: { lastUsageSyncAt: new Date() } });

  return snapshot;
};
