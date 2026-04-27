const VERCEL_API_BASE = 'https://api.vercel.com';

type VercelUserPayload = {
  user?: {
    id?: string;
    email?: string;
    username?: string;
    billing?: {
      plan?: string;
    };
  };
};

type VercelTeamPayload = {
  id?: string;
  slug?: string;
  name?: string | null;
};

const requestVercel = async <T>(path: string, token: string) => {
  const response = await fetch(`${VERCEL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Vercel API request failed with ${response.status}`);
  }

  return payload;
};

export const validateTokenAndFetchMetadata = async (input: {
  token: string;
  teamId?: string | null;
  teamSlug?: string | null;
}) => {
  const userPayload = await requestVercel<VercelUserPayload>('/v2/user', input.token);
  const user = userPayload.user;

  let team: VercelTeamPayload | null = null;
  if (input.teamId) {
    const query = input.teamSlug ? `?slug=${encodeURIComponent(input.teamSlug)}` : '';
    team = await requestVercel<VercelTeamPayload>(`/v2/teams/${input.teamId}${query}`, input.token);
  }

  return {
    vercelUserId: user?.id ?? null,
    vercelEmail: user?.email ?? null,
    vercelUsername: user?.username ?? null,
    plan: user?.billing?.plan ?? null,
    teamId: team?.id ?? input.teamId ?? null,
    teamSlug: team?.slug ?? input.teamSlug ?? null
  };
};
