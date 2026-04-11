import { useState, useEffect, type FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import type { AuthUser } from '../lib/auth';

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [invalidToken, setInvalidToken] = useState(false);

  useEffect(() => {
    if (!token) { setInvalidToken(true); setLoading(false); return; }
    api.get<{ name: string; email: string }>(`/api/auth/invite-info/${token}`)
      .then(info => { setName(info.name); setEmail(info.email); })
      .catch(() => setInvalidToken(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Adgangskoderne stemmer ikke overens'); return; }
    if (password.length < 6) { setError('Adgangskoden skal være mindst 6 tegn'); return; }
    setSaving(true); setError('');
    try {
      const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/accept-invite', { token, password });
      loginWithToken(res.token, res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Noget gik galt');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'var(--bg-card)', borderRadius: 16, padding: 32, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/ajax-logo.png" alt="Ajax København" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 12 }} />
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Velkommen til Ajax Træning</h1>
          <p style={{ color: 'var(--text2)', fontSize: 14, margin: 0 }}>Opret din adgangskode for at komme i gang</p>
        </div>

        {loading && <p style={{ textAlign: 'center', color: 'var(--text3)' }}>Henter invitation…</p>}

        {!loading && invalidToken && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: 'var(--red)', fontWeight: 600, marginBottom: 8 }}>Ugyldigt eller udløbet invitationslink</p>
            <p style={{ color: 'var(--text2)', fontSize: 14 }}>Kontakt din administrator for at få et nyt link.</p>
          </div>
        )}

        {!loading && !invalidToken && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>Inviteret som</div>
              <div style={{ fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{email}</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
                Adgangskode
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 16, color: 'var(--text)', minHeight: 44, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
                Bekræft adgangskode
              </label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 16, color: 'var(--text)', minHeight: 44, boxSizing: 'border-box' }} />
            </div>

            {error && (
              <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 12px', color: 'var(--red)', fontSize: 14 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={saving}
              style={{ padding: 12, background: saving ? 'var(--text3)' : 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, minHeight: 44 }}>
              {saving ? 'Opretter…' : 'Opret adgangskode og log ind'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
