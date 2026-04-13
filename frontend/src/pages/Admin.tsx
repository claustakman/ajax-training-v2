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
  teams: Team[];
}

const AGE_GROUPS = ['U9', 'U11', 'U13', 'U15', 'U17', 'U19', 'Senior'];

export default function Admin() {
  const { user, currentTeamRole } = useAuth();
  if (!hasRole(user, 'admin', currentTeamRole)) return <Navigate to="/" replace />;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 20px' }}>Admin — Hold</h1>
      <HoldTab />
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
          .map(user => {
            const teamEntry = user.teams.find(ut => ut.id === team.id);
            return { id: user.id, name: user.name, role: user.role === 'admin' ? 'admin' : (teamEntry?.role ?? user.role) };
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
