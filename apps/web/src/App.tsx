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

type DeploymentTemplate = {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  artifactPath: string;
  createdAt: string;
  updatedAt: string;
};

type DeploymentJob = {
  id: string;
  templateId: string;
  connectionId: string;
  name: string;
  target: string;
  status: string;
  deploymentUrl: string | null;
  deploymentDomain: string | null;
  errorMessage: string | null;
  logs: Array<{ at: string; message: string }> | null;
  template?: { name: string };
  connection?: { name: string };
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

  const [templates, setTemplates] = useState<DeploymentTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateSourceType, setTemplateSourceType] = useState<'folder' | 'zip' | 'repo' | 'generated'>('generated');
  const [templateArtifactContent, setTemplateArtifactContent] = useState('{"index":"hello"}');

  const [deployments, setDeployments] = useState<DeploymentJob[]>([]);
  const [deploymentName, setDeploymentName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [deploymentTarget, setDeploymentTarget] = useState<'preview' | 'production'>('preview');
  const [deploymentPayload, setDeploymentPayload] = useState('{"siteTitle":"Campaign A"}');

  const [message, setMessage] = useState('');

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${session?.token ?? ''}`, 'Content-Type': 'application/json' }),
    [session?.token]
  );

  const loadConnections = useCallback(async () => {
    if (!session) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/vercel/connections`, { headers: authHeaders });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to load connections' }));
      throw new Error(error.message ?? 'Failed to load connections');
    }

    const data = (await response.json()) as VercelConnection[];
    setConnections(data);
    setSelectedConnectionId((previous) => previous || data[0]?.id || '');
    setNewNameById(Object.fromEntries(data.map((item) => [item.id, item.name])));
  }, [authHeaders, session]);

  const loadTemplates = useCallback(async () => {
    if (!session) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/templates`, { headers: authHeaders });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to load templates' }));
      throw new Error(error.message ?? 'Failed to load templates');
    }

    const data = (await response.json()) as DeploymentTemplate[];
    setTemplates(data);
    setSelectedTemplateId((previous) => previous || data[0]?.id || '');
  }, [authHeaders, session]);

  const loadDeployments = useCallback(async () => {
    if (!session) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/deployments`, { headers: authHeaders });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to load deployments' }));
      throw new Error(error.message ?? 'Failed to load deployments');
    }

    const data = (await response.json()) as DeploymentJob[];
    setDeployments(data);
  }, [authHeaders, session]);

  useEffect(() => {
    Promise.all([loadConnections(), loadTemplates(), loadDeployments()]).catch((error) => setMessage(error.message));
  }, [loadConnections, loadTemplates, loadDeployments]);

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
      setAuthError((data as { message?: string }).message ?? 'Authentication failed');
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
      setMessage((data as { message?: string }).message ?? 'Failed to create connection');
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

  const onCreateTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    const response = await fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: templateName,
        description: templateDescription || undefined,
        sourceType: templateSourceType,
        artifactContent: templateArtifactContent
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage((data as { message?: string }).message ?? 'Failed to create template');
      return;
    }

    setTemplateName('');
    setTemplateDescription('');
    setTemplateArtifactContent('{"index":"hello"}');
    setMessage('Template created.');
    await loadTemplates();
  };

  const onCreateDeployment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !selectedTemplateId || !selectedConnectionId) {
      setMessage('Select a template and connection first.');
      return;
    }

    let parsedPayload: Record<string, unknown> | undefined;
    if (deploymentPayload.trim()) {
      try {
        parsedPayload = JSON.parse(deploymentPayload) as Record<string, unknown>;
      } catch {
        setMessage('Deployment payload must be valid JSON.');
        return;
      }
    }

    const response = await fetch(`${API_BASE}/api/deployments`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        templateId: selectedTemplateId,
        connectionId: selectedConnectionId,
        name: deploymentName,
        target: deploymentTarget,
        renderPayload: parsedPayload
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage((data as { message?: string }).message ?? 'Failed to queue deployment');
      return;
    }

    setDeploymentName('');
    setMessage('Deployment queued. Refreshing history...');
    await loadDeployments();
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
      setMessage((data as { message?: string }).message ?? 'Failed to rename connection');
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
      setMessage((data as { message?: string }).message ?? 'Validation failed');
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
      setMessage((data as { message?: string }).message ?? 'Usage sync failed');
      return;
    }

    setMessage((data as { message?: string }).message ?? 'Usage sync queued.');
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
      setMessage((data as { message?: string }).message ?? 'Failed to delete connection');
      return;
    }

    setMessage('Connection deleted.');
    await loadConnections();
  };

  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', margin: '0 auto', maxWidth: 1100, padding: '2rem' }}>
      <h1>Authorized Vercel Deployment Automation Platform</h1>
      <p>Current build: milestone 3 baseline with templates, deployment queue orchestration, and deployment history.</p>

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

          <section style={{ ...cardStyle, marginTop: '1rem' }}>
            <h2>Create template</h2>
            <form onSubmit={onCreateTemplate} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <input placeholder="Template name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} required />
              <input placeholder="Description (optional)" value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} />
              <select value={templateSourceType} onChange={(event) => setTemplateSourceType(event.target.value as 'folder' | 'zip' | 'repo' | 'generated')}>
                <option value="generated">Generated</option>
                <option value="folder">Folder</option>
                <option value="zip">ZIP</option>
                <option value="repo">Repository</option>
              </select>
              <input
                placeholder="Artifact JSON/text"
                value={templateArtifactContent}
                onChange={(event) => setTemplateArtifactContent(event.target.value)}
              />
              <button type="submit">Create template</button>
            </form>
          </section>

          <section style={{ ...cardStyle, marginTop: '1rem' }}>
            <h2>Queue deployment</h2>
            <form onSubmit={onCreateDeployment} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <input placeholder="Deployment name" value={deploymentName} onChange={(event) => setDeploymentName(event.target.value)} required />
              <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} required>
                <option value="">Select template</option>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select value={selectedConnectionId} onChange={(event) => setSelectedConnectionId(event.target.value)} required>
                <option value="">Select connection</option>
                {connections.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select value={deploymentTarget} onChange={(event) => setDeploymentTarget(event.target.value as 'preview' | 'production')}>
                <option value="preview">Preview</option>
                <option value="production">Production</option>
              </select>
              <input value={deploymentPayload} onChange={(event) => setDeploymentPayload(event.target.value)} placeholder="Render payload JSON" />
              <button type="submit">Queue deployment</button>
              <button type="button" onClick={() => void loadDeployments()}>
                Refresh history
              </button>
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
                <p>vercel user: {connection.vercelUsername ?? connection.vercelEmail ?? connection.vercelUserId ?? 'n/a'}</p>
                <p>
                  validated: {formatDate(connection.lastValidatedAt)} | health checked: {formatDate(connection.lastHealthCheckAt)} | usage synced:{' '}
                  {formatDate(connection.lastUsageSyncAt)}
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
                  <button onClick={() => void onRenameConnection(connection.id)}>Rename</button>
                  <button onClick={() => void onValidateConnection(connection.id)}>Validate token</button>
                  <button onClick={() => void onSyncUsage(connection.id)}>Sync usage</button>
                  <button onClick={() => void onDeleteConnection(connection.id)} style={{ color: '#b91c1c' }}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>

          <section style={{ ...cardStyle, marginTop: '1rem' }}>
            <h2>Templates</h2>
            {templates.length === 0 ? <p>No templates yet.</p> : null}
            <ul>
              {templates.map((template) => (
                <li key={template.id}>
                  <strong>{template.name}</strong> ({template.sourceType}) · created {formatDate(template.createdAt)}
                </li>
              ))}
            </ul>
          </section>

          <section style={{ ...cardStyle, marginTop: '1rem' }}>
            <h2>Deployment history</h2>
            {deployments.length === 0 ? <p>No deployments yet.</p> : null}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th align="left">Name</th>
                  <th align="left">Template</th>
                  <th align="left">Connection</th>
                  <th align="left">Status</th>
                  <th align="left">URL</th>
                  <th align="left">Updated</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((deployment) => (
                  <tr key={deployment.id}>
                    <td>{deployment.name}</td>
                    <td>{deployment.template?.name ?? deployment.templateId}</td>
                    <td>{deployment.connection?.name ?? deployment.connectionId}</td>
                    <td>{deployment.status}</td>
                    <td>
                      {deployment.deploymentUrl ? (
                        <a href={deployment.deploymentUrl} target="_blank" rel="noreferrer">
                          {deployment.deploymentDomain}
                        </a>
                      ) : (
                        'n/a'
                      )}
                    </td>
                    <td>{formatDate(deployment.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {message ? <p style={{ marginTop: 12 }}>{message}</p> : null}
    </main>
  );
};

export default App;
