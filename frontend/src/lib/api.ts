// API-klient — BASE_URL skifter prod/dev
import type { Training, Template } from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('ajax_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  // ── Hold-medlemmer (til ansvarlig/træner-valg) ────────────────────────────
  fetchTeamMembers: (teamId: string) =>
    request<{ id: string; name: string }[]>(`/api/users/team-members?team_id=${teamId}`),

  // ── Kvartaler (til tema-valg) ──────────────────────────────────────────────
  fetchQuarters: (teamId: string) =>
    request<{ id: string; quarter: number; themes: string[] }[]>(`/api/quarters?team_id=${teamId}`),

  // ── Træninger ──────────────────────────────────────────────────────────────
  fetchTrainings: (teamId: string, archived?: 0 | 1) => {
    const q = archived !== undefined ? `&archived=${archived}` : '';
    return request<Training[]>(`/api/trainings?team_id=${teamId}${q}`);
  },
  fetchTraining: (id: string) => request<Training>(`/api/trainings/${id}`),
  createTraining: (data: Partial<Training>) =>
    request<Training>('/api/trainings', { method: 'POST', body: JSON.stringify(data) }),
  updateTraining: (id: string, data: Partial<Training>) =>
    request<Training>(`/api/trainings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTraining: (id: string) => request<{ deleted: boolean }>(`/api/trainings/${id}`, { method: 'DELETE' }),

  // ── Skabeloner ─────────────────────────────────────────────────────────────
  fetchTemplates: (teamId: string) => request<Template[]>(`/api/templates?team_id=${teamId}`),
  createTemplate: (data: { name: string; sections: unknown[]; team_id: string }) =>
    request<Template>('/api/templates', { method: 'POST', body: JSON.stringify(data) }),
  deleteTemplate: (id: string) => request<{ deleted: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),

  // Multipart upload (billeder)
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const token = localStorage.getItem('ajax_token');
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new ApiError(res.status, body.error ?? res.statusText);
    }
    return res.json() as Promise<T>;
  },
};
