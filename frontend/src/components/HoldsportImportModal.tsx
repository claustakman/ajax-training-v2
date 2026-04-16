/**
 * HoldsportImportModal — to-trins import af aktiviteter fra Holdsport.
 * Trin 1: Vælg datoperiode.
 * Trin 2: Vælg aktiviteter fra listen og importer.
 */

import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { HoldsportActivity, Training } from '../lib/types';
import { fmtDay, fmtMon, fmtWday } from '../lib/dateUtils';

// ─── Hjælpefunktioner ─────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function endOfSeason() {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-06-30`;
}

function fmtActivityDate(starttime?: string): string {
  if (!starttime) return '—';
  const date = starttime.split('T')[0];
  const time = starttime.split('T')[1]?.slice(0, 5) ?? '';
  return `${fmtWday(date)} ${fmtDay(date)}. ${fmtMon(date)}${time ? ' · ' + time : ''}`;
}

function fmtTimeRange(starttime?: string, endtime?: string): string {
  const s = starttime?.split('T')[1]?.slice(0, 5);
  const e = endtime?.split('T')[1]?.slice(0, 5);
  if (s && e) return `${s} – ${e}`;
  if (s) return s;
  return '';
}

// Simpel hsIsTraining-filter: aktiviteter der ligner træning
function isTraining(activity: HoldsportActivity): boolean {
  const name = (activity.name || activity.title || '').toLowerCase();
  return name.includes('træning') || name.includes('training');
}

function mapActivity(activity: HoldsportActivity, teamId: string): Partial<Training> {
  return {
    team_id: teamId,
    date: activity.starttime?.split('T')[0],
    start_time: activity.starttime?.split('T')[1]?.slice(0, 5),
    end_time: activity.endtime?.split('T')[1]?.slice(0, 5),
    location: activity.place || activity.location || undefined,
    participant_count: activity.attendance_count ?? activity.signups_count ?? undefined,
    holdsport_id: String(activity.id),
    sections: [],
    trainers: [],
    themes: [],
    stars: 0,
    archived: false,
  };
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const btnGhost: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, fontSize: 14,
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  color: 'var(--text2)', cursor: 'pointer', minHeight: 44,
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
  background: 'var(--accent)', color: '#fff', border: 'none',
  cursor: 'pointer', minHeight: 44,
};

const inputStyle: React.CSSProperties = {
  padding: '9px 10px', background: 'var(--bg-input)',
  border: '1px solid var(--border2)', borderRadius: 8,
  fontSize: 14, color: 'var(--text)', minHeight: 44,
  width: '100%', boxSizing: 'border-box',
};

// ─── HoldsportImportModal ────────────────────────────────────────────────────

