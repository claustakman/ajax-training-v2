import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login fejlede');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--bg-card)', borderRadius: 16,
        padding: 32, boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-block',
            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 32,
            color: 'var(--accent)', letterSpacing: 2, marginBottom: 4,
          }}>
            AJAX
          </div>
          <div style={{ color: 'var(--text2)', fontSize: 14 }}>Træningsplanlægger</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--bg-input)', border: '1px solid var(--border2)',
                borderRadius: 8, fontSize: 16, color: 'var(--text)',
                minHeight: 44,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
              Adgangskode
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--bg-input)', border: '1px solid var(--border2)',
                borderRadius: 8, fontSize: 16, color: 'var(--text)',
                minHeight: 44,
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
              borderRadius: 8, padding: '10px 12px', color: 'var(--red)', fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8, padding: '12px',
              background: loading ? 'var(--text3)' : 'var(--accent)',
              color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15,
              minHeight: 44, transition: 'background 0.15s',
            }}
          >
            {loading ? 'Logger ind…' : 'Log ind'}
          </button>
        </form>
      </div>
    </div>
  );
}
