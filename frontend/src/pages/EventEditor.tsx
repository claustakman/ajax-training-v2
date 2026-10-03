/**
 * EventEditor — kamp eller stævne som hel side (/kampe/:id, /kampe/ny?type=match|tournament).
 * Samme mønster som TrainingEditor: toolbar (← Tilbage · gem-status · 🗑 Slet), header-kort, auto-gem.
 * Kun header-felter: ingen temaer, fokuspunkter, noter, vurdering eller sektioner.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import { extractAttendance, type TeamMember } from '../lib/holdsportAttendance';
import { KIND_STYLE, eventTitle, eventDays } from '../lib/events';
import { fmtDateLong, durMin } from '../lib/dateUtils';
import { UserMultiSelect } from '../components/ui/UserMultiSelect';
import type { Training } from '../lib/types';

type EventKind = 'match' | 'tournament';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  borderRadius: 8, padding: '9px 12px', fontSize: 16, color: 'var(--text)',
  minHeight: 44, width: '100%', boxSizing: 'border-box',
  // iOS: date/time-inputs ignorerer width:100% uden display:block + appearance:none
  display: 'block', minWidth: 0, WebkitAppearance: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map = {
    saving: { label: 'Gemmer…', color: 'var(--text3)' },
    saved:  { label: '✓ Gemt',  color: 'var(--green)' },
    error:  { label: '✗ Fejl',  color: 'var(--red)' },
  } as const;
  const { label, color } = map[state];
  return <span style={{ fontSize: 13, color }}>{label}</span>;
}

// Tomme strenge/null (ikke undefined) så ryddede felter også ryddes ved PATCH
function toPayload(e: Training): Partial<Training> {
  const kind: EventKind = e.kind === 'tournament' ? 'tournament' : 'match';
  return {
    kind,
    date: e.date,
    end_date: kind === 'tournament' && e.end_date && e.date && e.end_date > e.date ? e.end_date : '',
    start_time: kind === 'match' ? e.start_time ?? '' : '',
    end_time: kind === 'match' ? e.end_time ?? '' : '',
    location: e.location ?? '',
    home_team: kind === 'match' ? e.home_team ?? '' : '',
    away_team: kind === 'match' ? e.away_team ?? '' : '',
    title: kind === 'tournament' ? e.title ?? '' : '',
    participant_count: e.participant_count ?? null,
    trainers: e.trainers ?? [],
    keeper_trainers: e.keeper_trainers ?? [],
    youth_trainers: e.youth_trainers ?? [],
  } as unknown as Partial<Training>;
}

export default function EventEditor() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canEdit = hasRole(user, 'trainer', currentTeamRole);
  const isNew = id === 'ny';

  const [event, setEvent] = useState<Training | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [hsUpdating, setHsUpdating] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventRef = useRef<Training | null>(null);
  eventRef.current = event;

  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ['team-members', currentTeamId],
    queryFn: () => api.fetchTeamMembers(currentTeamId!),
    enabled: !!currentTeamId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: hsConfig } = useQuery({
    queryKey: ['holdsport-config', currentTeamId],
    queryFn: () => api.fetchHoldsportConfig(currentTeamId!),
    enabled: !!currentTeamId && canEdit,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // ── Indlæs ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) {
      setEvent({
        id: '', team_id: currentTeamId ?? '',
        kind: searchParams.get('type') === 'tournament' ? 'tournament' : 'match',
        date: new Date().toISOString().slice(0, 10),
        start_time: '', end_time: '', location: '',
        home_team: '', away_team: '', title: '',
        trainers: [], keeper_trainers: [], youth_trainers: [],
        themes: [], sections: [], stars: 0, archived: false,
        created_at: '', updated_at: '',
      });
      setLoading(false);
    } else if (id) {
      api.fetchTraining(id)
        .then(setEvent)
        .catch(() => navigate('/'))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, currentTeamId, navigate, searchParams]);

  // ── Auto-gem (debounce 1200ms) — samme mønster som TrainingEditor ─────────
  const scheduleSave = useCallback(() => {
    if (!canEdit) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      const e = eventRef.current;
      if (!e) return;
      try {
        if (!e.id) {
          const created = await api.createTraining({ ...e, ...toPayload(e), team_id: currentTeamId ?? '' });
          eventRef.current = created;
          setEvent(created);
          window.history.replaceState(null, '', `/kampe/${created.id}`);
        } else {
          await api.updateTraining(e.id, toPayload(e));
        }
        queryClient.invalidateQueries({ queryKey: ['trainings', currentTeamId, 'active'] });
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
      } catch {
        setSaveState('error');
      }
    }, 1200);
  }, [canEdit, currentTeamId, queryClient]);

  function update(patch: Partial<Training>) {
    setEvent(prev => prev ? { ...prev, ...patch } : prev);
    scheduleSave();
  }

  async function handleDelete() {
    if (!event?.id) { navigate('/'); return; }
    const label = KIND_STYLE[event.kind === 'tournament' ? 'tournament' : 'match'].label.toLowerCase();
    if (!confirm(`Slet ${label}? Dette kan ikke fortrydes.`)) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await api.deleteTraining(event.id);
    queryClient.invalidateQueries({ queryKey: ['trainings', currentTeamId, 'active'] });
    navigate('/');
  }

  async function handleHoldsportUpdate() {
    if (!event?.holdsport_id || !event.date || !currentTeamId) return;
    setHsUpdating(true);
    try {
      const config = await api.fetchHoldsportConfig(currentTeamId);
      const teams = await api.fetchHoldsportTeams(config.workerUrl, config.token);
      for (const team of teams) {
        const found = await api.fetchHoldsportActivity(
          config.workerUrl, config.token, team.id, event.holdsport_id, event.date
        );
        if (found) { update(extractAttendance(found, members, event)); break; }
      }
    } catch { /* fejl ignoreres stille */ } finally {
      setHsUpdating(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text3)', fontSize: 15 }}>Indlæser…</div>;
  }
  if (!event) return null;

  const kind: EventKind = event.kind === 'tournament' ? 'tournament' : 'match';
  const style = KIND_STYLE[kind];
  const keeperMembers = members.filter(m => m.team_role === 'keeper_trainer');
  const youthMembers = members.filter(m => m.team_role === 'youth_trainer');
  const trainerMembers = members.filter(m => m.team_role !== 'keeper_trainer' && m.team_role !== 'youth_trainer');
  const days = eventDays(event);
  const dur = durMin(event.start_time, event.end_time);
  const showHsUpdate = !!event.holdsport_id && canEdit && !!hsConfig?.workerUrl;

  // Undertitel: dato(er) · tid · sted
  const dateLabel = event.date
    ? (days > 1 && event.end_date ? `${fmtDateLong(event.date)} – ${fmtDateLong(event.end_date)}` : fmtDateLong(event.date))
    : '';
  const subParts = kind === 'tournament'
    ? [dateLabel, days > 1 ? `${days} dage` : 'Hele dagen', event.location]
    : [dateLabel, event.start_time && (event.end_time ? `${event.start_time}–${event.end_time}` : event.start_time), dur && `${dur} min`, event.location];

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 14, padding: '6px 0',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >← Tilbage</button>
        <div style={{ flex: 1 }} />
        <SaveIndicator state={saveState} />
        {canEdit && (
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
      </div>

      {/* ── Header-kort ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        borderTop: `4px solid ${style.color}`,
        marginBottom: 20, overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
              {eventTitle(event)}
            </h1>
            {event.holdsport_id && (
              <span title="Importeret fra Holdsport" style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text3)',
                background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '1px 5px', letterSpacing: '0.3px', flexShrink: 0,
              }}>HS</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
              color: '#fff', background: style.color, borderRadius: 4, padding: '1px 6px',
            }}>{style.label}</span>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>{subParts.filter(Boolean).join(' · ')}</span>
          </div>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Type */}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6 }}>
              {(['match', 'tournament'] as EventKind[]).map(k => {
                const on = kind === k;
                return (
                  <button key={k} onClick={() => update({ kind: k })} style={{
                    flex: 1, padding: '8px 16px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                    minHeight: 44, cursor: 'pointer',
                    background: on ? KIND_STYLE[k].light : 'var(--bg-input)',
                    border: `1px solid ${on ? KIND_STYLE[k].color : 'var(--border2)'}`,
                    color: on ? KIND_STYLE[k].color : 'var(--text2)',
                  }}>{KIND_STYLE[k].label}</button>
                );
              })}
            </div>
          )}

          {/* Hold / navn */}
          {kind === 'match' ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Hjemmehold">
                  <input value={event.home_team ?? ''} onChange={e => update({ home_team: e.target.value })}
                    disabled={!canEdit} placeholder="Ajax København" style={inputStyle} />
                </Field>
              </div>
              {canEdit && (
                <button
                  onClick={() => update({ home_team: event.away_team, away_team: event.home_team })}
                  title="Byt hjemme/ude"
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 8,
                    padding: '8px 10px', minHeight: 44, cursor: 'pointer', color: 'var(--text2)', fontSize: 16,
                  }}
                >⇄</button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Field label="Udehold">
                  <input value={event.away_team ?? ''} onChange={e => update({ away_team: e.target.value })}
                    disabled={!canEdit} placeholder="Modstander" style={inputStyle} />
                </Field>
              </div>
            </div>
          ) : (
            <Field label="Navn">
              <input value={event.title ?? ''} onChange={e => update({ title: e.target.value })}
                disabled={!canEdit} placeholder="Fx Albertslund Cup" style={inputStyle} />
            </Field>
          )}

          {/* Dato(er) / tid — samme 2-kolonne grid som Sted · Antal, så felterne flugter */}
          {kind === 'tournament' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Startdato">
                <input type="date" value={event.date ?? ''} disabled={!canEdit} style={inputStyle} onChange={e => {
                  const date = e.target.value;
                  // Ryk slutdato med hvis den ellers ville ligge før startdato
                  update({ date, end_date: event.end_date && event.end_date < date ? date : event.end_date });
                }} />
              </Field>
              <Field label="Slutdato">
                <input type="date" value={event.end_date || event.date || ''} min={event.date}
                  disabled={!canEdit} onChange={e => update({ end_date: e.target.value })} style={inputStyle} />
              </Field>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Dato">
                <input type="date" value={event.date ?? ''} disabled={!canEdit}
                  onChange={e => update({ date: e.target.value })} style={inputStyle} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, minWidth: 0 }}>
                <Field label="Start">
                  <input type="time" value={event.start_time ?? ''} disabled={!canEdit}
                    onChange={e => update({ start_time: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Slut">
                  <input type="time" value={event.end_time ?? ''} disabled={!canEdit}
                    onChange={e => update({ end_time: e.target.value })} style={inputStyle} />
                </Field>
              </div>
            </div>
          )}

          {/* Sted · Antal spillere + Opdater */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Sted">
              <input value={event.location ?? ''} disabled={!canEdit}
                onChange={e => update({ location: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Antal spillere">
              <div style={{ display: 'grid', gridTemplateColumns: showHsUpdate ? '1fr 1fr' : '1fr', gap: 8 }}>
                <input
                  type="number" min={0} inputMode="numeric" placeholder="0"
                  value={event.participant_count ?? ''}
                  disabled={!canEdit}
                  onChange={e => update({ participant_count: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                  style={inputStyle}
                />
                {showHsUpdate && (
                  <button onClick={handleHoldsportUpdate} disabled={hsUpdating} title="Opdater fra Holdsport" style={{
                    padding: '0 8px', minHeight: 44, borderRadius: 8, minWidth: 0, whiteSpace: 'nowrap',
                    background: 'var(--bg-input)', border: '1px solid var(--border2)',
                    fontSize: 13, color: 'var(--text2)', cursor: hsUpdating ? 'wait' : 'pointer',
                  }}>{hsUpdating ? '…' : '↺ Opdater'}</button>
                )}
              </div>
              {event.holdsport_id && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                  Hentet fra Holdsport — kan ændres
                </div>
              )}
            </Field>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

          <Field label="Trænere">
            <UserMultiSelect
              selected={event.trainers ?? []}
              onChange={names => update({ trainers: names })}
              members={trainerMembers}
              disabled={!canEdit}
            />
          </Field>

          {keeperMembers.length > 0 && (
            <Field label="Keepertrænere">
              <UserMultiSelect
                selected={event.keeper_trainers ?? []}
                onChange={names => update({ keeper_trainers: names })}
                members={keeperMembers}
                disabled={!canEdit}
                addLabel="+ Tilføj keepertræner…"
              />
            </Field>
          )}

          {youthMembers.length > 0 && (
            <Field label="Ungtrænere">
              <UserMultiSelect
                selected={event.youth_trainers ?? []}
                onChange={names => update({ youth_trainers: names })}
                members={youthMembers}
                disabled={!canEdit}
                addLabel="+ Tilføj ungtræner…"
              />
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}
