import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { api } from './api';

export interface Team {
  id: string;
  name: string;
  age_group: string;
  season: string;
  role: 'guest' | 'trainer' | 'team_manager';  // hold-specifik rolle
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'guest' | 'trainer' | 'team_manager' | 'admin';  // global rolle (kun 'admin' er meningsfuld)
  teams: Team[];
  last_seen?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  currentTeamId: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  loginWithToken: (token: string, user: AuthUser) => void;
  logout: () => void;
  setCurrentTeam: (teamId: string) => void;
  refreshUser: () => Promise<void>;
  /** Rollen for det aktive hold. Admin returnerer 'admin'. */
  currentTeamRole: 'guest' | 'trainer' | 'team_manager' | 'admin' | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('ajax_token');
    const userRaw = localStorage.getItem('ajax_user');
    const currentTeamId = localStorage.getItem('ajax_current_team');
    return {
      token,
      user: userRaw ? (JSON.parse(userRaw) as AuthUser) : null,
      currentTeamId,
    };
  });

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', { email, password });
    localStorage.setItem('ajax_token', res.token);
    localStorage.setItem('ajax_user', JSON.stringify(res.user));
    const currentTeamId =
      localStorage.getItem('ajax_current_team') ??
      res.user.teams[0]?.id ?? null;
    if (currentTeamId) localStorage.setItem('ajax_current_team', currentTeamId);
    setState({ token: res.token, user: res.user, currentTeamId });
  }, []);

  const loginWithToken = useCallback((token: string, user: AuthUser) => {
    localStorage.setItem('ajax_token', token);
    localStorage.setItem('ajax_user', JSON.stringify(user));
    const currentTeamId = user.teams[0]?.id ?? null;
    if (currentTeamId) localStorage.setItem('ajax_current_team', currentTeamId);
    setState({ token, user, currentTeamId });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ajax_token');
    localStorage.removeItem('ajax_user');
    setState({ token: null, user: null, currentTeamId: null });
  }, []);

  const setCurrentTeam = useCallback((teamId: string) => {
    localStorage.setItem('ajax_current_team', teamId);
    setState(s => ({ ...s, currentTeamId: teamId }));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!state.token) return;
    const freshUser = await api.get<AuthUser>('/api/auth/me');
    localStorage.setItem('ajax_user', JSON.stringify(freshUser));
    setState(s => ({ ...s, user: freshUser }));
  }, [state.token]);

  // Udled aktiv hold-rolle
  const currentTeamRole = (() => {
    if (!state.user) return null;
    if (state.user.role === 'admin') return 'admin';
    if (!state.currentTeamId) return null;
    const team = state.user.teams.find(t => t.id === state.currentTeamId);
    return team?.role ?? null;
  })();

  return (
    <AuthContext.Provider value={{ ...state, login, loginWithToken, logout, setCurrentTeam, refreshUser, currentTeamRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth skal bruges inden i AuthProvider');
  return ctx;
}

const ROLE_LEVEL: Record<string, number> = {
  guest: 1, trainer: 2, team_manager: 3, admin: 4,
};

/**
 * Tjek om brugeren har mindst `minRole` i den givne kontekst.
 * Brug `effectiveRole` (currentTeamRole) fremfor user.role for hold-scoped checks.
 * Admin er global og slår altid igennem.
 */
export function hasRole(user: AuthUser | null, minRole: string, effectiveRole?: string | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const role = effectiveRole ?? user.role;
  return (ROLE_LEVEL[role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0);
}

export const ROLE_LABELS: Record<string, string> = {
  guest: 'Gæst',
  trainer: 'Træner',
  team_manager: 'Årgangsansvarlig',
  admin: 'Admin',
};
