import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training } from '../lib/types';
import { fmtDay, fmtMon, fmtWday, fmtWdayFull, durMin } from '../lib/dateUtils';

// ─── Hjælpere ─────────────────────────────────────────────────────────────────

function allTrainers(t: Training): string[] {
  const set = new Set<string>();
  if (t.lead_trainer) set.add(t.lead_trainer);
  (t.trainers ?? []).forEach(n => set.add(n));
  return [...set];
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3200);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      zIndex: 700, padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500,
      background: type === 'success' ? 'var(--green)' : 'var(--red)',
      color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      {message}
    </div>
  );
}

// ─── Dato-boks ────────────────────────────────────────────────────────────────
function DateBox({ dateStr }: { dateStr: string }) {
  return (
    <div style={{
      minWidth: 44, width: 44,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-input)', borderRadius: 10, padding: '6px 0',
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

// ─── Mobil-kort ───────────────────────────────────────────────────────────────
function MobileCard({
  training, canEdit, onCopy, onRestore, onDelete,
}: {
  training: Training; canEdit: boolean;
  onCopy: () => void; onRestore: () => void; onDelete: () => void;
}) {
  const dur = durMin(training.start_time, training.end_time);
  const navigate = useNavigate();

  const meta: string[] = [];
  if (training.start_time) meta.push(training.start_time + (training.end_time ? `–${training.end_time}` : ''));
  if (dur) meta.push(`${dur} min`);
  if (training.location) meta.push(training.location);

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      {/* ARKIVERET badge */}
      <div style={{
        background: 'var(--bg-input)', borderBottom: '1px solid var(--border)',
        padding: '3px 12px', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          📦 Arkiveret
        </span>
        {training.stars > 0 && (
          <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 'auto' }}>{'★'.repeat(training.stars)}</span>
        )}
      </div>

      <div style={{ padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
        {training.date ? <DateBox dateStr={training.date} /> : (
          <div style={{ minWidth: 44, width: 44, height: 54, borderRadius: 10, background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 20 }}>📋</div>
        )}

        {/* Info — klikbar */}
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(`/traininger/${training.id}`)}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {training.date ? fmtWdayFull(training.date) + ' træning' : 'Træning'}
          </div>
          {meta.length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{meta.join(' · ')}</div>
          )}
          {training.focus_points && (
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {training.focus_points}
            </div>
          )}
          {(training.themes?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {training.themes!.slice(0, 3).map(th => (
                <span key={th} style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg-input)', borderRadius: 20, padding: '1px 7px', border: '1px solid var(--border)' }}>{th}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Handlinger */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--border)' }}>
          {[
            { label: '⎘ Kopi', fn: onCopy, color: 'var(--text2)' },
            { label: '↩ Genskab', fn: onRestore, color: 'var(--green)' },
            { label: '✕ Slet', fn: onDelete, color: 'var(--red)' },
          ].map((btn, i) => (
            <button key={i} onClick={btn.fn} style={{
              flex: 1, padding: '9px 0', background: 'none', border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              color: btn.color, fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>{btn.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Desktop-tabelrække ───────────────────────────────────────────────────────
function TableRow({
  training, canEdit, onCopy, onRestore, onDelete,
}: {
  training: Training; canEdit: boolean;
  onCopy: () => void; onRestore: () => void; onDelete: () => void;
}) {
  const navigate = useNavigate();
  const dur = durMin(training.start_time, training.end_time);

  const cellStyle: React.CSSProperties = {
    padding: '10px 12px', verticalAlign: 'middle', fontSize: 13,
    borderBottom: '1px solid var(--border)', color: 'var(--text)',
  };

  return (
    <tr style={{ cursor: 'pointer' }}>
      {/* Dato */}
      <td style={{ ...cellStyle, color: 'var(--text2)', whiteSpace: 'nowrap' }}
        onClick={() => navigate(`/traininger/${training.id}`)}>
        {training.date ?? '—'}
      </td>

      {/* Træning */}
      <td style={{ ...cellStyle, maxWidth: 240 }} onClick={() => navigate(`/traininger/${training.id}`)}>
        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {training.date ? fmtWdayFull(training.date) + ' træning' : 'Træning'}
        </div>
        {training.focus_points && (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {training.focus_points}
          </div>
        )}
      </td>

      {/* Sted */}
      <td style={cellStyle} onClick={() => navigate(`/traininger/${training.id}`)}>
        {training.location ? (
          <span style={{ fontSize: 12, background: 'var(--bg-input)', borderRadius: 20, padding: '2px 10px', border: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
            {training.location}
          </span>
        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
      </td>

      {/* Varighed */}
      <td style={{ ...cellStyle, textAlign: 'center', whiteSpace: 'nowrap' }} onClick={() => navigate(`/traininger/${training.id}`)}>
        {dur ? (
          <span style={{ fontSize: 12, background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
            {dur} min
          </span>
        ) : <span style={{ color: 'var(--text3)' }}>—</span>}
      </td>

      {/* Trænere */}
      <td style={{ ...cellStyle, maxWidth: 180 }} onClick={() => navigate(`/traininger/${training.id}`)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {training.lead_trainer && (
            <span style={{ fontSize: 11, background: 'rgba(200,16,46,0.1)', color: 'var(--accent)', borderRadius: 20, padding: '2px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {training.lead_trainer}
            </span>
          )}
          {(training.trainers ?? []).map(name => (
            <span key={name} style={{ fontSize: 11, background: 'rgba(37,99,235,0.1)', color: 'var(--blue)', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>
              {name}
            </span>
          ))}
          {!training.lead_trainer && (training.trainers ?? []).length === 0 && (
            <span style={{ color: 'var(--text3)' }}>—</span>
          )}
        </div>
      </td>

      {/* Vurdering */}
      <td style={{ ...cellStyle, textAlign: 'center' }} onClick={() => navigate(`/traininger/${training.id}`)}>
        {training.stars > 0
          ? <span style={{ fontSize: 13, color: '#f59e0b' }}>{'★'.repeat(training.stars)}</span>
          : <span style={{ color: 'var(--text3)' }}>—</span>}
      </td>

      {/* Handlinger */}
      <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onCopy} title="Opret kopi som ny aktiv træning" style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text2)',
            }}>⎘ Kopi</button>
            <button onClick={onRestore} title="Flyt tilbage til aktive træninger" style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--green)', fontWeight: 600,
            }}>↩ Genskab</button>
            <button onClick={onDelete} title="Slet permanent" style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: 'var(--red)',
            }}>✕</button>
          </div>
        )}
      </td>
    </tr>
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

  // Filtre
  const [filterStars, setFilterStars] = useState(0);
  const [filterLocation, setFilterLocation] = useState('');
  const [filterTrainer, setFilterTrainer] = useState('');

  function load() {
    if (!currentTeamId) return;
    setLoading(true);
    api.fetchTrainings(currentTeamId, 1)
      .then(data => setTrainings(data.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [currentTeamId]);

  // Unikke filter-options
  const locations = useMemo(() => {
    const set = new Set(trainings.map(t => t.location).filter(Boolean) as string[]);
    return [...set].sort();
  }, [trainings]);

  const trainers = useMemo(() => {
    const set = new Set(trainings.flatMap(allTrainers));
    return [...set].sort();
  }, [trainings]);

  // Filtreret liste
  const filtered = useMemo(() => trainings.filter(t => {
    if (filterStars > 0 && t.stars < filterStars) return false;
    if (filterLocation && t.location !== filterLocation) return false;
    if (filterTrainer && !allTrainers(t).includes(filterTrainer)) return false;
    return true;
  }), [trainings, filterStars, filterLocation, filterTrainer]);

  // ── Handlinger ──────────────────────────────────────────────────────────────

  async function handleCopy(training: Training) {
    try {
      const { id: _id, created_at: _ca, updated_at: _ua, archived: _arc, holdsport_id: _hs, ...rest } = training;
      const created = await api.createTraining({ ...rest, archived: false, holdsport_id: undefined });
      setToast({ message: 'Kopi oprettet ✓', type: 'success' });
      setTimeout(() => navigate(`/traininger/${created.id}`), 600);
    } catch {
      setToast({ message: 'Fejl ved kopiering', type: 'error' });
    }
  }

  async function handleRestore(training: Training) {
    try {
      await api.updateTraining(training.id, { archived: false });
      setTrainings(prev => prev.filter(t => t.id !== training.id));
      setToast({ message: 'Træning genskabt ✓', type: 'success' });
    } catch {
      setToast({ message: 'Fejl ved gendannelse', type: 'error' });
    }
  }

  async function handleDelete(training: Training) {
    if (!confirm('Slet træning permanent? Dette kan ikke fortrydes.')) return;
    try {
      await api.deleteTraining(training.id);
      setTrainings(prev => prev.filter(t => t.id !== training.id));
      setToast({ message: 'Træning slettet', type: 'success' });
    } catch {
      setToast({ message: 'Fejl ved sletning', type: 'error' });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border2)',
    borderRadius: 8, padding: '8px 10px', fontSize: 14, color: 'var(--text)',
    minHeight: 40, cursor: 'pointer', flex: '1 1 150px',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14, padding: '4px 0' }}
          >← Tilbage</button>
        </div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 900, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          Arkiv
        </h1>
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>
          {loading ? 'Indlæser…' : `${trainings.length} arkiverede træning${trainings.length !== 1 ? 'er' : ''}`}
        </div>
      </div>

      {/* Filter-række */}
      {!loading && trainings.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {/* Vurdering */}
          <select value={filterStars} onChange={e => setFilterStars(Number(e.target.value))} style={selectStyle}>
            <option value={0}>Alle vurderinger</option>
            <option value={1}>★+</option>
            <option value={2}>★★+</option>
            <option value={3}>★★★+</option>
            <option value={4}>★★★★+</option>
            <option value={5}>★★★★★</option>
          </select>

          {/* Sted */}
          <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} style={selectStyle}>
            <option value="">Alle steder</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          {/* Træner */}
          <select value={filterTrainer} onChange={e => setFilterTrainer(e.target.value)} style={selectStyle}>
            <option value="">Alle trænere</option>
            {trainers.map(n => <option key={n} value={n}>{n}</option>)}
          </select>

          {/* Nulstil */}
          {(filterStars > 0 || filterLocation || filterTrainer) && (
            <button
              onClick={() => { setFilterStars(0); setFilterLocation(''); setFilterTrainer(''); }}
              style={{ ...selectStyle, flex: '0 0 auto', background: 'none', border: '1px solid var(--border2)', color: 'var(--text3)', fontSize: 13 }}
            >✕ Nulstil</button>
          )}
        </div>
      )}

      {/* Indhold */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ background: 'var(--bg-card)', borderRadius: 12, height: 80, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', opacity: 0.5 }} />
          ))}
        </div>
      ) : trainings.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, margin: '0 0 8px' }}>Ingen arkiverede træninger endnu</h2>
          <p style={{ color: 'var(--text2)', margin: 0, fontSize: 14 }}>Arkivér træninger fra editoren for at se dem her.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '32px 24px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
          Ingen træninger matcher filteret.
        </div>
      ) : (
        <>
          {/* Desktop-tabel */}
          <div className="archive-table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)' }}>
                  {['Dato', 'Træning', 'Sted', 'Varighed', 'Trænere', 'Vurdering', 'Handlinger'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <TableRow
                    key={t.id}
                    training={t}
                    canEdit={canEdit}
                    onCopy={() => handleCopy(t)}
                    onRestore={() => handleRestore(t)}
                    onDelete={() => handleDelete(t)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobil-kort */}
          <div className="archive-cards-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(t => (
              <MobileCard
                key={t.id}
                training={t}
                canEdit={canEdit}
                onCopy={() => handleCopy(t)}
                onRestore={() => handleRestore(t)}
                onDelete={() => handleDelete(t)}
              />
            ))}
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

      <style>{`
        @media (min-width: 768px) {
          .archive-table-wrap { display: block; }
          .archive-cards-wrap { display: none !important; }
        }
        @media (max-width: 767px) {
          .archive-table-wrap { display: none !important; }
          .archive-cards-wrap { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