export default function HoldsportImportModal({ teamId, existingTrainings, onImport, onClose }: {
  teamId: string;
  existingTrainings: Training[];
  onImport: (trainings: Partial<Training>[]) => void;
  onClose: () => void;
}) {
  const today = todayStr();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 30));
  const [step, setStep] = useState<'dates' | 'activities'>('dates');

  const [activities, setActivities] = useState<HoldsportActivity[]>([]);
  const [loadingAct, setLoadingAct] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  // Allerede importerede holdsport_id'er
  const importedIds = new Set(
    existingTrainings.map(t => t.holdsport_id).filter(Boolean) as string[]
  );

  // Hent aktiviteter når step skifter til 'activities'
  useEffect(() => {
    if (step !== 'activities') return;
    setLoadingAct(true);
    setFetchError('');
    api.fetchHoldsportActivities(teamId, from, to)
      .then(data => {
        setActivities(data);
        // Forvælg alle træninger der ikke er importeret endnu
        const preselect = new Set(
          data
            .filter(a => isTraining(a) && !importedIds.has(String(a.id)))
            .map(a => String(a.id))
        );
        setSelected(preselect);
      })
      .catch(e => setFetchError(e.message ?? 'Fejl ved hentning'))
      .finally(() => setLoadingAct(false));
  }, [step]);

  const filtered = showAll ? activities : activities.filter(isTraining);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(
      filtered
        .filter(a => !importedIds.has(String(a.id)))
        .map(a => String(a.id))
    ));
  }

  function deselectAll() { setSelected(new Set()); }

  function handleImport() {
    const picked = activities
      .filter(a => selected.has(String(a.id)))
      .map(a => mapActivity(a, teamId));
    onImport(picked);
  }

  const selectedCount = [...selected].filter(id => !importedIds.has(id)).length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16,
        width: '100%', maxWidth: 520,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700 }}>
              {step === 'dates' ? 'Importer fra Holdsport' : 'Vælg træninger'}
            </h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--text2)', padding: 4, lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>

          {/* ── Trin 1: Datoer ── */}
          {step === 'dates' && (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Fra / Til */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Fra</label>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>Til</label>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
                </div>
              </div>

              {/* Genveje */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { label: '2 uger', days: 14 },
                  { label: '1 måned', days: 30 },
                  { label: '3 måneder', days: 90 },
                ].map(({ label, days }) => (
                  <button key={label} onClick={() => setTo(addDays(from, days))} style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 13,
                    background: 'var(--bg-input)', border: '1px solid var(--border2)',
                    color: 'var(--text2)', cursor: 'pointer',
                  }}>{label}</button>
                ))}
                <button onClick={() => setTo(endOfSeason())} style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 13,
                  background: 'var(--bg-input)', border: '1px solid var(--border2)',
                  color: 'var(--text2)', cursor: 'pointer',
                }}>Resten af sæsonen</button>
              </div>
            </div>
          )}

          {/* ── Trin 2: Aktivitetsliste ── */}
          {step === 'activities' && (
            <>
              {/* Loading */}
              {loadingAct && (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>⏳</div>
                  Henter aktiviteter fra Holdsport…
                </div>
              )}

              {/* Fejl */}
              {!loadingAct && fetchError && (
                <div style={{ padding: 20 }}>
                  <div style={{
                    background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
                    borderRadius: 8, padding: '12px 16px', color: 'var(--red)', fontSize: 14, marginBottom: 12,
                  }}>
                    {fetchError}
                  </div>
                  <button onClick={() => { setStep('dates'); setFetchError(''); }} style={btnGhost}>
                    ← Prøv igen
                  </button>
                </div>
              )}

              {/* Liste */}
              {!loadingAct && !fetchError && (
                <>
                  {/* Toggle + vælg alle */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    padding: '10px 16px', borderBottom: '1px solid var(--border)',
                    position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1,
                  }}>
                    {/* Kun træninger / Vis alle */}
                    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', borderRadius: 20, padding: 3 }}>
                      {[false, true].map(all => (
                        <button key={String(all)} onClick={() => setShowAll(all)} style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                          background: showAll === all ? 'var(--bg-card)' : 'transparent',
                          border: showAll === all ? '1px solid var(--border2)' : '1px solid transparent',
                          color: showAll === all ? 'var(--text)' : 'var(--text3)',
                          cursor: 'pointer',
                        }}>
                          {all ? 'Vis alle' : 'Kun træninger'}
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>
                      {filtered.length} aktiviteter
                    </span>
                    <button onClick={selectAll} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Vælg alle</button>
                    <button onClick={deselectAll} style={{ fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' }}>Fravælg alle</button>
                  </div>

                  {filtered.length === 0 && (
                    <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
                      Ingen aktiviteter fundet i perioden.
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {filtered.map(activity => {
                      const id = String(activity.id);
                      const alreadyImported = importedIds.has(id);
                      const isSelected = selected.has(id);
                      const name = activity.name || activity.title || 'Unavngivet';
                      const timeRange = fmtTimeRange(activity.starttime, activity.endtime);
                      const dateStr = fmtActivityDate(activity.starttime);
                      const place = activity.place || activity.location;
                      const participants = activity.attendance_count ?? activity.signups_count;

                      return (
                        <div
                          key={id}
                          onClick={() => !alreadyImported && toggleSelect(id)}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12,
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--border)',
                            background: alreadyImported ? 'var(--bg-input)' : isSelected ? 'var(--accent-light)' : 'var(--bg-card)',
                            opacity: alreadyImported ? 0.6 : 1,
                            cursor: alreadyImported ? 'default' : 'pointer',
                          }}
                        >
                          {/* Checkbox */}
                          <div style={{
                            width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                            border: alreadyImported ? '2px solid var(--border2)' : isSelected ? 'none' : '2px solid var(--border2)',
                            background: isSelected && !alreadyImported ? 'var(--accent)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isSelected && !alreadyImported && (
                              <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>
                            )}
                          </div>

                          {/* Indhold */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: 14, color: alreadyImported ? 'var(--text3)' : 'var(--text)' }}>
                                {name}
                              </span>
                              {alreadyImported && (
                                <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 20, padding: '1px 7px' }}>
                                  Allerede importeret
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                              {dateStr}{timeRange ? ` · ${timeRange}` : ''}
                            </div>
                            {(place || participants) && (
                              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, display: 'flex', gap: 10 }}>
                                {place && <span>📍 {place}</span>}
                                {participants && <span>👥 {participants} tilmeldte</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'space-between',
          flexShrink: 0, flexWrap: 'wrap',
        }}>
          {step === 'dates' ? (
            <>
              <button onClick={onClose} style={btnGhost}>Annuller</button>
              <button
                onClick={() => setStep('activities')}
                style={{ ...btnPrimary, opacity: !from || !to ? 0.5 : 1 }}
                disabled={!from || !to}
              >
                Hent aktiviteter ↓
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setStep('dates'); setActivities([]); setFetchError(''); }} style={btnGhost}>
                ← Tilbage
              </button>
              <button
                onClick={handleImport}
                disabled={selectedCount === 0}
                style={{ ...btnPrimary, opacity: selectedCount === 0 ? 0.4 : 1, cursor: selectedCount === 0 ? 'not-allowed' : 'pointer' }}
              >
                Importer {selectedCount > 0 ? `${selectedCount} valgte` : ''}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
