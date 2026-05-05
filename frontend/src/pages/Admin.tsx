import { useState, useEffect } from 'react';
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
  teams: (Team & { role: string })[];
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

const AGE_GROUPS = ['U9', 'U11', 'U13', 'U15', 'U17', 'U19', 'Senior'];
const TEAM_ROLES = ['guest', 'trainer', 'team_manager'] as const;

const inputStyle: React.CSSProperties = {
  padding: '9px 16px', background: 'var(--bg-input)',
  border: '1px solid var(--border2)', borderRadius: 8,
  fontSize: 14, color: 'var(--text)', minHeight: 40,
};

export default function Admin() {
  const { user, currentTeamRole } = useAuth();
  if (!hasRole(user, 'admin', currentTeamRole)) return <Navigate to="/" replace />;

  const [tab, setTab] = useState<'hold' | 'brugere'>('hold');

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 16px' }}>Admin</h1>

      {/* Tab-skift */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
        {(['hold', 'brugere'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: 14, fontWeight: 600,
            background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t ? 'var(--accent)' : 'var(--text2)',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t === 'hold' ? 'Hold' : 'Brugere'}
          </button>
        ))}
      </div>

      {tab === 'hold' ? <HoldTab /> : <BrugereTab />}
    </div>
  );
}

// ─── Hold-tab ─────────────────────────────────────────────────────────────────

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
        members: u
          .filter(user => user.teams.find(ut => ut.id === team.id))
          .map(user => {
            const teamEntry = user.teams.find(ut => ut.id === team.id);
            return {
              id: user.id,
              name: user.name,
              role: user.role === 'admin' ? 'admin' : (teamEntry?.role ?? 'guest'),
            };
          }),
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
          <input placeholder="Holdnavn, fx Ajax U11 Piger" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{ ...inputStyle, flex: '2 1 200px' }} />
          <select value={form.age_group} onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))}
            style={{ ...inputStyle, flex: '1 1 100px' }}>
            {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <input placeholder="Sæson, fx 2025/2026" value={form.season}
            onChange={e => setForm(f => ({ ...f, season: e.target.value }))}
            style={{ ...inputStyle, flex: '1 1 120px' }} />
          <button onClick={handleCreate} disabled={saving}
            style={{ padding: '12px 24px', background: saving ? 'var(--text3)' : 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer' }}>
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
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, background: 'rgba(220,38,38,0.08)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.2)', cursor: 'pointer' }}>
              Slet
            </button>
          </div>
          {team.members.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {team.members.map(m => (
                <span key={m.id} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, background: 'var(--bg-input)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>
                  {m.name} <span style={{ color: 'var(--text3)' }}>· {ROLE_LABELS[m.role] ?? m.role}</span>
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

// ─── Brugere-tab ──────────────────────────────────────────────────────────────

function BrugereTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([
      api.get<AdminUser[]>('/api/users'),
      api.get<Team[]>('/api/teams'),
    ]).then(([u, t]) => {
      setUsers(u);
      setTeams(t);
    }).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleRoleChange(userId: string, teamId: string, newRole: string) {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      return { ...u, teams: u.teams.map(t => t.id === teamId ? { ...t, role: newRole as Team['role'] } : t) };
    }));
    try {
      await api.patch(`/api/users/${userId}/teams/${teamId}`, { role: newRole });
    } catch {
      load(); // revert
    }
  }

  async function handleAddToTeam(userId: string, teamId: string, role: string) {
    try {
      await api.post(`/api/users/${userId}/teams`, { team_id: teamId, role });
      load(); // genindlæs for at vise opdateret holdliste
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Fejl ved tilføjelse');
    }
  }

  async function handleRemoveFromTeam(userId: string, teamId: string, teamName: string) {
    if (!confirm(`Fjern bruger fra "${teamName}"?`)) return;
    try {
      await api.delete(`/api/users/${userId}/teams/${teamId}`);
      setUsers(prev => prev.map(u =>
        u.id !== userId ? u : { ...u, teams: u.teams.filter(t => t.id !== teamId) }
      ));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Fejl');
    }
  }

  if (loading) return <div style={{ color: 'var(--text3)', padding: 24 }}>Henter brugere…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {users.length === 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
          Ingen brugere
        </div>
      )}
      {users.map(u => (
        <AdminUserRow
          key={u.id}
          user={u}
          allTeams={teams}
          expanded={expandedId === u.id}
          onToggle={() => setExpandedId(prev => prev === u.id ? null : u.id)}
          onRoleChange={(teamId, role) => handleRoleChange(u.id, teamId, role)}
          onAddToTeam={(teamId, role) => handleAddToTeam(u.id, teamId, role)}
          onRemoveFromTeam={(teamId, teamName) => handleRemoveFromTeam(u.id, teamId, teamName)}
          onNameChange={newName => setUsers(prev => prev.map(x => x.id === u.id ? { ...x, name: newName } : x))}
        />
      ))}
    </div>
  );
}

// ─── AdminUserRow ─────────────────────────────────────────────────────────────

