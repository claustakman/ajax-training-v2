/**
 * BiometricSetupSheet — vises efter adgangskode-login, tilbyder at aktivere Face ID / Touch ID.
 *
 * Vises kun hvis:
 *   1. Enhed understøtter platform authenticator
 *   2. Bruger ikke allerede har registreret en enhed her (localStorage flag)
 *   3. Bruger ikke har valgt "Spørg ikke igen" (localStorage flag)
 *   4. sessionStorage-flag er sat af Login.tsx (password-login netop sket)
 */

import { useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '../lib/api';
import { BIOMETRIC_PROMPT_KEY } from '../pages/Login';

const ENROLLED_KEY = 'ajax_biometric_enrolled';
const DISMISSED_KEY = 'ajax_biometric_dismissed';

function toB64url(buf: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export default function BiometricSetupSheet() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<'idle' | 'enrolling' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Only show if password-login just happened
    if (sessionStorage.getItem(BIOMETRIC_PROMPT_KEY) !== '1') return;
    sessionStorage.removeItem(BIOMETRIC_PROMPT_KEY);

    // Skip if permanently dismissed or already enrolled on this device
    if (localStorage.getItem(DISMISSED_KEY) === '1') return;
    if (localStorage.getItem(ENROLLED_KEY) === '1') return;

    // Check platform authenticator availability
    if (typeof PublicKeyCredential === 'undefined') return;
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return;

    PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(ok => { if (ok) setVisible(true); })
      .catch(() => {});
  }, []);

  const handleEnable = useCallback(async () => {
    setStep('enrolling');
    setErrorMsg('');
    try {
      // 1. Get registration options
      const options = await api.webauthnRegisterOptions();

      // 2. Build PublicKeyCredentialCreationOptions
      const pkOptions: PublicKeyCredentialCreationOptions = {
        challenge: Uint8Array.from(
          atob((options.challenge as string).replace(/-/g, '+').replace(/_/g, '/')),
          c => c.charCodeAt(0)
        ),
        rp: options.rp as PublicKeyCredentialRpEntity,
        user: {
          id: Uint8Array.from(
            atob((options.user as { id: string }).id.replace(/-/g, '+').replace(/_/g, '/')),
            c => c.charCodeAt(0)
          ),
          name: (options.user as { name: string }).name,
          displayName: (options.user as { displayName: string }).displayName,
        },
        pubKeyCredParams: (options.pubKeyCredParams as Array<{ type: string; alg: number }>).map(p => ({
          type: 'public-key' as const,
          alg: p.alg,
        })),
        authenticatorSelection: options.authenticatorSelection as AuthenticatorSelectionCriteria,
        timeout: (options.timeout as number) ?? 60000,
        attestation: 'none',
        excludeCredentials: ((options.excludeCredentials as Array<{ id: string; type: string }>) ?? []).map(c => ({
          id: Uint8Array.from(atob(c.id.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)),
          type: 'public-key' as const,
        })),
      };

      // 3. Trigger biometric registration
      const credential = await navigator.credentials.create({ publicKey: pkOptions }) as PublicKeyCredential | null;
      if (!credential) { setStep('error'); setErrorMsg('Registrering annulleret'); return; }

      const response = credential.response as AuthenticatorAttestationResponse;

      // 4. Verify with server
      await api.webauthnRegisterVerify({
        id: credential.id,
        rawId: toB64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: toB64url(response.clientDataJSON),
          attestationObject: toB64url(response.attestationObject),
        },
      });

      localStorage.setItem(ENROLLED_KEY, '1');
      setStep('success');
      setTimeout(() => setVisible(false), 2000);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMsg('Biometrisk registrering afvist eller afbrudt');
      } else {
        setErrorMsg('Noget gik galt — prøv igen senere');
      }
      setStep('error');
    }
  }, []);

  function handleNotNow() {
    setVisible(false);
    // Will ask again next password login (no permanent flag)
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleNotNow}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900,
        }}
      />
      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 901,
        background: 'var(--bg-card)', borderRadius: '16px 16px 0 0',
        padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
      }}>
        {/* Drag handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0 auto 20px' }} />

        {step === 'success' ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Face ID / Touch ID aktiveret!</div>
            <div style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>
              Du kan nu logge ind med biometri næste gang.
            </div>
          </div>
        ) : step === 'error' ? (
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Noget gik galt</div>
            <div style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 16 }}>{errorMsg}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleEnable}
                style={{ padding: '12px 24px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, minHeight: 44 }}
              >
                Prøv igen
              </button>
              <button
                onClick={handleNotNow}
                style={{ padding: '10px 24px', background: 'var(--bg-input)', color: 'var(--text)', borderRadius: 8, fontWeight: 500, fontSize: 15, minHeight: 44 }}
              >
                Ikke nu
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: 36 }}>🪪</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Aktivér Face ID / Touch ID</div>
                <div style={{ color: 'var(--text2)', fontSize: 14 }}>
                  Log ind hurtigere med biometri næste gang.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
              <button
                onClick={handleEnable}
                disabled={step === 'enrolling'}
                style={{
                  padding: '12px 24px',
                  background: step === 'enrolling' ? 'var(--text3)' : 'var(--accent)',
                  color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 15, minHeight: 44,
                }}
              >
                {step === 'enrolling' ? 'Registrerer…' : 'Aktivér'}
              </button>
              <button
                onClick={handleNotNow}
                disabled={step === 'enrolling'}
                style={{ padding: '10px 24px', background: 'var(--bg-input)', color: 'var(--text)', borderRadius: 8, fontWeight: 500, fontSize: 15, minHeight: 44 }}
              >
                Ikke nu
              </button>
              <button
                onClick={handleDismiss}
                disabled={step === 'enrolling'}
                style={{ padding: '8px', background: 'transparent', color: 'var(--text3)', fontSize: 13 }}
              >
                Spørg mig ikke igen
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
