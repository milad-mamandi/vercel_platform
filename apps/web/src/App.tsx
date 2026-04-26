const cards = [
  'Auth and users',
  'Vercel connections',
  'Deployments',
  'Usage and quotas',
  'Simulator lab'
];

export const App = () => {
  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', margin: '0 auto', maxWidth: 900, padding: '2rem' }}>
      <h1>Authorized Vercel Deployment Automation Platform</h1>
      <p>Milestone 1 foundation is active: web app scaffold, API scaffold, Prisma, Redis/BullMQ, auth, roles, and audit logging.</p>
      <section style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', marginTop: '1.5rem' }}>
        {cards.map((card) => (
          <article key={card} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '0.85rem 1rem', background: '#f9fafb' }}>
            <strong>{card}</strong>
          </article>
        ))}
      </section>
    </main>
  );
};
