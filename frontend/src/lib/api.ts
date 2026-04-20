// API-klient — BASE_URL skifter prod/dev
import type { Training, Template, BoardPost, BoardComment, BoardAttachment } from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

// ── AI-typer ──────────────────────────────────────────────────────────────────

export interface AISuggestRequest {
  team_id: string;
  sections: Array<{ type: string; mins: number }>;
  themes: string[];
  vary: boolean;
  single_section?: boolean;
}

export interface AISuggestResultSection {
  type: string;
  mins: number;
  exercises: Array<{
    exerciseId: string;
    mins: number;
    done: boolean;
  }>;
}

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
  fetchTemplates: (teamId: string, filters?: { type?: 'training' | 'section'; section_type?: string }) => {
    const q = new URLSearchParams({ team_id: teamId, ...(filters ?? {}) }).toString();
    return request<Template[]>(`/api/templates?${q}`);
  },
  createTemplate: (data: {
    name: string; sections: unknown[]; team_id: string;
    type?: 'training' | 'section'; section_type?: string;
    themes?: string[]; description?: string;
  }) => request<Template>('/api/templates', { method: 'POST', body: JSON.stringify(data) }),
  deleteTemplate: (id: string) => request<{ deleted: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),

  // ── Hold (opdatér) ────────────────────────────────────────────────────────
  updateTeam: (id: string, data: Record<string, unknown>) =>
    request<import('./auth').Team>(`/api/teams/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ── Holdsport ─────────────────────────────────────────────────────────────
  // Henter workerUrl + token fra vores API — frontend kalder Holdsport-workeren direkte
  fetchHoldsportConfig: (teamId: string) =>
    request<{ workerUrl: string; token: string }>(
      `/api/holdsport/config?team_id=${teamId}`
    ),

  // Kald Holdsport-workeren direkte fra browser (undgår Cloudflare worker-til-worker begrænsning)
  fetchHoldsportTeams: async (workerUrl: string, token: string) => {
    const res = await fetch(`${workerUrl}/teams`, {
      headers: { 'X-Token': token, 'Accept': 'application/json' },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<Array<{ id: string | number; name?: string; title?: string }>>;
  },

  fetchHoldsportActivitiesForTeam: async (workerUrl: string, token: string, teamId: string | number, from: string, to: string) => {
    const url = new URL(`${workerUrl}/teams/${teamId}/activities`);
    url.searchParams.set('date', from);
    url.searchParams.set('to', to);
    url.searchParams.set('per_page', '100');
    const res = await fetch(url.toString(), {
      headers: { 'X-Token': token, 'Accept': 'application/json' },
    });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    return res.json() as Promise<import('./types').HoldsportActivity[]>;
  },

  // Hent én specifik Holdsport-aktivitet via dato (ingen direkte opslag-endpoint)
  fetchHoldsportActivity: async (workerUrl: string, token: string, hsTeamId: string | number, holdsportId: string, date: string) => {
    const url = new URL(`${workerUrl}/teams/${hsTeamId}/activities`);
    url.searchParams.set('date', date);
    url.searchParams.set('to', date);
    url.searchParams.set('per_page', '100');
    const res = await fetch(url.toString(), {
      headers: { 'X-Token': token, 'Accept': 'application/json' },
    });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    const acts = await res.json() as import('./types').HoldsportActivity[];
    return (Array.isArray(acts) ? acts : []).find(a => String(a.id) === holdsportId) ?? null;
  },

  // ── Board ─────────────────────────────────────────────────────────────────
  fetchBoardPosts: (teamId: string, archived?: boolean) =>
    request<BoardPost[]>(`/api/board?team_id=${teamId}&archived=${archived ? 1 : 0}`),

  fetchBoardUnread: (teamId: string) =>
    request<{ unread: boolean }>(`/api/board/unread?team_id=${teamId}`),

  createBoardPost: (data: { team_id: string; title?: string; body: string }) =>
    request<BoardPost>('/api/board', { method: 'POST', body: JSON.stringify(data) }),

  updateBoardPost: (id: string, data: { title?: string; body?: string }) =>
    request<BoardPost>(`/api/board/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteBoardPost: (id: string) =>
    request<void>(`/api/board/${id}`, { method: 'DELETE' }),

  pinBoardPost: (id: string) =>
    request<BoardPost>(`/api/board/${id}/pin`, { method: 'POST' }),

  archiveBoardPost: (id: string) =>
    request<BoardPost>(`/api/board/${id}/archive`, { method: 'POST' }),

  createBoardComment: (postId: string, body: string) =>
    request<BoardComment>(`/api/board/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),

  updateBoardComment: (postId: string, commentId: string, body: string) =>
    request<BoardComment>(`/api/board/${postId}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ body }) }),

  deleteBoardComment: (postId: string, commentId: string) =>
    request<void>(`/api/board/${postId}/comments/${commentId}`, { method: 'DELETE' }),

  uploadBoardAttachment: async (postId: string, file: File): Promise<BoardAttachment> => {
    const token = localStorage.getItem('ajax_token');
    const headers: Record<string, string> = {
      'X-Filename': encodeURIComponent(file.name),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}/api/board/${postId}/attachments`, {
      method: 'POST',
      body: formData,
      headers,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      throw new ApiError(res.status, body.error ?? res.statusText);
    }
    return res.json() as Promise<BoardAttachment>;
  },

  deleteBoardAttachment: (postId: string, attachmentId: string) =>
    request<void>(`/api/board/${postId}/attachments/${attachmentId}`, { method: 'DELETE' }),

  // ── AI-forslag ────────────────────────────────────────────────────────────
  suggestTraining: (data: AISuggestRequest) =>
    request<AISuggestResultSection[]>('/api/ai/suggest', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ── Sektionstyper ─────────────────────────────────────────────────────────
  fetchSectionTypes: (teamId: string) =>
    request<import('./types').SectionType[]>(`/api/section-types?team_id=${teamId}`),

  // ── Øvelser ────────────────────────────────────────────────────────────────
  fetchExercises: (params?: { catalog?: string; age_group?: string }) => {
    const q = new URLSearchParams(params as Record<string, string> ?? {}).toString();
    return request<import('./types').Exercise[]>(`/api/exercises${q ? '?' + q : ''}`);
  },

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
