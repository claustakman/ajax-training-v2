import { useState, useEffect, type FormEvent } from 'react';
import { useAuth, ROLE_LABELS } from '../lib/auth';
import { api, ApiError } from '../lib/api';

function formatDate(iso: string | null | undefined) {
  if (!iso) return 'Aldrig';
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
}

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  // Skift password
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    api.get<{ last_seen: string | null }>('/api/auth/me')
      .then(u => setLastSeen(u.last_seen ?? null))
      .catch(() => {});
  }, []);

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setPwError('Adgangskoderne stemmer ikke overens'); return; }
    if (next.length < 6) { setPwError('Adgangskoden skal være mindst 6 tegn'); return; }
    setPwSaving(true); setPwError(''); setPwSuccess(false);
    try {
      await api.post('/api/auth/reset-password', { current_password: current, new_password: next });
      setPwSuccess(true);
      setCurrent(''); setNext(''); setConfirm('');
      await refreshUser();
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Noget gik galt');
    } finally { setPwSaving(false); }
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 20px' }}>Min profil</h1>

      {/* Profilkort */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{user?.name}</div>
            <div style={{ color: 'var(--text2)', fontSize: 14 }}>{user?.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600, background: 'var(--accent-light)', color: 'var(--accent)' }}>
            {ROLE_LABELS[user?.role ?? ''] ?? user?.role}
          </span>
          <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 13, color: 'var(--text2)', background: 'var(--bg-input)' }}>
            Seneste login: {formatDate(lastSeen)}
          </span>
        </div>
      </div>

      {/* Hold */}
      {user && user.teams.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>Mine hold</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {user.teams.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
                <span style={{ fontSize: 18 }}>🤾</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t.age_group} · {t.season}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skift password */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Skift adgangskode</div>
        <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'Nuværende adgangskode', value: current, onChange: setCurrent },
            { label: 'Ny adgangskode', value: next, onChange: setNext },
            { label: 'Bekræft ny adgangskode', value: confirm, onChange: setConfirm },
          ].map(({ label, value, onChange }) => (
            <div key={label}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>{label}</label>
              <input type="password" value={value} onChange={e => onChange(e.target.value)} required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 16, color: 'var(--text)', minHeight: 44, boxSizing: 'border-box' }} />
            </div>
          ))}
          {pwError && (
            <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 12px', color: 'var(--red)', fontSize: 13 }}>{pwError}</div>
          )}
          {pwSuccess && (
            <div style={{ background: 'rgba(29,158,117,0.08)', border: '1px solid rgba(29,158,117,0.3)', borderRadius: 8, padding: '10px 12px', color: 'var(--green)', fontSize: 13 }}>Adgangskode opdateret ✓</div>
          )}
          <button type="submit" disabled={pwSaving}
            style={{ padding: '11px 0', background: pwSaving ? 'var(--text3)' : 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 14, minHeight: 44 }}>
            {pwSaving ? 'Gemmer…' : 'Skift adgangskode'}
          </button>
        </form>
      </div>
    </div>
  );
}
