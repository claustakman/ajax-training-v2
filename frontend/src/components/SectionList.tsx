/**
 * SectionList — håndterer sektioner og øvelser i trænings-editoren.
 *
 * Eksporterer: SectionList (hoved-komponent)
 */

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { Section, SectionExercise, SectionType, Exercise, Training } from '../lib/types';

// ─── Hjælpefunktioner ────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}

// ─── Fælles styles ───────────────────────────────────────────────────────────

const inputSm: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  borderRadius: 6, padding: '5px 8px', fontSize: 14, color: 'var(--text)',
  width: '100%', boxSizing: 'border-box', minHeight: 34,
};

const btnGhost: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border2)',
  borderRadius: 7, padding: '5px 10px', fontSize: 13,
  cursor: 'pointer', color: 'var(--text2)',
};

// ─── DurationBar ─────────────────────────────────────────────────────────────

function DurationBar({
  sections,
  training,
}: {
  sections: Section[];
  training: Pick<Training, 'start_time' | 'end_time'>;
}) {
  if (!training.start_time || !training.end_time) return null;

  const [sh, sm] = training.start_time.split(':').map(Number);
  const [eh, em] = training.end_time.split(':').map(Number);
  const totalAvail = (eh * 60 + em) - (sh * 60 + sm);
  if (totalAvail <= 0) return null;

  // Tæl kun én gruppe
  const seen = new Set<string>();
  let planned = 0;
  for (const s of sections) {
    if (s.group) {
      if (!seen.has(s.group)) { seen.add(s.group); planned += s.mins; }
    } else {
      planned += s.mins;
    }
  }

  const over = planned > totalAvail;
  const nearFull = planned / totalAvail > 0.9;
  const planColor = over ? 'var(--red)' : nearFull ? 'var(--yellow)' : 'var(--green)';

  return (
    <div style={{
      background: 'var(--bg-input)', borderRadius: 8, padding: '7px 12px',
      margin: '8px 16px 0', fontSize: 13, color: 'var(--text2)',
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    }}>
      <span>Varighed: <strong>{totalAvail} min</strong></span>
      <span>·</span>
      <span>Planlagt: <strong style={{ color: planColor }}>{planned} min</strong></span>
      {over && (
        <span style={{ color: 'var(--red)', fontWeight: 600 }}>
          ⚠ {planned - totalAvail} min over
        </span>
      )}
    </div>
  );
}

// ─── AddSectionModal ─────────────────────────────────────────────────────────

