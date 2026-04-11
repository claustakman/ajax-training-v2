import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, hasRole, ROLE_LABELS, type Team } from '../lib/auth';
import { api, ApiError } from '../lib/api';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'guest' | 'trainer' | 'team_manager' | 'admin';
  last_seen: string | null;
  created_at: string;
  teams: Team[];
}

const ROLES = ['guest', 'trainer', 'team_manager', 'admin'] as const;
const AGE_GROUPS = ['U9', 'U11', 'U13', 'U15', 'U17', 'U19', 'Senior'];

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export default function Admin() {
  const { user } = useAuth();
  if (!hasRole(user, 'admin')) return <Navigate to="/" replace />;

  const [tab, setTab] = useState<'brugere' | 'hold'>('brugere');

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 16px' }}>Admin</h1>

      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-input)', borderRadius: 10, padding: 4 }}>
        {(['brugere', 'hold'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 600, fontSize: 14, background: tab === t ? 'var(--bg-card)' : 'transparent', color: tab === t ? 'var(--accent)' : 'var(--text2)', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            {t === 'brugere' ? '👥 Brugere' : '🤾 Hold'}
          </button>
        ))}
      </div>

      {tab === 'brugere' && <BrugerTab />}
      {tab === 'hold' && <HoldTab />}
    </div>
  );
}

// ─── Brugertab ────────────────────────────────────────────────────────────────

function BrugerTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'trainer' as typeof ROLES[number] });
  const [inviteLink, setInviteLink] = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const inviteLinkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      api.get<AdminUser[]>('/api/users'),
      api.get<Team[]>('/api/teams'),
    ]).then(([u, t]) => { setUsers(u); setTeams(t); })
      .finally(() => setLoading(false));
  }, []);

  async function handleRoleChange(userId: string, role: string) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as AdminUser['role'] } : u));
    try { await api.patch(`/api/users/${userId}`, { role }); }
    catch { /* revert ville kræve gammel state — simpel løsning: reload */ }
  }

  async function handleAddTeam(userId: string, teamId: string) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, teams: [...u.teams, team] } : u));
    try { await api.post(`/api/users/${userId}/teams`, { team_id: teamId }); }
    catch { setUsers(prev => prev.map(u => u.id === userId ? { ...u, teams: u.teams.filter(t => t.id !== teamId) } : u)); }
  }

  async function handleRemoveTeam(userId: string, teamId: string) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, teams: u.teams.filter(t => t.id !== teamId) } : u));
    try { await api.delete(`/api/users/${userId}/teams/${teamId}`); }
    catch { const team = teams.find(t => t.id === teamId); if (team) setUsers(prev => prev.map(u => u.id === userId ? { ...u, teams: [...u.teams, team] } : u)); }
  }

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`Slet brugeren "${name}"? Dette kan ikke fortrydes.`)) return;
    try {
      await api.delete(`/api/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Slet fejlede');
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
      const res = await api.post<{ invite_token: string; user_id: string }>('/api/auth/invite', inviteForm);
      const link = `${window.location.origin}/invite/${res.invite_token}`;
      setInviteLink(link);
      setInviteForm({ name: '', email: '', role: 'trainer' });
      // Opdater brugerliste
      const freshUsers = await api.get<AdminUser[]>('/api/users');
      setUsers(freshUsers);
      setTimeout(() => inviteLinkRef.current?.select(), 100);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Opret fejlede');
    } finally { setInviteSaving(false); }
  }

  if (loading) return <div style={{ color: 'var(--text3)', padding: 24 }}>Henter brugere…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Opret ny bruger */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>Invitér ny bruger</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <input placeholder="Navn" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
            style={{ flex: '1 1 160px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 15, color: 'var(--text)' }} />
          <input placeholder="Email" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
            style={{ flex: '2 1 200px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 15, color: 'var(--text)' }} />
          <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as typeof ROLES[number] }))}
            style={{ flex: '1 1 140px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 14, color: 'var(--text)' }}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
            <button onClick={() => { navigator.clipboard.writeText(inviteLink); }}
              style={{ padding: '8px 14px', background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              Kopiér
            </button>
          </div>
        )}
      </div>

      {/* Brugerliste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => (
          <UserRow key={u.id} user={u} allTeams={teams}
            onRoleChange={r => handleRoleChange(u.id, r)}
            onAddTeam={tid => handleAddTeam(u.id, tid)}
            onRemoveTeam={tid => handleRemoveTeam(u.id, tid)}
            onDelete={() => handleDelete(u.id, u.name)}
            onResetPassword={() => handleResetPassword(u.id, u.name)}
          />
        ))}
      </div>
    </div>
  );
}

function UserRow({ user, allTeams, onRoleChange, onAddTeam, onRemoveTeam, onDelete, onResetPassword }: {
  user: AdminUser; allTeams: Team[];
  onRoleChange: (role: string) => void;
  onAddTeam: (teamId: string) => void;
  onRemoveTeam: (teamId: string) => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const availableTeams = allTeams.filter(t => !user.teams.find(ut => ut.id === t.id));

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      {/* Hoved-række */}
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
          {ROLE_LABELS[user.role]}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </button>

      {/* Udvidet */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Rolle */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6, marginTop: 14 }}>Rolle</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ROLES.map(r => (
                <button key={r} onClick={() => onRoleChange(r)}
                  style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, background: user.role === r ? 'var(--accent)' : 'var(--bg-input)', color: user.role === r ? '#fff' : 'var(--text2)', border: `1px solid ${user.role === r ? 'var(--accent)' : 'var(--border2)'}` }}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Hold */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Hold</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {user.teams.map(t => (
                <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 20, fontSize: 13, background: 'var(--bg-input)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>
                  {t.name}
                  <button onClick={() => onRemoveTeam(t.id)} style={{ background: 'none', color: 'var(--text3)', fontSize: 12, padding: '0 2px', lineHeight: 1 }}>✕</button>
                </span>
              ))}
              {availableTeams.length > 0 && (
                <select onChange={e => { if (e.target.value) onAddTeam(e.target.value); e.target.value = ''; }}
                  style={{ padding: '4px 10px', borderRadius: 20, fontSize: 13, background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text3)' }}>
                  <option value="">+ Tilføj hold</option>
                  {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              {user.teams.length === 0 && availableTeams.length === 0 && (
                <span style={{ fontSize: 13, color: 'var(--text3)' }}>Ingen hold oprettet endnu</span>
              )}
            </div>
          </div>

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
            <button onClick={onDelete}
              style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'rgba(220,38,38,0.08)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.2)' }}>
              Slet bruger
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Holdtab ──────────────────────────────────────────────────────────────────

function HoldTab() {
  const [teams, setTeams] = useState<(Team & { members: { id: string; name: string; role: string }[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', age_group: 'U11', season: '2025/2026' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<Team[]>('/api/teams'),
      api.get<AdminUser[]>('/api/users'),
    ]).then(([t, u]) => {
      const teamsWithMembers = t.map(team => ({
        ...team,
        members: u.filter(user => user.teams.find(ut => ut.id === team.id))
          .map(user => ({ id: user.id, name: user.name, role: user.role })),
      }));
      setTeams(teamsWithMembers);
    }).finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!form.name.trim()) { setError('Navn er påkrævet'); return; }
    setSaving(true); setError('');
    try {
      const newTeam = await api.post<Team>('/api/teams', form);
      setTeams(prev => [...prev, { ...newTeam, members: [] }]);
      setForm({ name: '', age_group: 'U11', season: '2025/2026' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Opret fejlede');
    } finally { setSaving(false); }
  }

  async function handleDelete(teamId: string, name: string) {
    if (!confirm(`Slet holdet "${name}"? Alle tilknyttede træninger og data slettes også.`)) return;
    try {
      await api.delete(`/api/teams/${teamId}`);
      setTeams(prev => prev.filter(t => t.id !== teamId));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Slet fejlede');
    }
  }

  if (loading) return <div style={{ color: 'var(--text3)', padding: 24 }}>Henter hold…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Opret hold */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>Opret nyt hold</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: error ? 8 : 0 }}>
          <input placeholder="Holdnavn, fx Ajax U11 Piger" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{ flex: '2 1 200px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 15, color: 'var(--text)' }} />
          <select value={form.age_group} onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))}
            style={{ flex: '1 1 100px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 14, color: 'var(--text)' }}>
            {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <input placeholder="Sæson, fx 2025/2026" value={form.season} onChange={e => setForm(f => ({ ...f, season: e.target.value }))}
            style={{ flex: '1 1 120px', padding: '9px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 14, color: 'var(--text)' }} />
          <button onClick={handleCreate} disabled={saving}
            style={{ padding: '9px 18px', background: saving ? 'var(--text3)' : 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14 }}>
            {saving ? 'Opretter…' : '+ Opret hold'}
          </button>
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      </div>

      {/* Holdliste */}
      {teams.length === 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
          Ingen hold oprettet endnu
        </div>
      )}
      {teams.map(team => (
        <div key={team.id} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{team.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{team.age_group} · {team.season}</div>
            </div>
            <button onClick={() => handleDelete(team.id, team.name)}
              style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, background: 'rgba(220,38,38,0.08)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.2)' }}>
              Slet
            </button>
          </div>
          {team.members.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {team.members.map(m => (
                <span key={m.id} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, background: 'var(--bg-input)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>
                  {m.name} <span style={{ color: 'var(--text3)' }}>· {ROLE_LABELS[m.role]}</span>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Ingen brugere tilknyttet endnu</div>
          )}
        </div>
      ))}
    </div>
  );
}
