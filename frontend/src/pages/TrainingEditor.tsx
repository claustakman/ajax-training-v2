import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training } from '../lib/types';
import { fmtDateLong, durMin } from '../lib/dateUtils';
import { SectionList } from '../components/SectionList';
import SaveTemplateModal from '../components/SaveTemplateModal';
import AISuggestModal from '../components/AISuggestModal';
import AISectionModal from '../components/AISectionModal';

// ─── Status-indikator ────────────────────────────────────────────────────────
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  const map: Record<SaveState, { label: string; color: string }> = {
    idle:   { label: '',         color: '' },
    saving: { label: 'Gemmer…',  color: 'var(--text3)' },
    saved:  { label: '✓ Gemt',   color: 'var(--green)' },
    error:  { label: '✗ Fejl',   color: 'var(--red)' },
  };
  const { label, color } = map[state];
  return <span style={{ fontSize: 13, color, transition: 'color 0.3s' }}>{label}</span>;
}

// ─── Chip ────────────────────────────────────────────────────────────────────
function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'var(--accent-light)', color: 'var(--accent)',
      borderRadius: 20, padding: '3px 10px', fontSize: 13, fontWeight: 500,
    }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--accent)', padding: 0, lineHeight: 1, fontSize: 15,
        }}>×</button>
      )}
    </span>
  );
}

// ─── Label-felt wrapper ───────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  borderRadius: 8, padding: '8px 12px', fontSize: 15, color: 'var(--text)',
  minHeight: 40, width: '100%', boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 80, resize: 'vertical', fontFamily: 'inherit',
};

// ─── Bruger-dropdown ──────────────────────────────────────────────────────────
// Viser en <select> med holdets brugere. Returnerer valgt name (ikke id).
function UserSelect({
  value,
  onChange,
  members,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (name: string) => void;
  members: { id: string; name: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{ ...inputStyle, appearance: 'auto' }}
    >
      <option value="">{placeholder}</option>
      {members.map(m => (
        <option key={m.id} value={m.name}>{m.name}</option>
      ))}
    </select>
  );
}

// ─── Bruger-multi-valg (chips + dropdown) ────────────────────────────────────
function UserMultiSelect({
  selected,
  onChange,
  members,
  disabled,
}: {
  selected: string[];
  onChange: (names: string[]) => void;
  members: { id: string; name: string }[];
  disabled?: boolean;
}) {
  const available = members.filter(m => !selected.includes(m.name));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {selected.map(name => (
          <Chip
            key={name}
            label={name}
            onRemove={disabled ? undefined : () => onChange(selected.filter(n => n !== name))}
          />
        ))}
      </div>
      {!disabled && available.length > 0 && (
        <select
          value=""
          onChange={e => {
            if (e.target.value) onChange([...selected, e.target.value]);
          }}
          style={{ ...inputStyle, color: selected.length > 0 ? 'var(--text2)' : 'var(--text)' }}
        >
          <option value="">+ Tilføj træner…</option>
          {available.map(m => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// ─── Tema-valg (chips fra årshjul) ───────────────────────────────────────────
function ThemeSelect({
  selected,
  onChange,
  allThemes,
  disabled,
}: {
  selected: string[];
  onChange: (themes: string[]) => void;
  allThemes: string[];
  disabled?: boolean;
}) {
  const available = allThemes.filter(t => !selected.includes(t));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {selected.map(th => (
          <Chip
            key={th}
            label={th}
            onRemove={disabled ? undefined : () => onChange(selected.filter(t => t !== th))}
          />
        ))}
      </div>
      {!disabled && available.length > 0 && (
        <select
          value=""
          onChange={e => {
            if (e.target.value) onChange([...selected, e.target.value]);
          }}
          style={{ ...inputStyle }}
        >
          <option value="">+ Vælg tema…</option>
          {available.map(th => (
            <option key={th} value={th}>{th}</option>
          ))}
        </select>
      )}
      {!disabled && allThemes.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>
          Ingen temaer i årshjulet endnu.
        </p>
      )}
    </div>
  );
}

// ─── Stjerne-vurdering ────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange(value === n ? 0 : n)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 22, padding: 0,
          color: n <= value ? '#f59e0b' : 'var(--border2)',
          lineHeight: 1,
        }}>★</button>
      ))}
    </div>
  );
}

