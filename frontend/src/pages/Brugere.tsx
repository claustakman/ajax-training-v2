import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, hasRole, ROLE_LABELS, type Team } from '../lib/auth';
import { api, ApiError } from '../lib/api';

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: 'guest' | 'trainer' | 'team_manager' | 'admin';
  last_seen: string | null;
  created_at: string;
  teams: Team[];
}

// Roller der kan inviteres/tildeles af en team_manager (maks trainer)
const TEAM_ROLES = ['guest', 'trainer', 'team_manager'] as const;

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export default function Brugere() {
  const { user, currentTeamId, currentTeamRole } = useAuth();

  if (!hasRole(user, 'team_manager', currentTeamRole)) return <Navigate to="/" replace />;
  if (!currentTeamId) return <Navigate to="/" replace />;

  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'trainer' as typeof TEAM_ROLES[number] });
  const [inviteLink, setInviteLink] = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const inviteLinkRef = useRef<HTMLInputElement>(null);

  const currentTeam = user?.teams.find(t => t.id === currentTeamId);

  function load() {
    setLoading(true);
    api.get<TeamUser[]>(`/api/users?team_id=${currentTeamId}`)
      .then(setUsers)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [currentTeamId]);

  async function handleTeamRoleChange(userId: string, newRole: string) {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      return { ...u, teams: u.teams.map(t => t.id === currentTeamId ? { ...t, role: newRole as Team['role'] } : t) };
    }));
    try {
      await api.patch(`/api/users/${userId}/teams/${currentTeamId}`, { role: newRole });
    } catch {
      load(); // revert ved fejl
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Fjern "${name}" fra holdet?`)) return;
    try {
      await api.delete(`/api/users/${userId}/teams/${currentTeamId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Fejl');
    }
  }

  async function handleResetPassword(userId: string, name: string) {
    if (!confirm(`Nulstil adgangskode for "${name}"? De skal bruge et nyt invitationslink.`)) return;
    try {
      const res = await api.post<{ invite_token: string }>('/api/auth/regenerate-invite', { user_id: userId });
      const link = `${window.location.origin}/invite/${res.invite_token}`;
      setInviteLink(link);
      setTimeout(() => inviteLinkRef.current?.select(), 100);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Fejl');
    }
  }

  async function handleInvite() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) { setInviteError('Navn og email er påkrævet'); return; }
    setInviteSaving(true); setInviteError(''); setInviteLink('');
    try {
      const res = await api.post<{ invite_token: string }>('/api/auth/invite', {
        ...inviteForm,
        team_id: currentTeamId,
      });
      const link = `${window.location.origin}/invite/${res.invite_token}`;
      setInviteLink(link);
      setInviteForm({ name: '', email: '', role: 'trainer' });
      load();
      setTimeout(() => inviteLinkRef.current?.select(), 100);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Opret fejlede');
    } finally { setInviteSaving(false); }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>Brugere</h1>
      {currentTeam && (
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>{currentTeam.name}</div>
      )}

      {/* Invitér ny bruger */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>Invitér ny bruger til holdet</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <input placeholder="Navn" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
            style={{ flex: '1 1 160px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 15, color: 'var(--text)' }} />
          <input placeholder="Email" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
            style={{ flex: '2 1 200px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 15, color: 'var(--text)' }} />
          <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as typeof TEAM_ROLES[number] }))}
            style={{ flex: '1 1 140px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 14, color: 'var(--text)' }}>
            {TEAM_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button onClick={handleInvite} disabled={inviteSaving}
            style={{ padding: '9px 18px', background: inviteSaving ? 'var(--text3)' : 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
            {inviteSaving ? 'Opretter…' : '+ Generer invitationslink'}
          </button>
        </div>
        {inviteError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{inviteError}</div>}
        {inviteLink && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input ref={inviteLinkRef} readOnly value={inviteLink}
              style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 13, color: 'var(--text2)' }} />
            <button onClick={() => navigator.clipboard.writeText(inviteLink)}
              style={{ padding: '8px 14px', background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              Kopiér
            </button>
          </div>
        )}
      </div>

      {/* Brugerliste */}
      {loading ? (
        <div style={{ color: 'var(--text3)', padding: 24 }}>Henter brugere…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.length === 0 && (
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
              Ingen brugere på dette hold endnu
            </div>
          )}
          {users.map(u => (
            <UserRow
              key={u.id}
              user={u}
              currentTeamId={currentTeamId}
              onTeamRoleChange={r => handleTeamRoleChange(u.id, r)}
              onRemove={() => handleRemove(u.id, u.name)}
              onResetPassword={() => handleResetPassword(u.id, u.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, currentTeamId, onTeamRoleChange, onRemove, onResetPassword }: {
  user: TeamUser;
  currentTeamId: string;
  onTeamRoleChange: (role: string) => void;
  onRemove: () => void;
  onResetPassword: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const teamEntry = user.teams.find(t => t.id === currentTeamId);
  const displayRole = user.role === 'admin' ? 'admin' : (teamEntry?.role ?? user.role);

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <button onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', background: 'none', textAlign: 'left' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: 15, flexShrink: 0 }}>
          {user.name[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{user.email}</div>
        </div>
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: 'var(--accent-light)', color: 'var(--accent)', flexShrink: 0 }}>
          {ROLE_LABELS[displayRole] ?? displayRole}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Hold-rolle (kan ikke ændres for admin) */}
          {user.role !== 'admin' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, marginTop: 14 }}>Rolle på holdet</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TEAM_ROLES.map(r => (
                  <button key={r} onClick={() => onTeamRoleChange(r)}
                    style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, background: displayRole === r ? 'var(--accent)' : 'var(--bg-input)', color: displayRole === r ? '#fff' : 'var(--text2)', border: `1px solid ${displayRole === r ? 'var(--accent)' : 'var(--border2)'}` }}>
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {user.role === 'admin' && (
            <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text3)' }}>Admin — global rolle, kan ikke ændres her</div>
          )}

          {/* Seneste login */}
          <div style={{ fontSize: 13, color: 'var(--text3)' }}>
            Seneste login: {formatDate(user.last_seen)} · Oprettet: {formatDate(user.created_at)}
          </div>

          {/* Handlinger */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={onResetPassword}
              style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--bg-input)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>
              🔑 Nulstil adgangskode
            </button>
            {user.role !== 'admin' && (
              <button onClick={onRemove}
                style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(220,38,38,0.08)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.2)' }}>
                Fjern fra hold
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
