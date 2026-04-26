export type AppRole = 'admin' | 'operator' | 'viewer';

export type AuthUser = {
  id: string;
  email: string;
  roles: AppRole[];
};