// ─── Hoved-komponent ───────────────────────────────────────────────────────────
export default function TrainingEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canEdit = hasRole(user, 'trainer', currentTeamRole);

  const [training, setTraining] = useState<Training | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [headerOpen, setHeaderOpen] = useState(() => {
    const stored = localStorage.getItem('training_header_open');
    return stored === null ? true : stored === '1';
  });

  function toggleHeader() {
    setHeaderOpen(o => {
      const next = !o;
      localStorage.setItem('training_header_open', next ? '1' : '0');
      return next;
    });
  }
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showAISuggest, setShowAISuggest] = useState(false);
  const [aiSectionIndex, setAiSectionIndex] = useState<number | null>(null);
  const [miniToast, setMiniToast] = useState<string | null>(null);
  // Data fra API
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [allThemes, setAllThemes] = useState<string[]>([]);

  const { data: sectionTypes = [] } = useQuery({
    queryKey: ['section-types', currentTeamId],
    queryFn: () => api.fetchSectionTypes(currentTeamId!),
    enabled: !!currentTeamId,
    staleTime: 5 * 60_000,
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trainingRef = useRef<Training | null>(null);
  trainingRef.current = training;

  const isNew = id === 'ny';

  // ── Hent hold-data (members + årshjul-temaer) ─────────────────────────────
  useEffect(() => {
    if (!currentTeamId) return;
    api.fetchTeamMembers(currentTeamId).then(setTeamMembers).catch(() => {});
    api.fetchQuarters(currentTeamId).then(quarters => {
      // Samle alle unikke temaer fra alle kvartaler
      const themes = Array.from(new Set(quarters.flatMap(q => q.themes ?? [])));
      setAllThemes(themes);
    }).catch(() => {});
  }, [currentTeamId]);

  // ── Indlæs træning ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) {
      const dateStr = new Date().toISOString().slice(0, 10);
      setTraining({
        id: '',
        team_id: currentTeamId ?? '',
        date: dateStr,
        start_time: '',
        end_time: '',
        location: '',
        lead_trainer: user?.name ?? '',
        trainers: [],
        themes: [],
        focus_points: '',
        notes: '',
        participant_count: undefined,
        sections: [],
        stars: 0,
        archived: false,
        created_at: '',
        updated_at: '',
      });
      setLoading(false);
    } else if (id) {
      api.fetchTraining(id)
        .then(setTraining)
        .catch(() => navigate('/'))
        .finally(() => setLoading(false));
    }
  }, [id, isNew, currentTeamId, user?.name, navigate]);

  // ── Auto-gem (debounce 1200ms) ─────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (!canEdit) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      const t = trainingRef.current;
      if (!t) return;
      try {
        if (!t.id) {
          const created = await api.createTraining({ ...t, team_id: currentTeamId ?? '' });
          trainingRef.current = created;
          setTraining(created);
          window.history.replaceState(null, '', `/traininger/${created.id}`);
        } else {
          await api.updateTraining(t.id, t);
        }
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 2500);
      } catch {
        setSaveState('error');
      }
    }, 1200);
  }, [canEdit, currentTeamId]);

  function update(patch: Partial<Training>) {
    setTraining(prev => prev ? { ...prev, ...patch } : prev);
    scheduleSave();
  }

  async function saveNow(patch: Partial<Training>) {
    if (!training) return;
    const t = { ...training, ...patch };
    setTraining(t);
    setSaveState('saving');
    try {
      if (t.id) {
        await api.updateTraining(t.id, patch);
      } else {
        const created = await api.createTraining({ ...t, team_id: currentTeamId ?? '' });
        trainingRef.current = created;
        setTraining(created);
        window.history.replaceState(null, '', `/traininger/${created.id}`);
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');
    }
  }

  const [hsUpdating, setHsUpdating] = useState(false);

  async function handleHoldsportUpdate() {
    if (!training?.holdsport_id || !training.date || !currentTeamId) return;
    setHsUpdating(true);
    try {
      const [config, members] = await Promise.all([
        api.fetchHoldsportConfig(currentTeamId),
        api.get<Array<{ id: string; name: string; team_role: string }>>(
          `/api/users/team-members?team_id=${currentTeamId}`
        ),
      ]);
      const trainerNames = new Set(
        members
          .filter(m => m.team_role === 'trainer' || m.team_role === 'team_manager')
          .map(m => m.name)
      );
      const teams = await api.fetchHoldsportTeams(config.workerUrl, config.token);
      let found = null;
      for (const team of teams) {
        found = await api.fetchHoldsportActivity(
          config.workerUrl, config.token, team.id, training.holdsport_id, training.date
        );
        if (found) break;
      }
      if (!found) { setHsUpdating(false); return; }

      const rec = found as unknown as Record<string, unknown>;
      const users = rec.activities_users;
      let playerCount = 0;
      const trainerList: string[] = [];
      if (Array.isArray(users)) {
        // Detaljeret deltager-liste tilgængelig — præcis optælling
        for (const u of users) {
          const ur = u as Record<string, unknown>;
          if (ur.status_code !== 1) continue;
          const name = ur.name as string;
          if (trainerNames.has(name)) trainerList.push(name);
          else playerCount++;
        }
      } else {
        // activities_users ikke tilgængeligt — brug attendance_count som-er
        playerCount = (rec.attendance_count ?? rec.signups_count ?? 0) as number;
      }
      update({ participant_count: playerCount > 0 ? playerCount : undefined, trainers: trainerList });
    } catch { /* fejl ignoreres stille */ } finally {
      setHsUpdating(false);
    }
  }

  async function handleDelete() {
    if (!training?.id) { navigate('/'); return; }
    if (!confirm('Slet træning? Dette kan ikke fortrydes.')) return;
    await api.deleteTraining(training.id);
    navigate('/');
  }

  async function handleArchive() {
    await saveNow({ archived: !training?.archived });
    navigate('/');
  }

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text3)', fontSize: 15 }}>Indlæser træning…</div>;
  }
  if (!training) return null;

  const dur = durMin(training.start_time, training.end_time);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
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
          <>
            {!isNew && training.sections.length > 0 && (
              <button
                onClick={() => setShowSaveTemplate(true)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border2)',
                  borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
                }}
              >💾 Skabelon</button>
            )}

            <button
              onClick={handleArchive}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border2)',
                borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
              }}
            >{training.archived ? '↩ Gendan' : '📦 Arkivér'}</button>

            <button
              onClick={handleDelete}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border2)',
                borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--red)',
              }}
            >🗑 Slet</button>
          </>
        )}
      </div>

      {/* ── Header-kort ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        marginBottom: 20, overflow: 'hidden',
      }}>
        {/* Klikbar header-bar */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 20px', cursor: 'pointer',
            borderBottom: headerOpen ? '1px solid var(--border)' : 'none',
          }}
          onClick={toggleHeader}
        >
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
              {training.date ? fmtDateLong(training.date) : 'Ny træning'}
            </h1>
            {(training.start_time || dur || training.location) && (
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                {[
                  training.start_time && (training.end_time ? `${training.start_time}–${training.end_time}` : training.start_time),
                  dur && `${dur} min`,
                  training.location,
                ].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <span style={{ fontSize: 18, color: 'var(--text3)', userSelect: 'none' }}>
            {headerOpen ? '▲' : '▼'}
          </span>
        </div>

        {headerOpen && (
          <div style={{ padding: 20 }}>
            {/* Dato + tid — stacked på mobil */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>

              {/* Dato · Start · Slut — smal automatisk bredde, ikke fuld linje */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Field label="Dato">
                  <input
                    type="date"
                    value={training.date ?? ''}
                    onChange={e => update({ date: e.target.value })}
                    disabled={!canEdit}
                    style={{ ...inputStyle, fontSize: 14, padding: '8px 8px', width: 'auto', minWidth: 130 }}
                  />
                </Field>
                <Field label="Start">
                  <input
                    type="time"
                    value={training.start_time ?? ''}
                    onChange={e => update({ start_time: e.target.value })}
                    disabled={!canEdit}
                    style={{ ...inputStyle, fontSize: 14, padding: '8px 8px', width: 'auto', minWidth: 90 }}
                  />
                </Field>
                <Field label="Slut">
                  <input
                    type="time"
                    value={training.end_time ?? ''}
                    onChange={e => update({ end_time: e.target.value })}
                    disabled={!canEdit}
                    style={{ ...inputStyle, fontSize: 14, padding: '8px 8px', width: 'auto', minWidth: 90 }}
                  />
                </Field>
              </div>

              {/* Sted + antal side om side på bredere skærme */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <Field label="Sted">
                  <input
                    value={training.location ?? ''}
                    onChange={e => update({ location: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Fx Ajax hal 1…"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Antal spillere">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      value={training.participant_count ?? ''}
                      onChange={e => update({ participant_count: e.target.value ? Number(e.target.value) : undefined })}
                      disabled={!canEdit}
                      placeholder="0"
                      min={0}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    {training.holdsport_id && canEdit && (
                      <button
                        onClick={handleHoldsportUpdate}
                        disabled={hsUpdating}
                        title="Opdater fra Holdsport"
                        style={{
                          flexShrink: 0, padding: '0 14px', minHeight: 44, borderRadius: 8,
                          background: 'var(--bg-input)', border: '1px solid var(--border2)',
                          fontSize: 13, color: 'var(--text2)', cursor: hsUpdating ? 'wait' : 'pointer',
                        }}
                      >
                        {hsUpdating ? '…' : '↺ Opdater'}
                      </button>
                    )}
                  </div>
                  {training.holdsport_id && (
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                      Hentet fra Holdsport — kan ændres
                    </div>
                  )}
                </Field>
              </div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

              {/* Ansvarlig */}
              <Field label="Ansvarlig">
                {canEdit ? (
                  <UserSelect
                    value={training.lead_trainer ?? ''}
                    onChange={name => update({ lead_trainer: name })}
                    members={teamMembers}
                    placeholder="Vælg ansvarlig…"
                  />
                ) : (
                  <div style={{ ...inputStyle, color: training.lead_trainer ? 'var(--text)' : 'var(--text3)' }}>
                    {training.lead_trainer || '—'}
                  </div>
                )}
              </Field>

              {/* Øvrige trænere */}
              <Field label="Øvrige trænere">
                <UserMultiSelect
                  selected={training.trainers ?? []}
                  onChange={names => update({ trainers: names })}
                  members={teamMembers}
                  disabled={!canEdit}
                />
              </Field>

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

              {/* Temaer */}
              <Field label="Temaer">
                <ThemeSelect
                  selected={training.themes ?? []}
                  onChange={themes => update({ themes })}
                  allThemes={allThemes}
                  disabled={!canEdit}
                />
              </Field>

              {/* Fokuspunkter */}
              <Field label="Fokuspunkter">
                <textarea
                  value={training.focus_points ?? ''}
                  onChange={e => update({ focus_points: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Hvad vil vi opnå i dag?…"
                  style={textareaStyle}
                />
              </Field>

              {/* Noter */}
              <Field label="Noter">
                <textarea
                  value={training.notes ?? ''}
                  onChange={e => update({ notes: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Supplerende noter…"
                  style={textareaStyle}
                />
              </Field>

              {/* Vurdering */}
              <Field label="Vurdering">
                <StarRating value={training.stars} onChange={v => update({ stars: v })} />
              </Field>
            </div>
          </div>
        )}
      </div>

      {/* ── Sektioner & øvelser ── */}
      <SectionList
        training={training}
        canEdit={canEdit}
        onUpdate={update}
        onInstantSave={saveNow}
        onAIWholeTraining={() => setShowAISuggest(true)}
        onAISectionIndex={setAiSectionIndex}
        sectionTypes={sectionTypes}
      />

      {/* ── Gem skabelon modal ── */}
      {showSaveTemplate && currentTeamId && (
        <SaveTemplateModal
          training={training}
          teamId={currentTeamId}
          sectionTypes={sectionTypes}
          onSaved={() => {
            setShowSaveTemplate(false);
            setMiniToast('Skabelon gemt ✓');
            setTimeout(() => setMiniToast(null), 2800);
          }}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}

      {/* ── AI hele træning modal ── */}
      {showAISuggest && currentTeamId && (
        <AISuggestModal
          training={training}
          teamId={currentTeamId}
          sectionTypes={sectionTypes}
          onAccept={sections => {
            const updated = { ...training, sections };
            setTraining(updated);
            scheduleSave();
            setShowAISuggest(false);
            setMiniToast('Træning opdateret med AI-forslag ✓');
            setTimeout(() => setMiniToast(null), 2800);
          }}
          onClose={() => setShowAISuggest(false)}
        />
      )}

      {/* ── AI per sektion modal ── */}
      {aiSectionIndex !== null && training.sections[aiSectionIndex] && currentTeamId && (
        <AISectionModal
          section={training.sections[aiSectionIndex]}
          sectionIndex={aiSectionIndex}
          training={training}
          teamId={currentTeamId}
          sectionTypes={sectionTypes}
          onAccept={exercises => {
            const sections = training.sections.map((sec, i) =>
              i === aiSectionIndex ? { ...sec, exercises } : sec
            );
            const updated = { ...training, sections };
            setTraining(updated);
            scheduleSave();
            setAiSectionIndex(null);
            setMiniToast('Øvelser opdateret med AI-forslag ✓');
            setTimeout(() => setMiniToast(null), 2800);
          }}
          onClose={() => setAiSectionIndex(null)}
        />
      )}

      {/* Mini-toast */}
      {miniToast && (
        <div style={{
          position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
          zIndex: 700, padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
          background: 'var(--green)', color: '#fff',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>{miniToast}</div>
      )}

    </div>
  );
}
