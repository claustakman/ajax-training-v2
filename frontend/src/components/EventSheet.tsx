/**
 * EventSheet — opret/redigér kamp eller stævne.
 * Kun header-felter: dato, tid, sted, antal spillere, trænere, keeper-/ungtrænere.
 * Ingen temaer, fokuspunkter, noter, vurdering eller sektioner.
 */

import { useState } from 'react';
import { api } from '../lib/api';
import { extractAttendance, type TeamMember } from '../lib/holdsportAttendance';
import { KIND_STYLE } from '../lib/events';
import { UserMultiSelect } from './ui/UserMultiSelect';
import type { Training } from '../lib/types';

type EventKind = 'match' | 'tournament';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  borderRadius: 8, padding: '9px 12px', fontSize: 16, color: 'var(--text)',
  minHeight: 44, width: '100%', boxSizing: 'border-box',
  display: 'block', minWidth: 0, WebkitAppearance: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text2)',
  textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export default function EventSheet({ teamId, event, initialKind, members, onSaved, onDeleted, onClose }: {
  teamId: string;
  event: Training | null;          // null = ny kamp/stævne
  initialKind: EventKind;
  members: TeamMember[];
  onSaved: (t: Training) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Training>>(() => event ?? {
    team_id: teamId,
    kind: initialKind,
    date: new Date().toISOString().slice(0, 10),
    start_time: '', end_time: '', location: '',
    home_team: '', away_team: '', title: '',
    trainers: [], keeper_trainers: [], youth_trainers: [],
    themes: [], sections: [], stars: 0, archived: false,
  });
  const [saving, setSaving] = useState(false);
  const [hsUpdating, setHsUpdating] = useState(false);
  const [error, setError] = useState('');

  const kind = (draft.kind === 'tournament' ? 'tournament' : 'match') as EventKind;
  const style = KIND_STYLE[kind];
  const keeperMembers = members.filter(m => m.team_role === 'keeper_trainer');
  const youthMembers = members.filter(m => m.team_role === 'youth_trainer');
  const trainerMembers = members.filter(m => m.team_role !== 'keeper_trainer' && m.team_role !== 'youth_trainer');

  function set(patch: Partial<Training>) {
    setDraft(prev => ({ ...prev, ...patch }));
  }

  async function handleSave() {
    if (!draft.date) { setError('Dato skal udfyldes'); return; }
    if (kind === 'tournament' && draft.end_date && draft.end_date < draft.date) {
      setError('Slutdato skal være samme dag eller efter startdato'); return;
    }
    setSaving(true);
    setError('');
    // Tomme strenge/null (ikke undefined) så ryddede felter også ryddes ved PATCH
    const payload = {
      kind,
      date: draft.date,
      start_time: kind === 'match' ? draft.start_time ?? '' : '',
      end_time: kind === 'match' ? draft.end_time ?? '' : '',
      end_date: kind === 'tournament' && draft.end_date && draft.end_date > draft.date ? draft.end_date : '',
      location: draft.location?.trim() ?? '',
      home_team: kind === 'match' ? draft.home_team?.trim() ?? '' : '',
      away_team: kind === 'match' ? draft.away_team?.trim() ?? '' : '',
      title: kind === 'tournament' ? draft.title?.trim() ?? '' : '',
      participant_count: draft.participant_count ?? null,
      trainers: draft.trainers ?? [],
      keeper_trainers: draft.keeper_trainers ?? [],
      youth_trainers: draft.youth_trainers ?? [],
    } as unknown as Partial<Training>;
    try {
      const saved = event?.id
        ? await api.updateTraining(event.id, payload)
        : await api.createTraining({ ...draft, ...payload, team_id: teamId });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke gemme');
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!event?.id) { onClose(); return; }
    if (!confirm(`Slet ${style.label.toLowerCase()}? Dette kan ikke fortrydes.`)) return;
    await api.deleteTraining(event.id);
    onDeleted(event.id);
  }

  async function handleHoldsportUpdate() {
    if (!draft.holdsport_id || !draft.date) return;
    setHsUpdating(true);
    try {
      const config = await api.fetchHoldsportConfig(teamId);
      const teams = await api.fetchHoldsportTeams(config.workerUrl, config.token);
      for (const team of teams) {
        const found = await api.fetchHoldsportActivity(
          config.workerUrl, config.token, team.id, draft.holdsport_id, draft.date
        );
        if (found) { set(extractAttendance(found, members, draft)); break; }
      }
    } catch { /* fejl ignoreres stille */ } finally {
      setHsUpdating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.4)',
    }}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 520,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)', borderTop: `4px solid ${style.color}`,
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700 }}>
              {event?.id ? `Redigér ${style.label.toLowerCase()}` : `Ny ${style.label.toLowerCase()}`}
            </h2>
            {draft.holdsport_id && (
              <span title="Importeret fra Holdsport" style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text3)',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '1px 5px', letterSpacing: '0.3px', flexShrink: 0,
              }}>HS</span>
            )}
          </div>
          {event?.id && (
            <button
              onClick={handleDelete}
              title={`Slet ${style.label.toLowerCase()}`}
              aria-label={`Slet ${style.label.toLowerCase()}`}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border2)',
                borderRadius: 8, padding: '6px 10px', fontSize: 16, cursor: 'pointer', color: 'var(--red)',
                minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span>🗑</span>
              <span style={{ fontSize: 10, lineHeight: 1, color: 'var(--red)' }}>Slet</span>
            </button>
          )}
          <button onClick={onClose} aria-label="Luk" style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 24,
            color: 'var(--text2)', padding: 4, lineHeight: 1,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Type */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['match', 'tournament'] as EventKind[]).map(k => {
              const on = kind === k;
              return (
                <button key={k} onClick={() => set({ kind: k })} style={{
                  flex: 1, padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  minHeight: 44, cursor: 'pointer',
                  background: on ? KIND_STYLE[k].light : 'var(--bg-input)',
                  border: `1px solid ${on ? KIND_STYLE[k].color : 'var(--border2)'}`,
                  color: on ? KIND_STYLE[k].color : 'var(--text2)',
                }}>{KIND_STYLE[k].label}</button>
              );
            })}
          </div>

          {kind === 'match' ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Hjemmehold">
                  <input value={draft.home_team ?? ''} onChange={e => set({ home_team: e.target.value })}
                    placeholder="Ajax København" style={inputStyle} />
                </Field>
              </div>
              <button
                onClick={() => set({ home_team: draft.away_team, away_team: draft.home_team })}
                title="Byt hjemme/ude"
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8,
                  padding: '8px 10px', minHeight: 44, cursor: 'pointer', color: 'var(--text2)', fontSize: 16,
                }}
              >⇄</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Udehold">
                  <input value={draft.away_team ?? ''} onChange={e => set({ away_team: e.target.value })}
                    placeholder="Modstander" style={inputStyle} />
                </Field>
              </div>
            </div>
          ) : (
            <Field label="Navn">
              <input value={draft.title ?? ''} onChange={e => set({ title: e.target.value })}
                placeholder="Fx Albertslund Cup" style={inputStyle} />
            </Field>
          )}

          {kind === 'tournament' ? (
            // Stævner: hele dage — kun start- og slutdato
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Startdato">
                <input type="date" value={draft.date ?? ''} style={inputStyle} onChange={e => {
                  const date = e.target.value;
                  // Ryk slutdato med hvis den ellers ville ligge før startdato
                  set({ date, end_date: draft.end_date && draft.end_date < date ? date : draft.end_date });
                }} />
              </Field>
              <Field label="Slutdato">
                <input type="date" value={draft.end_date || draft.date || ''} min={draft.date}
                  onChange={e => set({ end_date: e.target.value })} style={inputStyle} />
              </Field>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Dato">
                <input type="date" value={draft.date ?? ''} onChange={e => set({ date: e.target.value })} style={inputStyle} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minWidth: 0 }}>
                <Field label="Start">
                  <input type="time" value={draft.start_time ?? ''} onChange={e => set({ start_time: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Slut">
                  <input type="time" value={draft.end_time ?? ''} onChange={e => set({ end_time: e.target.value })} style={inputStyle} />
                </Field>
              </div>
            </div>
          )}

          <Field label="Sted">
            <input value={draft.location ?? ''} onChange={e => set({ location: e.target.value })} style={inputStyle} />
          </Field>

          <Field label="Antal spillere">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" min={0} inputMode="numeric"
                value={draft.participant_count ?? ''}
                onChange={e => set({ participant_count: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                style={{ ...inputStyle, flex: 1 }}
              />
              {draft.holdsport_id && (
                <button onClick={handleHoldsportUpdate} disabled={hsUpdating} title="Opdater fra Holdsport" style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8,
                  padding: '8px 16px', fontSize: 13, cursor: hsUpdating ? 'default' : 'pointer',
                  color: 'var(--text)', opacity: hsUpdating ? 0.6 : 1, whiteSpace: 'nowrap',
                }}>{hsUpdating ? '⏳' : '↺'} Opdater</button>
              )}
            </div>
          </Field>

          <Field label="Trænere">
            <UserMultiSelect
              selected={draft.trainers ?? []}
              onChange={names => set({ trainers: names })}
              members={trainerMembers}
            />
          </Field>

          {keeperMembers.length > 0 && (
            <Field label="Keepertrænere">
              <UserMultiSelect
                selected={draft.keeper_trainers ?? []}
                onChange={names => set({ keeper_trainers: names })}
                members={keeperMembers}
                addLabel="+ Tilføj keepertræner…"
              />
            </Field>
          )}

          {youthMembers.length > 0 && (
            <Field label="Ungtrænere">
              <UserMultiSelect
                selected={draft.youth_trainers ?? []}
                onChange={names => set({ youth_trainers: names })}
                members={youthMembers}
                addLabel="+ Tilføj ungtræner…"
              />
            </Field>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: 14 }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px calc(14px + env(safe-area-inset-bottom))', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'space-between', flexShrink: 0,
        }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 14, minHeight: 44,
            background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text2)', cursor: 'pointer',
          }}>Annuller</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, minHeight: 44,
            background: 'var(--accent)', color: '#fff', border: 'none',
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>{saving ? 'Gemmer…' : 'Gem'}</button>
        </div>
      </div>
    </div>
  );
}
