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

type TemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  artifactPath: string;
  changelog: string | null;
  createdAt: string;
};

type DeploymentTemplate = {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
  artifactPath: string;
  createdAt: string;
  updatedAt: string;
  latestVersion?: TemplateVersion | null;
};

type DeploymentJob = {
  id: string;
  templateId: string;
  templateVersionId: string | null;
  connectionId: string;
  name: string;
  target: string;
  status: string;
  deploymentUrl: string | null;
  deploymentDomain: string | null;
  errorMessage: string | null;
  templateVersion?: { version: number } | null;
  template?: { name: string };
  connection?: { name: string };
  createdAt: string;
  updatedAt: string;
};

type SimulatorRun = {
  id: string;
  name: string;
  status: string;
  currentStep: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type AdminUser = {
  id: string;
  email: string;
  roles: string[];
};

type QuotaRule = {
  id: string;
  serviceName: string;
  defaultLimit: number;
  unit: string;
  warningAtPct: number;
  criticalAtPct: number;
};

type UsageSummary = {
  hasData: boolean;
  services: Array<{
    serviceName: string;
    quantity: number;
    unit: string;
    includedLimit: number | null;
    estimatedRemaining: number | null;
    percentUsed: number | null;
  }>;
};

const cardStyle: CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: '1rem', background: '#f9fafb' };
const API_BASE = 'http://localhost:4000';