function AdminUserRow({ user, allTeams, expanded, onToggle, onRoleChange, onAddToTeam, onRemoveFromTeam, onNameChange }: {
  user: AdminUser;
  allTeams: Team[];
  expanded: boolean;
  onToggle: () => void;
  onRoleChange: (teamId: string, role: string) => void;
  onAddToTeam: (teamId: string, role: string) => void;
  onRemoveFromTeam: (teamId: string, teamName: string) => void;
  onNameChange: (newName: string) => void;
}) {
  const [addTeamId, setAddTeamId] = useState('');
  const [addRole, setAddRole] = useState<typeof TEAM_ROLES[number]>('trainer');
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user.name);
  const [savingName, setSavingName] = useState(false);

  async function handleNameSave() {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === user.name) { setEditingName(false); setNameValue(user.name); return; }
    setSavingName(true);
    try {
      await api.patch(`/api/users/${user.id}`, { name: trimmed });
      onNameChange(trimmed);
      setEditingName(false);
    } catch { setNameValue(user.name); }
    finally { setSavingName(false); }
  }

  const userTeamIds = new Set(user.teams.map(t => t.id));
  const availableTeams = allTeams.filter(t => !userTeamIds.has(t.id));

  async function handleAdd() {
    if (!addTeamId) return;
    setAdding(true);
    await onAddToTeam(addTeamId, addRole);
    setAddTeamId('');
    setAdding(false);
  }

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      {/* Header */}
      <button onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        width: '100%', padding: '14px 16px', background: 'none',
        border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--accent-light)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, color: 'var(--accent)', fontSize: 15,
        }}>
          {user.name[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{user.email}</div>
        </div>

        {/* Hold-badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: '45%' }}>
          {user.role === 'admin' ? (
            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#7c3aed20', color: '#7c3aed' }}>
              Admin
            </span>
          ) : user.teams.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>Ingen hold</span>
          ) : (
            user.teams.slice(0, 2).map(t => (
              <span key={t.id} style={{ padding: '3px 8px', borderRadius: 20, fontSize: 11, background: 'var(--bg-input)', color: 'var(--text2)', border: '1px solid var(--border2)', whiteSpace: 'nowrap' }}>
                {t.name.replace(/Ajax\s*/i, '')}
              </span>
            ))
          )}
          {user.teams.length > 2 && (
            <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>+{user.teams.length - 2}</span>
          )}
        </div>

        <span style={{ fontSize: 12, color: 'var(--text3)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </button>

      {/* Expanded */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px' }}>

          {/* Navn-redigering */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Navn</div>
            {editingName ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') { setEditingName(false); setNameValue(user.name); } }}
                  style={{ ...inputStyle, flex: 1, fontSize: 14 }}
                />
                <button onClick={handleNameSave} disabled={savingName} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {savingName ? '…' : 'Gem'}
                </button>
                <button onClick={() => { setEditingName(false); setNameValue(user.name); }} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>
                  Annuller
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14 }}>{user.name}</span>
                <button onClick={() => setEditingName(true)} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Rediger
                </button>
              </div>
            )}
          </div>

          {/* Aktivitet */}
          <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
            Seneste aktivitet: <strong style={{ color: 'var(--text2)' }}>{formatDate(user.last_seen)}</strong>
            <span style={{ margin: '0 6px' }}>·</span>
            Oprettet: <strong style={{ color: 'var(--text2)' }}>{formatDate(user.created_at)}</strong>
          </div>

          {/* Admin-bruger */}
          {user.role === 'admin' && (
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
              Admin — global rolle, har adgang til alle hold
            </div>
          )}

          {/* Hold-tilknytninger */}
          {user.role !== 'admin' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
                Holdtilknytninger
              </div>

              {user.teams.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14 }}>
                  Ikke tilknyttet nogen hold endnu
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  {user.teams.map(t => (
                    <div key={t.id} style={{
                      background: 'var(--bg-input)', borderRadius: 8,
                      padding: '10px 12px', border: '1px solid var(--border2)',
                    }}>
                      {/* Hold-navn */}
                      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{t.name}</div>

                      {/* Rolle-knapper */}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                        {TEAM_ROLES.map(r => (
                          <button key={r} onClick={() => onRoleChange(t.id, r)}
                            style={{
                              padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                              background: t.role === r ? 'var(--accent)' : 'var(--bg-card)',
                              color: t.role === r ? '#fff' : 'var(--text2)',
                              border: `1px solid ${t.role === r ? 'var(--accent)' : 'var(--border2)'}`,
                              cursor: 'pointer',
                            }}>
                            {ROLE_LABELS[r] ?? r}
                          </button>
                        ))}
                        <button onClick={() => onRemoveFromTeam(t.id, t.name)}
                          style={{
                            marginLeft: 'auto', padding: '8px 14px', borderRadius: 20, fontSize: 12,
                            background: 'rgba(220,38,38,0.08)', color: 'var(--red)',
                            border: '1px solid rgba(220,38,38,0.2)', cursor: 'pointer',
                          }}>
                          Fjern
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tilføj til hold */}
              {availableTeams.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                    Tilføj til hold
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select value={addTeamId} onChange={e => setAddTeamId(e.target.value)}
                      style={{ ...inputStyle, flex: '2 1 180px' }}>
                      <option value="">Vælg hold…</option>
                      {availableTeams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <select value={addRole} onChange={e => setAddRole(e.target.value as typeof TEAM_ROLES[number])}
                      style={{ ...inputStyle, flex: '1 1 120px' }}>
                      {TEAM_ROLES.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                      ))}
                    </select>
                    <button onClick={handleAdd} disabled={!addTeamId || adding}
                      style={{
                        padding: '12px 24px', background: addTeamId && !adding ? 'var(--accent)' : 'var(--text3)',
                        color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: 'none', cursor: addTeamId && !adding ? 'pointer' : 'not-allowed',
                        minHeight: 40,
                      }}>
                      {adding ? '…' : '+ Tilføj'}
                    </button>
                  </div>
                </div>
              )}

              {availableTeams.length === 0 && user.teams.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  Bruger er allerede på alle hold
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
