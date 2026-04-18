import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training } from '../lib/types';
import { fmtDay, fmtMon, fmtWday, fmtWdayFull, durMin, totalMins } from '../lib/dateUtils';

// ─── Dato-boks ────────────────────────────────────────────────────────────────
function DateBox({ dateStr }: { dateStr: string }) {
  return (
    <div style={{
      minWidth: 44, width: 44,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-input)', borderRadius: 10,
      padding: '6px 0',
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {fmtMon(dateStr)}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text2)', lineHeight: 1.1, fontFamily: 'var(--font-heading)' }}>
        {fmtDay(dateStr)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>
        {fmtWday(dateStr)}
      </span>
    </div>
  );
}

// ─── Arkiveret trænings-kort ──────────────────────────────────────────────────
function ArchivedCard({
  training, canEdit,
  onRestore, onDelete, onView,
}: {
  training: Training;
  canEdit: boolean;
  onRestore: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const dur = durMin(training.start_time, training.end_time);
  const mins = totalMins(training.sections ?? []);

  const meta: string[] = [];
  if (training.start_time) {
    meta.push(training.start_time + (training.end_time ? `–${training.end_time}` : ''));
  }
  if (dur) meta.push(`${dur} min`);
  if (training.location) meta.push(training.location);

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      opacity: 0.85,
    }}>
      {training.date ? (
        <DateBox dateStr={training.date} />
      ) : (
        <div style={{
          minWidth: 44, width: 44, height: 54, borderRadius: 10,
          background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text3)', fontSize: 20,
        }}>📋</div>
      )}

      {/* Info — klikbar */}
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onView}>
        <div style={{
          fontWeight: 600, fontSize: 15, color: 'var(--text2)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {training.date ? fmtWdayFull(training.date) + ' træning' : 'Træning'}
        </div>
        {meta.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
            {meta.join(' · ')}
          </div>
        )}
        {mins > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{mins} min plan</div>
        )}
        {training.stars > 0 && (
          <div style={{ fontSize: 13, color: '#f59e0b', marginTop: 2 }}>
            {'★'.repeat(training.stars)}
          </div>
        )}
        {training.themes && training.themes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {training.themes.slice(0, 3).map(th => (
              <span key={th} style={{
                fontSize: 11, fontWeight: 500, color: 'var(--text3)',
                background: 'var(--bg-input)', borderRadius: 20, padding: '1px 8px',
                border: '1px solid var(--border)',
              }}>{th}</span>
            ))}
          </div>
        )}
      </div>

      {/* Handlinger */}
      {canEdit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onRestore}
            title="Gendan til aktive træninger"
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              color: 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >↩ Gendan</button>
          <button
            onClick={onDelete}
            title="Slet permanent"
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 7, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
              color: 'var(--red)', whiteSpace: 'nowrap',
            }}
          >🗑 Slet</button>
        </div>
      )}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 600, padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
      background: type === 'success' ? 'var(--green)' : 'var(--red)',
      color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      {message}
    </div>
  );
}

// ─── Hoved-komponent ──────────────────────────────────────────────────────────
export default function Archive() {
  const navigate = useNavigate();
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canEdit = hasRole(user, 'trainer', currentTeamRole);

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function load() {
    if (!currentTeamId) return;
    setLoading(true);
    api.fetchTrainings(currentTeamId, 1)
      .then(data => setTrainings(data.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [currentTeamId]);

  async function handleRestore(training: Training) {
    try {
      await api.updateTraining(training.id, { archived: false });
      setTrainings(prev => prev.filter(t => t.id !== training.id));
      setToast({ message: 'Træning gendannet ✓', type: 'success' });
    } catch {
      setToast({ message: 'Fejl ved gendannelse', type: 'error' });
    }
  }

  async function handleDelete(training: Training) {
    if (!confirm('Slet permanent? Dette kan ikke fortrydes.')) return;
    try {
      await api.deleteTraining(training.id);
      setTrainings(prev => prev.filter(t => t.id !== training.id));
      setToast({ message: 'Træning slettet', type: 'success' });
    } catch {
      setToast({ message: 'Fejl ved sletning', type: 'error' });
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 14, padding: '6px 0',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >← Tilbage</button>
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700,
          margin: 0, flex: 1,
        }}>📦 Arkiv</h1>
        {trainings.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>{trainings.length} træning{trainings.length !== 1 ? 'er' : ''}</span>
        )}
      </div>

      {/* Indhold */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{
              background: 'var(--bg-card)', borderRadius: 12,
              padding: '14px 16px', height: 72,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', opacity: 0.5,
            }} />
          ))}
        </div>
      ) : trainings.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 14,
          padding: '48px 24px', textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, margin: '0 0 8px' }}>
            Arkivet er tomt
          </h2>
          <p style={{ color: 'var(--text2)', margin: 0, fontSize: 14 }}>
            Arkiverede træninger vises her.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trainings.map(t => (
            <ArchivedCard
              key={t.id}
              training={t}
              canEdit={canEdit}
              onRestore={() => handleRestore(t)}
              onDelete={() => handleDelete(t)}
              onView={() => navigate(`/traininger/${t.id}`)}
            />
          ))}
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  );
}