const formatDate = (isoValue: string | null) =>
  isoValue
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(isoValue))
    : 'Never';

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');
  const [connections, setConnections] = useState<VercelConnection[]>([]);
  const [templates, setTemplates] = useState<DeploymentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedTemplateVersionId, setSelectedTemplateVersionId] = useState('');
  const [templateVersions, setTemplateVersions] = useState<TemplateVersion[]>([]);
  const [previewText, setPreviewText] = useState('');
  const [previewPayload, setPreviewPayload] = useState('{"siteTitle":"Campaign A"}');
  const [usageByConnection, setUsageByConnection] = useState<Record<string, UsageSummary>>({});
  const [deployments, setDeployments] = useState<DeploymentJob[]>([]);

  const [connectionName, setConnectionName] = useState('');
  const [connectionToken, setConnectionToken] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateArtifactContent, setTemplateArtifactContent] = useState('{"index":"Hello {{siteTitle}}"}');
  const [newVersionContent, setNewVersionContent] = useState('{"index":"Hello {{siteTitle}} v2"}');
  const [deploymentName, setDeploymentName] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [deploymentPayload, setDeploymentPayload] = useState('{"siteTitle":"Campaign A"}');
  const [message, setMessage] = useState('');
  const [simulations, setSimulations] = useState<SimulatorRun[]>([]);
  const [simulationName, setSimulationName] = useState('Onboarding flow');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [quotaRules, setQuotaRules] = useState<QuotaRule[]>([]);
  const [quotaServiceName, setQuotaServiceName] = useState('bandwidth');
  const [quotaDefaultLimit, setQuotaDefaultLimit] = useState('1000');
  const [seedEmail, setSeedEmail] = useState('');
  const [seedKey, setSeedKey] = useState('');

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${session?.token ?? ''}`, 'Content-Type': 'application/json' }), [session?.token]);

  const loadConnections = useCallback(async () => {
    if (!session) return;
    const response = await fetch(`${API_BASE}/api/vercel/connections`, { headers: authHeaders });
    const data = (await response.json()) as VercelConnection[];
    setConnections(data);
    setSelectedConnectionId((previous) => previous || data[0]?.id || '');
  }, [authHeaders, session]);

  const loadTemplates = useCallback(async () => {
    if (!session) return;
    const response = await fetch(`${API_BASE}/api/templates`, { headers: authHeaders });
    const data = (await response.json()) as DeploymentTemplate[];
    setTemplates(data);
    const nextTemplate = data[0]?.id ?? '';
    setSelectedTemplateId((previous) => previous || nextTemplate);
  }, [authHeaders, session]);

  const loadTemplateVersions = useCallback(async (templateId: string) => {
    if (!session || !templateId) return;
    const response = await fetch(`${API_BASE}/api/templates/${templateId}/versions`, { headers: authHeaders });
    const data = (await response.json()) as TemplateVersion[];
    setTemplateVersions(data);
    setSelectedTemplateVersionId((previous) => previous || data[0]?.id || '');
  }, [authHeaders, session]);

  const loadDeployments = useCallback(async () => {
    if (!session) return;
    const response = await fetch(`${API_BASE}/api/deployments`, { headers: authHeaders });
    setDeployments((await response.json()) as DeploymentJob[]);
  }, [authHeaders, session]);

  const loadSimulations = useCallback(async () => {
    if (!session) return;
    const response = await fetch(`${API_BASE}/api/simulations`, { headers: authHeaders });
    if (response.ok) {
      setSimulations((await response.json()) as SimulatorRun[]);
    }
  }, [authHeaders, session]);

  const loadAdminData = useCallback(async () => {
    if (!session || !session.user.roles.includes('admin')) return;
    const [usersResponse, quotaResponse] = await Promise.all([
      fetch(`${API_BASE}/api/admin/users`, { headers: authHeaders }),
      fetch(`${API_BASE}/api/admin/quota-rules`, { headers: authHeaders })
    ]);
    if (usersResponse.ok) setAdminUsers((await usersResponse.json()) as AdminUser[]);
    if (quotaResponse.ok) setQuotaRules((await quotaResponse.json()) as QuotaRule[]);
  }, [authHeaders, session]);

  const loadUsageSummary = useCallback(async () => {
    if (!session) return;
    const summaries = await Promise.all(
      connections.map(async (connection) => {
        const response = await fetch(`${API_BASE}/api/vercel/connections/${connection.id}/usage/summary`, { headers: authHeaders });
        return [connection.id, (await response.json()) as UsageSummary] as const;
      })
    );
    setUsageByConnection(Object.fromEntries(summaries));
  }, [authHeaders, connections, session]);

  useEffect(() => {
    Promise.all([loadConnections(), loadTemplates(), loadDeployments(), loadSimulations(), loadAdminData()]).catch((error: Error) =>
      setMessage(error.message)
    );
  }, [loadAdminData, loadConnections, loadDeployments, loadSimulations, loadTemplates]);

  useEffect(() => {
    if (selectedTemplateId) {
      void loadTemplateVersions(selectedTemplateId);
    }
  }, [loadTemplateVersions, selectedTemplateId]);

  useEffect(() => {
    if (connections.length > 0) {
      void loadUsageSummary();
    }
  }, [connections, loadUsageSummary]);

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'login' ? { email, password } : { email, password, displayName })
    });
    const data = await response.json();
    if (!response.ok) return setAuthError(data.message ?? 'Authentication failed');
    setSession(data as Session);
  };

  const createTemplate = async (event: FormEvent) => {
    event.preventDefault();
    const response = await fetch(`${API_BASE}/api/templates`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ name: templateName, sourceType: 'generated', artifactContent: templateArtifactContent })
    });
    if (!response.ok) return setMessage('Failed to create template');
    setTemplateName('');
    await loadTemplates();
  };

  const createTemplateVersion = async () => {
    if (!selectedTemplateId) return;
    const response = await fetch(`${API_BASE}/api/templates/${selectedTemplateId}/versions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ artifactContent: newVersionContent, changelog: 'Manual update from dashboard' })
    });
    if (!response.ok) return setMessage('Failed to create template version');
    await loadTemplateVersions(selectedTemplateId);
    await loadTemplates();
    setMessage('Template version created.');
  };

  const runPreview = async () => {
    if (!selectedTemplateId) return;
    const parsedPayload = JSON.parse(previewPayload) as Record<string, unknown>;
    const response = await fetch(`${API_BASE}/api/templates/${selectedTemplateId}/preview`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ templateVersionId: selectedTemplateVersionId || undefined, renderPayload: parsedPayload })
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.message ?? 'Preview failed');
    setPreviewText(String((data as { previewText: string }).previewText));
  };

  const createDeployment = async (event: FormEvent) => {
    event.preventDefault();
    const parsedPayload = JSON.parse(deploymentPayload) as Record<string, unknown>;
    const response = await fetch(`${API_BASE}/api/deployments`, {
      method: 'POST',
      headers: { ...authHeaders, 'Idempotency-Key': `${selectedTemplateId}-${deploymentName}-${selectedConnectionId}` },
      body: JSON.stringify({
        templateId: selectedTemplateId,
        templateVersionId: selectedTemplateVersionId || undefined,
        connectionId: selectedConnectionId,
        name: deploymentName,
        target: 'preview',
        renderPayload: parsedPayload
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage((data as { message?: string }).message ?? 'Queue failed');
    setDeploymentName('');
    await loadDeployments();
  };

  const retryDeployment = async (deploymentId: string) => {
    const response = await fetch(`${API_BASE}/api/deployments/${deploymentId}/retry`, { method: 'POST', headers: authHeaders });
    if (!response.ok) return setMessage('Retry failed');
    await loadDeployments();
  };

  const cancelDeployment = async (deploymentId: string) => {
    const response = await fetch(`${API_BASE}/api/deployments/${deploymentId}/cancel`, { method: 'POST', headers: authHeaders });
    if (!response.ok) return setMessage('Cancel failed');
    await loadDeployments();
  };

  return (
    <main style={{ fontFamily: 'Inter, system-ui, sans-serif', margin: '0 auto', maxWidth: 1200, padding: '2rem' }}>
      <h1>Authorized Vercel Deployment Automation Platform</h1>
      {!session ? (
        <section style={cardStyle}>
          <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
          <form onSubmit={submitAuth} style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
            <input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} />
            {mode === 'register' ? <input placeholder="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /> : null}
            <button type="submit">{mode}</button>
          </form>
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>Switch mode</button>
          {authError ? <p>{authError}</p> : null}
        </section>
      ) : (
        <>
          <section style={cardStyle}>
            <h2>Session</h2>
            <p>{session.user.email}</p>
            <p>Roles: {session.user.roles.join(', ')}</p>
            <button onClick={() => setSession(null)}>Log out</button>
          </section>

          <section style={{ ...cardStyle, marginTop: 12 }}>
            <h2>Create connection</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                await fetch(`${API_BASE}/api/vercel/connections`, {
                  method: 'POST',
                  headers: authHeaders,
                  body: JSON.stringify({ name: connectionName, token: connectionToken })
                });
                await loadConnections();
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input value={connectionName} onChange={(event) => setConnectionName(event.target.value)} placeholder="Connection name" required />
              <input value={connectionToken} onChange={(event) => setConnectionToken(event.target.value)} placeholder="Vercel token" required />
              <button type="submit">Add</button>
            </form>
          </section>

          <section style={{ ...cardStyle, marginTop: 12 }}>
            <h2>Usage dashboard</h2>
            {connections.map((connection) => {
              const summary = usageByConnection[connection.id];
              return (
                <article key={connection.id} style={{ borderTop: '1px solid #ddd', paddingTop: 8, marginTop: 8 }}>
                  <p>
                    <strong>{connection.name}</strong> · status {connection.tokenStatus} · last usage sync {formatDate(connection.lastUsageSyncAt)}
                  </p>
                  <button
                    onClick={async () => {
                      await fetch(`${API_BASE}/api/vercel/connections/${connection.id}/sync-usage`, { method: 'POST', headers: authHeaders });
                      await loadConnections();
                      await loadUsageSummary();
                    }}
                  >
                    Sync usage
                  </button>
                  {!summary?.hasData ? <p>No usage snapshots yet.</p> : null}
                  {summary?.services?.map((service) => (
                    <p key={`${connection.id}-${service.serviceName}`}>
                      {service.serviceName}: {service.quantity} {service.unit}
                      {service.includedLimit ? ` / ${service.includedLimit} (${Math.round(service.percentUsed ?? 0)}%)` : ''}
                    </p>
                  ))}
                </article>
              );
            })}
          </section>

          <section style={{ ...cardStyle, marginTop: 12 }}>
            <h2>Template + versioning</h2>
            <form onSubmit={createTemplate} style={{ display: 'grid', gap: 8 }}>
              <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" required />
              <input value={templateArtifactContent} onChange={(event) => setTemplateArtifactContent(event.target.value)} placeholder="Artifact text" />
              <button type="submit">Create template</button>
            </form>
            <hr />
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
              <option value="">Select template</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (latest v{item.latestVersion?.version ?? 1})
                </option>
              ))}
            </select>
            <select value={selectedTemplateVersionId} onChange={(event) => setSelectedTemplateVersionId(event.target.value)}>
              <option value="">Latest version</option>
              {templateVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.version}
                </option>
              ))}
            </select>
            <input value={newVersionContent} onChange={(event) => setNewVersionContent(event.target.value)} />
            <button onClick={() => void createTemplateVersion()}>Create new version</button>
            <h3>Render preview</h3>
            <input value={previewPayload} onChange={(event) => setPreviewPayload(event.target.value)} />
            <button onClick={() => void runPreview()}>Preview render</button>
            {previewText ? <pre>{previewText}</pre> : null}
          </section>

          <section style={{ ...cardStyle, marginTop: 12 }}>
            <h2>Deployments</h2>
            <form onSubmit={createDeployment} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              <input value={deploymentName} onChange={(event) => setDeploymentName(event.target.value)} placeholder="Deployment name" required />
              <select value={selectedConnectionId} onChange={(event) => setSelectedConnectionId(event.target.value)} required>
                <option value="">Connection</option>
                {connections.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <input value={deploymentPayload} onChange={(event) => setDeploymentPayload(event.target.value)} />
              <button type="submit">Queue</button>
            </form>
            <table style={{ width: '100%', marginTop: 8 }}>
              <thead>
                <tr><th align="left">Name</th><th align="left">Version</th><th align="left">Status</th><th align="left">Actions</th></tr>
              </thead>
              <tbody>
                {deployments.map((deployment) => (
                  <tr key={deployment.id}>
                    <td>{deployment.name}</td>
                    <td>v{deployment.templateVersion?.version ?? 'n/a'}</td>
                    <td>{deployment.status}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => void retryDeployment(deployment.id)}>Retry same version</button>
                      <button onClick={() => void cancelDeployment(deployment.id)}>Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={{ ...cardStyle, marginTop: 12 }}>
            <h2>Simulator lab</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const response = await fetch(`${API_BASE}/api/simulations`, {
                  method: 'POST',
                  headers: authHeaders,
                  body: JSON.stringify({ name: simulationName })
                });
                if (!response.ok) return setMessage('Failed to create simulation');
                await loadSimulations();
              }}
              style={{ display: 'flex', gap: 8 }}
            >
              <input value={simulationName} onChange={(event) => setSimulationName(event.target.value)} placeholder="Simulation name" />
              <button type="submit">Create run</button>
            </form>
            {simulations.map((run) => (
              <p key={run.id}>
                {run.name}: {run.status} {run.currentStep ? `(step ${run.currentStep})` : ''}
              </p>
            ))}
          </section>

          {session.user.roles.includes('admin') ? (
            <section style={{ ...cardStyle, marginTop: 12 }}>
              <h2>Admin controls</h2>
              <h3>Seed admin workflow</h3>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const response = await fetch(`${API_BASE}/api/auth/seed-admin`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ email: seedEmail, seedKey })
                  });
                  if (!response.ok) return setMessage('Seed admin request failed');
                  await loadAdminData();
                }}
                style={{ display: 'flex', gap: 8 }}
              >
                <input value={seedEmail} onChange={(event) => setSeedEmail(event.target.value)} placeholder="user@example.com" />
                <input value={seedKey} onChange={(event) => setSeedKey(event.target.value)} placeholder="seed key" />
                <button type="submit">Assign admin</button>
              </form>
              <h3>Role management</h3>
              {adminUsers.map((user) => (
                <p key={user.id}>
                  {user.email} ({user.roles.join(', ')}){' '}
                  <button
                    onClick={async () => {
                      await fetch(`${API_BASE}/api/admin/users/${user.id}/roles`, {
                        method: 'POST',
                        headers: authHeaders,
                        body: JSON.stringify({ role: 'viewer' })
                      });
                      await loadAdminData();
                    }}
                  >
                    +viewer
                  </button>
                </p>
              ))}
              <h3>Quota rules</h3>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  await fetch(`${API_BASE}/api/admin/quota-rules/${encodeURIComponent(quotaServiceName)}`, {
                    method: 'PUT',
                    headers: authHeaders,
                    body: JSON.stringify({ defaultLimit: Number(quotaDefaultLimit), unit: 'count', warningAtPct: 80, criticalAtPct: 95 })
                  });
                  await loadAdminData();
                }}
                style={{ display: 'flex', gap: 8 }}
              >
                <input value={quotaServiceName} onChange={(event) => setQuotaServiceName(event.target.value)} placeholder="service name" />
                <input value={quotaDefaultLimit} onChange={(event) => setQuotaDefaultLimit(event.target.value)} placeholder="limit" />
                <button type="submit">Upsert rule</button>
              </form>
              {quotaRules.map((rule) => (
                <p key={rule.id}>
                  {rule.serviceName}: {rule.defaultLimit} {rule.unit} (warn {rule.warningAtPct}% / crit {rule.criticalAtPct}%)
                </p>
              ))}
            </section>
          ) : null}
        </>
      )}
      {message ? <p>{message}</p> : null}
    </main>
  );
};

export default App;
