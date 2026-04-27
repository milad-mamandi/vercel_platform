import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return { ok: true, service: 'api' };
  });

  app.get('/api/metrics', async () => {
    const [deploymentByStatus, connections, simulations] = await Promise.all([
      app.prisma.deploymentJob.groupBy({ by: ['status'], _count: { status: true } }),
      app.prisma.vercelConnection.count(),
      app.prisma.simulatorRun.groupBy({ by: ['status'], _count: { status: true } })
    ]);

    return {
      generatedAt: new Date().toISOString(),
      deployments: deploymentByStatus.map((item) => ({ status: item.status, count: item._count.status })),
      totalConnections: connections,
      simulations: simulations.map((item) => ({ status: item.status, count: item._count.status }))
    };
  });

  app.get('/api/alerts/quota', { preHandler: [app.authenticate] }, async (request) => {
    const userId = String((request.user as { sub: string }).sub);
    const latestByConnection = await app.prisma.usageSnapshot.findMany({
      where: { connection: { userId } },
      orderBy: { createdAt: 'desc' },
      include: { services: true, connection: { select: { name: true } } },
      take: 10
    });
    const rules = await app.prisma.quotaRule.findMany();
    const ruleMap = Object.fromEntries(rules.map((rule) => [rule.serviceName, rule]));

    const alerts = latestByConnection.flatMap((snapshot) =>
      snapshot.services.flatMap((service) => {
        const limit = service.includedLimit ?? ruleMap[service.serviceName]?.defaultLimit;
        if (!limit || limit <= 0) return [];
        const pct = (service.quantity / limit) * 100;
        const rule = ruleMap[service.serviceName];
        const level = pct >= (rule?.criticalAtPct ?? 95) ? 'critical' : pct >= (rule?.warningAtPct ?? 80) ? 'warning' : null;
        return level
          ? [{ level, connectionName: snapshot.connection.name, serviceName: service.serviceName, pctUsed: Number(pct.toFixed(2)) }]
          : [];
      })
    );

    return { generatedAt: new Date().toISOString(), alerts };
  });
};

export default healthRoutes;