function AddSectionModal({
  sectionTypes,
  onAdd,
  onClose,
}: {
  sectionTypes: SectionType[];
  onAdd: (type: SectionType) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22 }}>Tilføj sektion</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text2)' }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {sectionTypes.map(st => (
            <button
              key={st.id}
              onClick={() => { onAdd(st); onClose(); }}
              style={{
                borderLeft: `4px solid ${st.color}`,
                background: 'var(--bg-card)', border: `1px solid var(--border)`,
                borderRadius: 8, padding: '12px 14px', cursor: 'pointer',
                textAlign: 'left', transition: 'background 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = `rgba(${hexToRgb(st.color)},0.08)`)}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
            >
              <span style={{
                fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700,
                color: st.color, display: 'block',
              }}>{st.label}</span>
              {st.required === 1 && (
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>Krævet</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ExercisePicker ──────────────────────────────────────────────────────────

function ExercisePicker({
  sectionType,
  exercises,
  alreadyAdded,
  onPick,
  onClose,
}: {
  sectionType: SectionType;
  exercises: Exercise[];
  alreadyAdded: string[];
  onPick: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  // Filtrer på sektiontype-tags og søgetekst
  const stTags = sectionType.tags ?? [];
  const filtered = exercises.filter(ex => {
    const matchTag = stTags.length === 0 || stTags.some(t => (ex.tags ?? []).includes(t));
    const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase());
    return matchTag && matchSearch;
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 20,
        width: '100%', maxWidth: 540, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 20, color: sectionType.color }}>
            Øvelser — {sectionType.label}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text2)' }}>×</button>
        </div>

        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Søg øvelse…"
          style={{
            ...inputSm, marginBottom: 12, fontSize: 15, padding: '8px 12px', minHeight: 40,
          }}
        />

        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 14, textAlign: 'center', margin: '24px 0' }}>
              Ingen øvelser fundet.
            </p>
          ) : filtered.map(ex => {
            const added = alreadyAdded.includes(ex.id);
            return (
              <div
                key={ex.id}
                onClick={() => !added && onPick(ex)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 12px', borderRadius: 9,
                  background: added ? 'var(--bg-input)' : 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  cursor: added ? 'default' : 'pointer',
                  opacity: added ? 0.55 : 1,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!added) e.currentTarget.style.background = 'var(--bg-input)'; }}
                onMouseLeave={e => { if (!added) e.currentTarget.style.background = 'var(--bg-card)'; }}
              >
                {ex.image_url && (
                  <img src={ex.image_url} alt={ex.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ex.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {ex.default_mins ? `${ex.default_mins} min` : ''}
                    {ex.stars > 0 ? ` · ${'★'.repeat(ex.stars)}` : ''}
                  </div>
                </div>
                {added ? (
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>Tilføjet</span>
                ) : (
                  <span style={{ fontSize: 20, color: sectionType.color, fontWeight: 700, lineHeight: 1 }}>+</span>
                )}
              </div>
            );
          })}

          {/* Fri øvelse */}
          <div
            onClick={() => onPick({ id: '', name: '' } as Exercise)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 12px', borderRadius: 9,
              background: 'var(--bg-card)', border: '1px dashed var(--border2)',
              cursor: 'pointer', marginTop: 4,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
          >
            <span style={{ fontSize: 20, color: 'var(--text3)' }}>✏️</span>
            <span style={{ fontSize: 14, color: 'var(--text2)', fontStyle: 'italic' }}>Fri øvelse…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SectionExerciseRow ───────────────────────────────────────────────────────

function SectionExerciseRow({
  ex,
  sectionColor,
  canEdit,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  ex: SectionExercise;
  sectionColor: string;
  canEdit: boolean;
  onUpdate: (patch: Partial<SectionExercise>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const isFree = !ex.id;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px', borderRadius: 8,
      background: ex.done ? `rgba(${hexToRgb(sectionColor)},0.06)` : 'transparent',
      transition: 'background 0.15s',
    }}>
      {/* Afkrydsning */}
      <input
        type="checkbox"
        checked={!!ex.done}
        onChange={e => onUpdate({ done: e.target.checked })}
        style={{ width: 18, height: 18, accentColor: sectionColor, flexShrink: 0, cursor: 'pointer' }}
      />

      {/* Navn */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {isFree && canEdit ? (
          <input
            value={ex.customName ?? ''}
            onChange={e => onUpdate({ customName: e.target.value })}
            placeholder="Fri øvelse…"
            style={{ ...inputSm, fontSize: 14 }}
          />
        ) : (
          <span style={{
            fontSize: 14, fontWeight: 500,
            textDecoration: ex.done ? 'line-through' : 'none',
            color: ex.done ? 'var(--text3)' : 'var(--text)',
          }}>
            {ex.customName || ex.id || '—'}
          </span>
        )}
      </div>

      {/* Minutter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        {canEdit ? (
          <input
            type="number"
            value={ex.mins || ''}
            onChange={e => onUpdate({ mins: Number(e.target.value) || 0 })}
            min={1}
            style={{ ...inputSm, width: 52, textAlign: 'center', padding: '4px 6px' }}
          />
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text2)', minWidth: 34, textAlign: 'right' }}>
            {ex.mins} min
          </span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>min</span>
      </div>

      {/* Flyt + slet */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button onClick={onMoveUp} disabled={isFirst} style={{ ...btnGhost, padding: '3px 7px', opacity: isFirst ? 0.3 : 1 }}>↑</button>
          <button onClick={onMoveDown} disabled={isLast} style={{ ...btnGhost, padding: '3px 7px', opacity: isLast ? 0.3 : 1 }}>↓</button>
          <button onClick={onRemove} style={{ ...btnGhost, padding: '3px 7px', color: 'var(--red)' }}>×</button>
        </div>
      )}
    </div>
  );
}

// ─── ExerciseNameResolver ────────────────────────────────────────────────────
// Slår navn op for en øvelses-id (bruger exercise-cachen fra parent)

// ─── SectionBlock ─────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  sectionType,
  sectionIndex,
  totalSections,
  exercises,
  canEdit,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  section: Section;
  sectionType: SectionType | undefined;
  sectionIndex: number;
  totalSections: number;
  exercises: Exercise[];
  canEdit: boolean;
  onUpdate: (patch: Partial<Section>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const color = sectionType?.color ?? '#6b6b6b';
  const label = sectionType?.label ?? section.type;

  const secMins = section.mins;
  const usedMins = (section.exercises ?? []).reduce((s, e) => s + (e.mins || 0), 0);
  const remaining = secMins - usedMins;
  const overMins = usedMins > secMins;

  const alreadyAddedIds = (section.exercises ?? []).filter(e => !!e.id).map(e => e.id!);

  function updateExercise(idx: number, patch: Partial<SectionExercise>) {
    const exs = [...(section.exercises ?? [])];
    exs[idx] = { ...exs[idx], ...patch };
    onUpdate({ exercises: exs });
  }

  function removeExercise(idx: number) {
    const exs = (section.exercises ?? []).filter((_, i) => i !== idx);
    onUpdate({ exercises: exs });
  }

  function moveExercise(idx: number, dir: -1 | 1) {
    const exs = [...(section.exercises ?? [])];
    const other = idx + dir;
    if (other < 0 || other >= exs.length) return;
    [exs[idx], exs[other]] = [exs[other], exs[idx]];
    onUpdate({ exercises: exs });
  }

  function addExercise(ex: Exercise) {
    const isFree = !ex.id;
    const newEx: SectionExercise = {
      id: isFree ? undefined : ex.id,
      customName: isFree ? '' : ex.name,
      mins: ex.default_mins ?? Math.max(1, Math.round(remaining / Math.max(1, 1))),
      done: false,
    };
    onUpdate({ exercises: [...(section.exercises ?? []), newEx] });
  }

  return (
    <div style={{
      borderLeft: `4px solid ${color}`,
      background: 'var(--bg-card)', borderRadius: '0 10px 10px 0',
      marginBottom: 10, overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      {/* Sektion-header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: `rgba(${hexToRgb(color)},0.05)`,
        borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
      }} onClick={() => setCollapsed(c => !c)}>
        {/* Label */}
        <span style={{
          fontFamily: 'var(--font-heading)', fontSize: 15, fontWeight: 700,
          color, flexShrink: 0,
        }}>
          {sectionIndex}. {label}
        </span>

        {/* Gruppe-badge */}
        {section.group && (
          <span style={{
            fontSize: 11, fontWeight: 700, background: color, color: '#fff',
            borderRadius: 4, padding: '1px 6px', flexShrink: 0,
          }}>Gruppe {section.group}</span>
        )}

        {/* Minutter-input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
          {canEdit ? (
            <input
              type="number"
              value={secMins || ''}
              onChange={e => onUpdate({ mins: Number(e.target.value) || 0 })}
              min={1}
              style={{ ...inputSm, width: 52, textAlign: 'center', padding: '3px 6px' }}
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color }}>{secMins}</span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>min</span>
          {!collapsed && (
            <span style={{
              fontSize: 12,
              color: overMins ? 'var(--red)' : 'var(--text3)',
              marginLeft: 4,
            }}>
              ({usedMins}/{secMins})
            </span>
          )}
        </div>

        {/* Flyt + slet */}
        {canEdit && (
          <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
            <button onClick={onMoveUp} disabled={sectionIndex === 1} style={{ ...btnGhost, padding: '2px 7px', opacity: sectionIndex === 1 ? 0.3 : 1 }}>↑</button>
            <button onClick={onMoveDown} disabled={sectionIndex === totalSections} style={{ ...btnGhost, padding: '2px 7px', opacity: sectionIndex === totalSections ? 0.3 : 1 }}>↓</button>
            <button onClick={onRemove} style={{ ...btnGhost, padding: '2px 7px', color: 'var(--red)' }}>×</button>
          </div>
        )}

        <span style={{ fontSize: 14, color: 'var(--text3)', marginLeft: 4 }}>{collapsed ? '▼' : '▲'}</span>
      </div>

      {!collapsed && (
        <div style={{ padding: '8px 12px 12px' }}>
          {/* Note */}
          {canEdit && (
            <input
              value={section.note ?? ''}
              onChange={e => onUpdate({ note: e.target.value })}
              placeholder="Note til sektionen…"
              style={{ ...inputSm, marginBottom: 8, fontSize: 13 }}
              onClick={e => e.stopPropagation()}
            />
          )}
          {!canEdit && section.note && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>{section.note}</p>
          )}

          {/* Øvelser */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(section.exercises ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0 8px', textAlign: 'center' }}>
                Ingen øvelser — klik "+ Øvelse"
              </p>
            ) : (
              (section.exercises ?? []).map((ex, idx) => {
                // Resolve name from exercise cache
                const exData = exercises.find(e => e.id === ex.id);
                const displayEx = { ...ex, customName: ex.customName || exData?.name || ex.id || '' };
                return (
                  <SectionExerciseRow
                    key={idx}
                    ex={displayEx}
                    sectionColor={color}
                    canEdit={canEdit}
                    onUpdate={patch => updateExercise(idx, patch)}
                    onRemove={() => removeExercise(idx)}
                    onMoveUp={() => moveExercise(idx, -1)}
                    onMoveDown={() => moveExercise(idx, 1)}
                    isFirst={idx === 0}
                    isLast={idx === (section.exercises ?? []).length - 1}
                  />
                );
              })
            )}
          </div>

          {/* + Øvelse */}
          {canEdit && (
            <button
              onClick={() => setShowPicker(true)}
              style={{
                ...btnGhost, marginTop: 8,
                borderColor: color, color,
                width: '100%', padding: '6px 0',
              }}
            >+ Øvelse</button>
          )}
        </div>
      )}

      {/* ExercisePicker */}
      {showPicker && sectionType && (
        <ExercisePicker
          sectionType={sectionType}
          exercises={exercises}
          alreadyAdded={alreadyAddedIds}
          onPick={ex => { addExercise(ex); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

// ─── LoadTemplateModal ────────────────────────────────────────────────────────

function LoadTemplateModal({
  teamId,
  onLoad,
  onClose,
}: {
  teamId: string;
  onLoad: (sections: Section[]) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<import('../lib/types').Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.fetchTemplates(teamId).then(setTemplates).finally(() => setLoading(false));
  }, [teamId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 440, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22 }}>Indlæs skabelon</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text2)' }}>×</button>
        </div>
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
                <button
                  onClick={() => { onLoad(t.sections); onClose(); }}
                  style={{
                    background: 'var(--accent)', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
                  }}
                >Indlæs</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SaveTemplateModal ────────────────────────────────────────────────────────

function SaveTemplateModal({
  teamId,
  sections,
  onClose,
}: {
  teamId: string;
  sections: Section[];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.createTemplate({ name: name.trim(), sections, team_id: teamId });
      setDone(true);
      setTimeout(onClose, 1000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.4)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 400,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-heading)', fontSize: 22 }}>Gem som skabelon</h2>
        {done ? (
          <p style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Gemt!</p>
        ) : (
          <>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="Skabelon-navn…"
              style={{ ...inputSm, fontSize: 15, marginBottom: 12, minHeight: 40 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ ...btnGhost, padding: '7px 16px' }}>Annuller</button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '7px 18px', fontSize: 14, cursor: 'pointer',
                  opacity: saving || !name.trim() ? 0.5 : 1,
                }}
              >{saving ? '…' : 'Gem'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SectionList (hoved-eksport) ──────────────────────────────────────────────

export function SectionList({
  training,
  canEdit,
  onUpdate,
}: {
  training: Training;
  canEdit: boolean;
  onUpdate: (patch: Partial<Training>) => void;
}) {
  const [sectionTypes, setSectionTypes] = useState<SectionType[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const teamId = training.team_id;

  useEffect(() => {
    if (!teamId) return;
    api.fetchSectionTypes(teamId).then(setSectionTypes).catch(() => {});
    api.fetchExercises().then(setExercises).catch(() => {});
  }, [teamId]);

  const sections = training.sections ?? [];

  function updateSections(updated: Section[]) {
    onUpdate({ sections: updated });
  }

  function addSection(st: SectionType) {
    const newSection: Section = {
      id: uid(),
      type: st.id,
      mins: 15,
      exercises: [],
    };
    updateSections([...sections, newSection]);
  }

  function removeSection(idx: number) {
    updateSections(sections.filter((_, i) => i !== idx));
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const updated = [...sections];
    const other = idx + dir;
    if (other < 0 || other >= updated.length) return;
    [updated[idx], updated[other]] = [updated[other], updated[idx]];
    updateSections(updated);
  }

  function updateSection(idx: number, patch: Partial<Section>) {
    const updated = [...sections];
    updated[idx] = { ...updated[idx], ...patch };
    updateSections(updated);
  }

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      overflow: 'hidden',
    }}>
      {/* Card-header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, flex: 1 }}>
          Sektioner & øvelser
        </span>

        {/* Indlæs skabelon */}
        <button
          onClick={() => setShowLoadTemplate(true)}
          title="Indlæs skabelon"
          style={{ ...btnGhost, padding: '5px 10px' }}
        >📋</button>

        {/* Gem som skabelon */}
        {canEdit && sections.length > 0 && (
          <button
            onClick={() => setShowSaveTemplate(true)}
            title="Gem som skabelon"
            style={{ ...btnGhost, padding: '5px 10px' }}
          >💾</button>
        )}

        {/* AI-forslag — disabled indtil Session 5 */}
        <button
          disabled
          title="AI-forslag (kommer i Session 5)"
          style={{
            ...btnGhost,
            border: '1px solid #7c3aed',
            color: '#7c3aed',
            opacity: 0.45,
            cursor: 'not-allowed',
            padding: '5px 12px',
          }}
        >✨ Hele træning</button>

        {/* + Sektion */}
        {canEdit && (
          <button
            onClick={() => setShowAddSection(true)}
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', color: 'var(--text)',
            }}
          >+ Sektion</button>
        )}
      </div>

      {/* Varighed-bar */}
      <DurationBar sections={sections} training={training} />

      {/* Sektioner */}
      <div style={{ padding: '12px 12px 16px' }}>
        {sections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text3)', fontSize: 14 }}>
            Ingen sektioner — klik "+ Sektion" for at begynde.
          </div>
        ) : (
          sections.map((sec, idx) => {
            const st = sectionTypes.find(t => t.id === sec.type);
            return (
              <SectionBlock
                key={sec.id}
                section={sec}
                sectionType={st}
                sectionIndex={idx + 1}
                totalSections={sections.length}
                exercises={exercises}
                canEdit={canEdit}
                onUpdate={patch => updateSection(idx, patch)}
                onRemove={() => removeSection(idx)}
                onMoveUp={() => moveSection(idx, -1)}
                onMoveDown={() => moveSection(idx, 1)}
              />
            );
          })
        )}
      </div>

      {/* Modaler */}
      {showAddSection && (
        <AddSectionModal
          sectionTypes={sectionTypes}
          onAdd={addSection}
          onClose={() => setShowAddSection(false)}
        />
      )}
      {showLoadTemplate && (
        <LoadTemplateModal
          teamId={teamId}
          onLoad={secs => {
            // Tilføj nye ids så React tracker dem
            const withIds = secs.map(s => ({ ...s, id: s.id || uid() }));
            updateSections(withIds);
          }}
          onClose={() => setShowLoadTemplate(false)}
        />
      )}
      {showSaveTemplate && (
        <SaveTemplateModal
          teamId={teamId}
          sections={sections}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}
    </div>
  );
}
