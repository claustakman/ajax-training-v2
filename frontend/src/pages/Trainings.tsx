import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training } from '../lib/types';
import { fmtDay, fmtMon, fmtWday, fmtWdayFull, durMin, totalMins } from '../lib/dateUtils';
import HoldsportImportModal from '../components/HoldsportImportModal';

// ─── Skeleton-kort ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ width: 44, height: 54, borderRadius: 10, background: 'var(--bg-input)' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ height: 16, borderRadius: 6, background: 'var(--bg-input)', width: '55%' }} />
        <div style={{ height: 13, borderRadius: 6, background: 'var(--bg-input)', width: '35%' }} />
      </div>
    </div>
  );
}

// ─── Dato-boks ────────────────────────────────────────────────────────────────
function DateBox({ dateStr }: { dateStr: string }) {
  return (
    <div style={{
      minWidth: 44, width: 44,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--accent-light)', borderRadius: 10,
      padding: '6px 0', gap: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {fmtMon(dateStr)}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.1, fontFamily: 'var(--font-heading)' }}>
        {fmtDay(dateStr)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>
        {fmtWday(dateStr)}
      </span>
    </div>
  );
}

// ─── Trænings-kort ────────────────────────────────────────────────────────────
function TrainingCard({ training, onClick }: { training: Training; onClick: () => void }) {
  const dur = durMin(training.start_time, training.end_time);
  const mins = totalMins(training.sections ?? []);

  const meta: string[] = [];
  if (training.start_time) {
    const time = training.start_time + (training.end_time ? `–${training.end_time}` : '');
    meta.push(time);
  }
  if (dur) meta.push(`${dur} min`);
  if (training.location) meta.push(training.location);
  if (training.lead_trainer) meta.push(training.lead_trainer);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)', borderRadius: 12,
        padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        cursor: 'pointer', transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)')}
    >
      {training.date ? (
        <DateBox dateStr={training.date} />
      ) : (
        <div style={{
          minWidth: 44, width: 44, height: 54, borderRadius: 10,
          background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text3)', fontSize: 20,
        }}>📋</div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 600, fontSize: 15, color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {training.date ? fmtWdayFull(training.date) + ' træning' : 'Træning'}
        </div>
        {meta.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
            {meta.join(' · ')}
          </div>
        )}
        {training.themes && training.themes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {training.themes.slice(0, 4).map(th => (
              <span key={th} style={{
                fontSize: 11, fontWeight: 500, color: 'var(--accent)',
                background: 'var(--accent-light)', borderRadius: 20, padding: '1px 8px',
              }}>{th}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {mins > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{mins} min plan</span>
        )}
        {training.stars > 0 && (
          <span style={{ fontSize: 13, color: '#f59e0b' }}>{'★'.repeat(training.stars)}</span>
        )}
        {training.holdsport_id && (
          <span title="Importeret fra Holdsport" style={{ fontSize: 11, color: 'var(--text3)' }}>HS</span>
        )}
        <span style={{ color: 'var(--text3)', fontSize: 16 }}>›</span>
      </div>
    </div>
  );
}

// ─── Tom tilstand ─────────────────────────────────────────────────────────────
function EmptyState({ canEdit, onNew }: { canEdit: boolean; onNew: () => void }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 14,
      padding: '48px 24px', textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🏐</div>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, margin: '0 0 8px' }}>
        Ingen kommende træninger
      </h2>
      <p style={{ color: 'var(--text2)', margin: '0 0 20px', fontSize: 15 }}>
        Opret den første træning for dette hold.
      </p>
      {canEdit && (
        <button onClick={onNew} style={{
          background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 10, padding: '10px 24px', fontSize: 15,
          fontWeight: 600, cursor: 'pointer',
        }}>+ Ny træning</button>
      )}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 600, padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
      background: type === 'success' ? 'var(--green)' : 'var(--red)',
      color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      pointerEvents: 'none',
    }}>
      {message}
    </div>
  );
}

// ─── Hoved-komponent ───────────────────────────────────────────────────────────
export default function Trainings() {
  const navigate = useNavigate();
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canEdit = hasRole(user, 'trainer', currentTeamRole);

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHoldsportModal, setShowHoldsportModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);



  function load() {
    if (!currentTeamId) return;
    setLoading(true);
    setError(null);
    api.fetchTrainings(currentTeamId, 0)
      .then(setTrainings)
      .catch(e => setError(e.message ?? 'Fejl ved indlæsning'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [currentTeamId]);

  function handleNew() {
    navigate('/traininger/ny');
  }

  function handleHoldsportClick() {
    setShowHoldsportModal(true);
  }

  async function handleHoldsportImport(activities: Parameters<typeof api.createTraining>[0][]) {
    setShowHoldsportModal(false);
    let successCount = 0;
    let skipCount = 0;

    for (const activity of activities) {
      try {
        await api.createTraining(activity);
        successCount++;
      } catch {
        skipCount++;
      }
    }

    // Genindlæs træningslisten
    load();

    if (successCount > 0) {
      setToast({
        message: `${successCount} træning${successCount !== 1 ? 'er' : ''} importeret ✓`,
        type: 'success',
      });
    }
    if (skipCount > 0) {
      setTimeout(() => {
        setToast({ message: `${skipCount} kunne ikke importeres`, type: 'error' });
      }, successCount > 0 ? 3800 : 0);
    }
  }

  return (
    <div>
      {/* ── Sidetitel + handlinger ── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700,
          margin: 0, flex: 1,
        }}>Træninger</h1>

        <button
          onClick={() => navigate('/arkiv')}
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
            color: 'var(--text2)',
          }}
        >📦 Arkiv</button>

        {canEdit && (
          <button
            onClick={handleHoldsportClick}
            title="Importer fra Holdsport"
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer',
              color: 'var(--text)',
            }}
          >
            Holdsport ↓
          </button>
        )}

        {canEdit && (
          <button
            onClick={handleNew}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 10, padding: '8px 18px', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', minHeight: 36,
            }}
          >+ Ny træning</button>
        )}
      </div>

      {/* ── Indhold ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(n => <SkeletonCard key={n} />)}
        </div>
      ) : error ? (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12, padding: 24,
          color: 'var(--red)', fontSize: 15,
        }}>
          {error}
        </div>
      ) : trainings.length === 0 ? (
        <EmptyState canEdit={canEdit} onNew={handleNew} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trainings.map(t => (
            <TrainingCard
              key={t.id}
              training={t}
              onClick={() => navigate(`/traininger/${t.id}`)}
            />
          ))}
        </div>
      )}

      {/* ── Holdsport import modal ── */}
      {showHoldsportModal && currentTeamId && (
        <HoldsportImportModal
          teamId={currentTeamId}
          existingTrainings={trainings}
          onImport={handleHoldsportImport}
          onClose={() => setShowHoldsportModal(false)}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}
