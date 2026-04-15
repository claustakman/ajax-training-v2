import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training, Template } from '../lib/types';
import { fmtDateLong, durMin } from '../lib/dateUtils';

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
  return (
    <span style={{ fontSize: 13, color, transition: 'color 0.3s' }}>{label}</span>
  );
}

// ─── Chip (tema, temavalg) ────────────────────────────────────────────────────
function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'var(--accent-light)', color: 'var(--accent)',
      borderRadius: 20, padding: '2px 10px', fontSize: 13, fontWeight: 500,
    }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--accent)', padding: 0, lineHeight: 1, fontSize: 14,
        }}>×</button>
      )}
    </span>
  );
}

// ─── Input-felt ───────────────────────────────────────────────────────────────
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

// ─── Stjerner ────────────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onClick={() => onChange(value === n ? 0 : n)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 22, padding: 0, color: n <= value ? '#f59e0b' : 'var(--border2)',
          lineHeight: 1,
        }}>★</button>
      ))}
    </div>
  );
}

// ─── Skabelon-modal ────────────────────────────────────────────────────────────
function TemplateModal({
  teamId,
  currentSections,
  onLoad,
  onClose,
}: {
  teamId: string;
  currentSections: Training['sections'];
  onLoad: (sections: Training['sections']) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.fetchTemplates(teamId).then(setTemplates).finally(() => setLoading(false));
  }, [teamId]);

  async function handleSave() {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const t = await api.createTemplate({ name: saveName.trim(), sections: currentSections, team_id: teamId });
      setTemplates(prev => [t, ...prev]);
      setSaveName('');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22 }}>Skabeloner</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text2)' }}>×</button>
        </div>

        {/* Gem nuværende */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>Gem nuværende sektioner som skabelon</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Skabelon-navn…"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleSave}
              disabled={saving || !saveName.trim()}
              style={{
                background: 'var(--accent)', color: '#fff', border: 'none',
                borderRadius: 8, padding: '0 16px', fontSize: 14, cursor: 'pointer',
                opacity: saving || !saveName.trim() ? 0.5 : 1,
              }}
            >
              {saving ? '…' : 'Gem'}
            </button>
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Indlæser…</p>
        ) : templates.length === 0 ? (
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Ingen skabeloner endnu.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 10,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t.sections?.length ?? 0} sektioner</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { onLoad(t.sections); onClose(); }}
                    style={{
                      background: 'var(--accent)', color: '#fff', border: 'none',
                      borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                    }}
                  >Indlæs</button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    style={{
                      background: 'var(--bg-card)', color: 'var(--red)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer',
                    }}
                  >Slet</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
  const [headerOpen, setHeaderOpen] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [themeInput, setThemeInput] = useState('');
  const [trainerInput, setTrainerInput] = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trainingRef = useRef<Training | null>(null);
  trainingRef.current = training;

  const isNew = id === 'ny';

  // ── Indlæs træning ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNew) {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const blank: Training = {
        id: '',
        team_id: currentTeamId ?? '',
        title: '',
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
      };
      setTraining(blank);
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
          // Ny træning — POST
          const created = await api.createTraining({ ...t, team_id: currentTeamId ?? '' });
          trainingRef.current = created;
          setTraining(created);
          // Skift URL til det faktiske id uden at reloade
          window.history.replaceState(null, '', `/traininger/${created.id}`);
        } else {
          // Opdater eksisterende
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
    setTraining(prev => {
      if (!prev) return prev;
      return { ...prev, ...patch };
    });
    scheduleSave();
  }

  // ── Øjeblikkelig gem (fx ved sletning / arkivering) ────────────────────────
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
    return (
      <div style={{ padding: 24, color: 'var(--text3)', fontSize: 15 }}>Indlæser træning…</div>
    );
  }

  if (!training) return null;

  const dur = durMin(training.start_time, training.end_time);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 16, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 14, padding: '6px 0', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >← Tilbage</button>

        <div style={{ flex: 1 }} />

        <SaveIndicator state={saveState} />

        {canEdit && (
          <>
            <button
              onClick={() => setShowTemplates(true)}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border2)',
                borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)',
              }}
            >📋 Skabeloner</button>

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
        {/* Kort-header: titel + toggle */}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 20px', cursor: 'pointer',
            borderBottom: headerOpen ? '1px solid var(--border)' : 'none',
          }}
          onClick={() => setHeaderOpen(o => !o)}
        >
          <div style={{ flex: 1 }}>
            {canEdit ? (
              <input
                value={training.title ?? ''}
                onChange={e => update({ title: e.target.value })}
                onClick={e => e.stopPropagation()}
                placeholder="Træningens titel…"
                style={{
                  ...inputStyle,
                  background: 'transparent', border: 'none',
                  fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-heading)',
                  padding: 0, minHeight: 'auto',
                }}
              />
            ) : (
              <h1 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-heading)', fontWeight: 700 }}>
                {training.title || 'Uden titel'}
              </h1>
            )}
            {training.date && (
              <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>
                {fmtDateLong(training.date)}
                {training.start_time && ` · ${training.start_time}`}
                {training.end_time && `–${training.end_time}`}
                {dur && ` (${dur} min)`}
              </div>
            )}
          </div>
          <span style={{ fontSize: 18, color: 'var(--text3)', userSelect: 'none' }}>
            {headerOpen ? '▲' : '▼'}
          </span>
        </div>

        {headerOpen && (
          <div style={{ padding: '20px' }}>
            {/* ── 3-kolonne grid ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 20, marginBottom: 20,
            }}>

              {/* Kolonne 1: Tid & sted */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Dato">
                  <input
                    type="date"
                    value={training.date ?? ''}
                    onChange={e => update({ date: e.target.value })}
                    disabled={!canEdit}
                    style={inputStyle}
                  />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Field label="Start">
                    <input
                      type="time"
                      value={training.start_time ?? ''}
                      onChange={e => update({ start_time: e.target.value })}
                      disabled={!canEdit}
                      style={inputStyle}
                    />
                  </Field>
                  <Field label="Slut">
                    <input
                      type="time"
                      value={training.end_time ?? ''}
                      onChange={e => update({ end_time: e.target.value })}
                      disabled={!canEdit}
                      style={inputStyle}
                    />
                  </Field>
                </div>
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
                  <input
                    type="number"
                    value={training.participant_count ?? ''}
                    onChange={e => update({ participant_count: e.target.value ? Number(e.target.value) : undefined })}
                    disabled={!canEdit}
                    placeholder="0"
                    min={0}
                    style={inputStyle}
                  />
                </Field>
              </div>

              {/* Kolonne 2: Trænere & temaer */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Cheftræner">
                  <input
                    value={training.lead_trainer ?? ''}
                    onChange={e => update({ lead_trainer: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Navn…"
                    style={inputStyle}
                  />
                </Field>
                <Field label="Øvrige trænere">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    {(training.trainers ?? []).map(tr => (
                      <Chip key={tr} label={tr} onRemove={canEdit ? () => update({ trainers: training.trainers.filter(x => x !== tr) }) : undefined} />
                    ))}
                  </div>
                  {canEdit && (
                    <input
                      value={trainerInput}
                      onChange={e => setTrainerInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && trainerInput.trim()) {
                          e.preventDefault();
                          const name = trainerInput.trim();
                          if (!training.trainers.includes(name)) {
                            update({ trainers: [...training.trainers, name] });
                          }
                          setTrainerInput('');
                        }
                      }}
                      placeholder="Tilføj navn + Enter…"
                      style={inputStyle}
                    />
                  )}
                </Field>
                <Field label="Temaer">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    {(training.themes ?? []).map(th => (
                      <Chip key={th} label={th} onRemove={canEdit ? () => update({ themes: training.themes.filter(x => x !== th) }) : undefined} />
                    ))}
                  </div>
                  {canEdit && (
                    <input
                      value={themeInput}
                      onChange={e => setThemeInput(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && themeInput.trim()) {
                          e.preventDefault();
                          const th = themeInput.trim();
                          if (!training.themes.includes(th)) {
                            update({ themes: [...training.themes, th] });
                          }
                          setThemeInput('');
                        }
                      }}
                      placeholder="Tilføj tema + Enter…"
                      style={inputStyle}
                    />
                  )}
                </Field>
              </div>

              {/* Kolonne 3: Fokus, noter, vurdering */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label="Fokuspunkter">
                  <textarea
                    value={training.focus_points ?? ''}
                    onChange={e => update({ focus_points: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Hvad vil vi opnå i dag?…"
                    style={textareaStyle}
                  />
                </Field>
                <Field label="Noter">
                  <textarea
                    value={training.notes ?? ''}
                    onChange={e => update({ notes: e.target.value })}
                    disabled={!canEdit}
                    placeholder="Supplerende noter…"
                    style={textareaStyle}
                  />
                </Field>
                <Field label="Vurdering">
                  <StarRating value={training.stars} onChange={v => update({ stars: v })} />
                </Field>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Sektioner placeholder ── */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        padding: 24, color: 'var(--text3)', fontSize: 14, textAlign: 'center',
      }}>
        Sektioner bygges i Session 3.
      </div>

      {/* ── Skabelon-modal ── */}
      {showTemplates && currentTeamId && (
        <TemplateModal
          teamId={currentTeamId}
          currentSections={training.sections}
          onLoad={sections => update({ sections })}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}
