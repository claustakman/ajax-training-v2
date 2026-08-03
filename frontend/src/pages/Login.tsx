import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';

const LAST_EMAIL_KEY = 'ajax_last_email';
// sessionStorage flag checked by BiometricSetupSheet after login
export const BIOMETRIC_PROMPT_KEY = 'ajax_biometric_prompt';

export default function Login() {
  const { login, loginWithToken, sessionExpired, dismissSessionExpired } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem(LAST_EMAIL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // true when platform authenticator is available (Face ID / Touch ID / Windows Hello)
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  useEffect(() => {
    if (
      typeof PublicKeyCredential !== 'undefined' &&
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(ok => setBiometricAvailable(ok))
        .catch(() => {});
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      localStorage.setItem(LAST_EMAIL_KEY, email);
      dismissSessionExpired();
      // Signal BiometricSetupSheet (mounted inside the authenticated shell) to maybe prompt
      sessionStorage.setItem(BIOMETRIC_PROMPT_KEY, '1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login fejlede');
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometric() {
    if (!email.trim()) {
      setError('Indtast din email for at bruge Face ID / Touch ID');
      return;
    }
    setError('');
    setBiometricLoading(true);
    try {
      // 1. Get options from server (includes challenge + allowed credential IDs)
      const options = await api.webauthnLoginOptions(email.trim().toLowerCase());

      // If server returned empty allowCredentials, no credential registered for this email
      const allowCreds = (options.allowCredentials as unknown[]) ?? [];
      if (!allowCreds.length) {
        setError('Ingen biometrisk login registreret for denne email. Log ind med adgangskode først.');
        return;
      }

      // 2. Build PublicKeyCredentialRequestOptions
      const pkOptions: PublicKeyCredentialRequestOptions = {
        challenge: Uint8Array.from(atob((options.challenge as string).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        rpId: options.rpId as string,
        allowCredentials: (allowCreds as Array<{ id: string; type: string; transports?: string[] }>).map(c => ({
          id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)),
          type: 'public-key' as const,
          transports: (c.transports ?? ['internal']) as AuthenticatorTransport[],
        })),
        userVerification: 'required',
        timeout: (options.timeout as number) ?? 60000,
      };

      // 3. Trigger platform authenticator (Face ID / Touch ID prompt)
      const assertion = await navigator.credentials.get({ publicKey: pkOptions }) as PublicKeyCredential | null;
      if (!assertion) { setError('Biometrisk login annulleret'); return; }

      const response = assertion.response as AuthenticatorAssertionResponse;

      function toB64url(buf: ArrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      }

      // 4. Verify with server
      const result = await api.webauthnLoginVerify({
        id: assertion.id,
        rawId: toB64url(assertion.rawId),
        type: assertion.type,
        response: {
          clientDataJSON: toB64url(response.clientDataJSON),
          authenticatorData: toB64url(response.authenticatorData),
          signature: toB64url(response.signature),
          userHandle: response.userHandle ? toB64url(response.userHandle) : undefined,
        },
      });

      localStorage.setItem(LAST_EMAIL_KEY, email.trim().toLowerCase());
      dismissSessionExpired();
      // Mark this device as enrolled so BiometricSetupSheet doesn't prompt
      localStorage.setItem('ajax_biometric_enrolled', '1');
      loginWithToken(result.token, result.user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Biometrisk login afbrudt eller afvist');
      } else {
        setError('Biometrisk login fejlede');
      }
    } finally {
      setBiometricLoading(false);
    }
  }

  const anyLoading = loading || biometricLoading;

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
          <img src="/ajax-logo.png" alt="Ajax København" style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: 12 }} />
          <div style={{ color: 'var(--text2)', fontSize: 14 }}>Træningsplanlægger</div>
        </div>

        {sessionExpired && (
          <div style={{
            background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
            borderRadius: 8, padding: '10px 12px', color: 'var(--yellow)', fontSize: 14,
            marginBottom: 16,
          }}>
            Din session er udløbet. Log ind igen.
          </div>
        )}

        {/* Email field — shared between password and biometric flows */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={anyLoading}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 8, fontSize: 16, color: 'var(--text)',
              minHeight: 44, boxSizing: 'border-box',
            }}
          />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              disabled={anyLoading}
              style={{
                width: '100%', padding: '10px 12px',
                background: 'var(--bg-input)', border: '1px solid var(--border2)',
                borderRadius: 8, fontSize: 16, color: 'var(--text)',
                minHeight: 44, boxSizing: 'border-box',
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
            disabled={anyLoading}
            style={{
              marginTop: 4, padding: '12px',
              background: anyLoading ? 'var(--text3)' : 'var(--accent)',
              color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15,
              minHeight: 44, transition: 'background 0.15s',
            }}
          >
            {loading ? 'Logger ind…' : 'Log ind'}
          </button>
        </form>

        {/* Biometric button — only when platform authenticator is available */}
        {biometricAvailable && (
          <button
            type="button"
            onClick={handleBiometric}
            disabled={anyLoading}
            style={{
              marginTop: 10, width: '100%', padding: '12px',
              background: 'var(--bg-input)', border: '1.5px solid var(--border2)',
              borderRadius: 8, fontWeight: 600, fontSize: 15, color: 'var(--text)',
              minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: anyLoading ? 'not-allowed' : 'pointer',
              opacity: anyLoading ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 20 }}>🪪</span>
            {biometricLoading ? 'Venter på biometri…' : 'Log ind med Face ID / Touch ID'}
          </button>
        )}
      </div>
    </div>
  );
}
