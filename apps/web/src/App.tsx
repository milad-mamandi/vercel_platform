import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type SessionUser = {
  id: string;
  email: string;
  displayName?: string | null;
  roles: string[];
};

type Session = {
  token: string;
  user: SessionUser;
};

type VercelConnection = {
  id: string;
  name: string;
  vercelUserId: string | null;
  vercelEmail: string | null;
  vercelUsername: string | null;
  teamId: string | null;
  teamSlug: string | null;
  plan: string | null;
  tokenStatus: string;
  tokenPreview: string;
  lastValidatedAt: string | null;
  lastHealthCheckAt: string | null;
  lastUsageSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const cardStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: '1rem',
  background: '#f9fafb'
};

const API_BASE = 'http://localhost:4000';

const formatDate = (isoValue: string | null) => {
  if (!isoValue) {
    return 'Never';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(isoValue));
};

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [connections, setConnections] = useState<VercelConnection[]>([]);
  const [connectionName, setConnectionName] = useState('');
  const [connectionToken, setConnectionToken] = useState('');
  const [teamId, setTeamId] = useState('');
  const [teamSlug, setTeamSlug] = useState('');
  const [plan, setPlan] = useState('');
  const [newNameById, setNewNameById] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${session?.token ?? ''}`, 'Content-Type': 'application/json' }),
    [session?.token]
  );

  const loadConnections = useCallback(async () => {
    if (!session) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/vercel/connections`, {
      headers: authHeaders
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to load connections' }));
      throw new Error(error.message ?? 'Failed to load connections');
    }

    const data = (await response.json()) as VercelConnection[];
    setConnections(data);
    setNewNameById(Object.fromEntries(data.map((item) => [item.id, item.name])));
  }, [authHeaders, session]);

  useEffect(() => {
    loadConnections().catch((error) => setMessage(error.message));
  }, [loadConnections]);

  const onAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');
    setMessage('');

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = mode === 'login' ? { email, password } : { email, password, displayName: displayName || undefined };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setAuthError(data.message ?? 'Authentication failed');
      return;
    }

    setSession(data as Session);
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  const onCreateConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setMessage('');

    const response = await fetch(`${API_BASE}/api/vercel/connections`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: connectionName,
        token: connectionToken,
        teamId: teamId || undefined,
        teamSlug: teamSlug || undefined,
        plan: plan || undefined
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message ?? 'Failed to create connection');
      return;
    }

    setConnectionName('');
    setConnectionToken('');
    setTeamId('');
    setTeamSlug('');
    setPlan('');
    setMessage('Connection added. Run validation to confirm token status.');
    await loadConnections();
  };

  const onRenameConnection = async (id: string) => {
    if (!session) {
      return;
    }

    const nextName = newNameById[id];
    if (!nextName?.trim()) {
      setMessage('Connection name cannot be empty.');
      return;
    }

    const response = await fetch(`${API_BASE}/api/vercel/connections/${id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ name: nextName.trim() })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.message ?? 'Failed to rename connection');
      return;
    }

    setMessage('Connection updated.');
    await loadConnections();
  };

  const onValidateConnection = async (id: string) => {
    if (!session) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/vercel/connections/${id}/validate`, {
      method: 'POST',
      headers: authHeaders
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message ?? 'Validation failed');
      return;
    }

    setMessage('Connection validation complete.');
    await loadConnections();
  };

  const onSyncUsage = async (id: string) => {
    if (!session) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/vercel/connections/${id}/sync-usage`, {
      method: 'POST',
      headers: authHeaders
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.message ?? 'Usage sync failed');
      return;
    }

    setMessage(data.message ?? 'Usage sync queued.');
    await loadConnections();
  };

  const onDeleteConnection = async (id: string) => {
    if (!session) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/vercel/connections/${id}`, {
      method: 'DELETE',
      headers: authHeaders
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.message ?? 'Failed to delete connection');
      return;
    }

    setMessage('Connection deleted.');
    await loadConnections();
  };

  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', margin: '0 auto', maxWidth: 1024, padding: '2rem' }}>
      <h1>Authorized Vercel Deployment Automation Platform</h1>
      <p>Current build: foundation + Vercel connection CRUD + token validation + manual usage-sync queue trigger.</p>

      {!session ? (
        <section style={{ ...cardStyle, marginTop: '1.25rem' }}>
          <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
          <form onSubmit={onAuthSubmit} style={{ display: 'grid', gap: 8, maxWidth: 440 }}>
            <input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {mode === 'register' ? (
              <input placeholder="Display name (optional)" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            ) : null}
            <button type="submit">{mode === 'login' ? 'Login' : 'Create account'}</button>
            <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              Switch to {mode === 'login' ? 'register' : 'login'}
            </button>
          </form>
          {authError ? <p style={{ color: '#b91c1c' }}>{authError}</p> : null}
        </section>
      ) : (
        <>
          <section style={{ ...cardStyle, marginTop: '1.25rem' }}>
            <h2>Session</h2>
            <p>
              Signed in as <strong>{session.user.email}</strong> ({session.user.roles.join(', ')})
            </p>
            <button onClick={() => setSession(null)}>Log out</button>
          </section>

          <section style={{ ...cardStyle, marginTop: '1rem' }}>
            <h2>Connect a Vercel account/team</h2>
            <form onSubmit={onCreateConnection} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <input placeholder="Connection name" value={connectionName} onChange={(event) => setConnectionName(event.target.value)} required />
              <input placeholder="Vercel token" value={connectionToken} onChange={(event) => setConnectionToken(event.target.value)} required />
              <input placeholder="Team ID (optional)" value={teamId} onChange={(event) => setTeamId(event.target.value)} />
              <input placeholder="Team slug (optional)" value={teamSlug} onChange={(event) => setTeamSlug(event.target.value)} />
              <input placeholder="Plan (optional)" value={plan} onChange={(event) => setPlan(event.target.value)} />
              <button type="submit">Add connection</button>
            </form>
          </section>

          <section style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
            <h2>Your Vercel connections</h2>
            {connections.length === 0 ? <p>No connections yet.</p> : null}
            {connections.map((connection) => (
              <article key={connection.id} style={cardStyle}>
                <p>
                  <strong>{connection.name}</strong> ({connection.tokenStatus})
                </p>
                <p>
                  team: {connection.teamSlug ?? 'n/a'} | plan: {connection.plan ?? 'n/a'} | token: {connection.tokenPreview}
                </p>
                <p>
                  vercel user: {connection.vercelUsername ?? connection.vercelEmail ?? connection.vercelUserId ?? 'n/a'}
                </p>
                <p>
                  validated: {formatDate(connection.lastValidatedAt)} | health checked: {formatDate(connection.lastHealthCheckAt)} | usage
                  synced: {formatDate(connection.lastUsageSyncAt)}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    value={newNameById[connection.id] ?? connection.name}
                    onChange={(event) =>
                      setNewNameById((previous) => ({
                        ...previous,
                        [connection.id]: event.target.value
                      }))
                    }
                  />
                  <button onClick={() => onRenameConnection(connection.id)}>Rename</button>
                  <button onClick={() => onValidateConnection(connection.id)}>Validate token</button>
                  <button onClick={() => onSyncUsage(connection.id)}>Sync usage</button>
                  <button onClick={() => onDeleteConnection(connection.id)} style={{ color: '#b91c1c' }}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
    </main>
  );
};

export default App;
