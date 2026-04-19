/**
 * SectionList — sektioner og øvelser i trænings-editoren.
 * Session 3 — fuldt implementeret.
 */

import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import type { Section, SectionExercise, SectionType, Exercise, Training } from '../lib/types';

// ─── Hjælpefunktioner ────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

function exerciseImageUrl(ex: Exercise): string | null {
  if (!ex.image_r2_key) return null;
  return `${BASE_URL}/api/exercises/${encodeURIComponent(ex.id)}/image?key=${encodeURIComponent(ex.image_r2_key)}`;
}

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function hexToRgb(hex: string): string {
  const h = (hex ?? '#888').replace('#', '').padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `${r},${g},${b}`;
}

// ─── Gruppe-farver ───────────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#f59e0b', text: '#78350f' },
  B: { bg: '#8b5cf6', text: '#2e1065' },
  C: { bg: '#06b6d4', text: '#164e63' },
  D: { bg: '#ec4899', text: '#500724' },
  E: { bg: '#22c55e', text: '#14532d' },
  F: { bg: '#f97316', text: '#431407' },
};

const GROUP_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

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

function DurationBar({ sections, training }: {
  sections: Section[];
  training: Pick<Training, 'start_time' | 'end_time'>;
}) {
  if (!training.start_time || !training.end_time) return null;
  const [sh, sm] = training.start_time.split(':').map(Number);
  const [eh, em] = training.end_time.split(':').map(Number);
  const totalAvail = (eh * 60 + em) - (sh * 60 + sm);
  if (totalAvail <= 0) return null;

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
      {over && <span style={{ color: 'var(--red)', fontWeight: 600 }}>⚠ {planned - totalAvail} min over</span>}
    </div>
  );
}

// ─── ExerciseDetailModal ──────────────────────────────────────────────────────

function ExerciseDetailModal({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 700, flex: 1, paddingRight: 12 }}>
            {ex.name}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--text2)', flexShrink: 0 }}>×</button>
        </div>

        {exerciseImageUrl(ex) && (
          <img
            src={exerciseImageUrl(ex)!} alt={ex.name}
            style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 14 }}
          />
        )}

        {/* Tags */}
        {ex.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {ex.tags.map(t => (
              <span key={t} style={{
                fontSize: 12, background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 20, padding: '2px 9px', color: 'var(--text2)',
              }}>{t}</span>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, fontSize: 13, color: 'var(--text2)' }}>
          {ex.default_mins && <span>⏱ {ex.default_mins} min</span>}
          {ex.stars > 0 && <span style={{ color: '#f59e0b' }}>{'★'.repeat(ex.stars)}</span>}
          {ex.age_groups?.length > 0 && <span>👤 {ex.age_groups.join(', ')}</span>}
        </div>

        {ex.description && (
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
            {ex.description}
          </p>
        )}
        {ex.variants && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Varianter</div>
            <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap' }}>{ex.variants}</p>
          </div>
        )}
        {ex.link && (
          <a href={ex.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, color: 'var(--accent)' }}>
            🔗 Se link
          </a>
        )}
      </div>
    </div>
  );
}

// ─── AddSectionModal ─────────────────────────────────────────────────────────

function AddSectionModal({ sectionTypes, onAdd, onClose }: {
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
              onMouseEnter={e => (e.currentTarget.style.background = `rgba(${hexToRgb(st.color)},0.09)`)}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
            >
              <span style={{
                fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 700,
                color: st.color, display: 'block',
              }}>{st.label}</span>
              {st.required === 1 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>Krævet</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FreeExerciseModal ────────────────────────────────────────────────────────

function FreeExerciseModal({ onAdd, onClose }: {
  onAdd: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 380,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-heading)', fontSize: 20 }}>Fri øvelse</h2>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onAdd(name.trim()); onClose(); } }}
          placeholder="Navn på øvelse…"
          style={{ ...inputSm, fontSize: 15, marginBottom: 14, minHeight: 42 }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...btnGhost, padding: '7px 16px' }}>Annuller</button>
          <button
            onClick={() => { if (name.trim()) { onAdd(name.trim()); onClose(); } }}
            disabled={!name.trim()}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 18px', fontSize: 14, cursor: 'pointer',
              opacity: name.trim() ? 1 : 0.4,
            }}
          >Tilføj</button>
        </div>
      </div>
    </div>
  );
}

// ─── ExercisePicker ──────────────────────────────────────────────────────────

function ExercisePicker({ sectionType, exercises, alreadyAdded, onPick, onClose }: {
  sectionType: SectionType;
  exercises: Exercise[];
  alreadyAdded: string[];
  onPick: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [showFree, setShowFree] = useState(false);
  const [detailEx, setDetailEx] = useState<Exercise | null>(null);

  const stTags = sectionType.tags ?? [];

  const relevantExercises = exercises.filter(ex =>
    stTags.length === 0 || stTags.some(t => (ex.tags ?? []).includes(t))
  );
  const allTags = Array.from(new Set(relevantExercises.flatMap(ex => ex.tags ?? []))).sort();

  const filtered = relevantExercises.filter(ex => {
    const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase());
    const matchTags = activeTags.length === 0 || activeTags.every(t => (ex.tags ?? []).includes(t));
    return matchSearch && matchTags;
  }).slice(0, 80);

  function toggleTag(tag: string) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  return (
    <>
      {/* Fylder hele skærmen */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'flex-end',
      }} onClick={onClose}>
        <div style={{
          background: 'var(--bg)',
          borderRadius: '16px 16px 0 0',
          padding: '0',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
        }} onClick={e => e.stopPropagation()}>

          {/* Sticky header */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px 16px 0 0',
            padding: '12px 16px 14px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0 auto 14px' }} />

            {/* Titel + luk */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 20, color: sectionType.color }}>
                Tilføj øvelse — {sectionType.label}
              </h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--text2)', padding: 4, lineHeight: 1 }}>×</button>
            </div>

            {/* Søg */}
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Søg øvelse…"
              style={{ ...inputSm, marginBottom: 10, fontSize: 16, padding: '10px 12px', minHeight: 44 }}
            />

            {/* Tag-filter pills */}
            {allTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {allTags.map(tag => {
                  const active = activeTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      style={{
                        fontSize: 12, borderRadius: 20, padding: '4px 12px', border: 'none',
                        cursor: 'pointer', fontWeight: active ? 600 : 400,
                        background: active ? sectionType.color : 'var(--bg-input)',
                        color: active ? '#fff' : 'var(--text2)',
                        transition: 'background 0.12s',
                        minHeight: 30,
                      }}
                    >{tag}</button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scrollbar liste */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.length === 0 && (
              <p style={{ color: 'var(--text3)', fontSize: 14, textAlign: 'center', margin: '32px 0' }}>
                Ingen øvelser fundet.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map(ex => {
                const added = alreadyAdded.includes(ex.id);
                return (
                  <ExercisePickerCard
                    key={ex.id}
                    ex={ex}
                    added={added}
                    accentColor={sectionType.color}
                    onPick={() => { if (!added) onPick(ex); }}
                    onDetail={() => setDetailEx(ex)}
                  />
                );
              })}

              {/* Fri øvelse */}
              <div
                onClick={() => setShowFree(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px',
                  borderTop: '1px dashed var(--border2)',
                  cursor: 'pointer',
                  paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <span style={{ fontSize: 18 }}>✏️</span>
                <span style={{ fontSize: 15, color: 'var(--text2)', fontStyle: 'italic' }}>+ Fri øvelse…</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showFree && (
        <FreeExerciseModal
          onAdd={name => {
            onPick({ id: '', name, default_mins: 5 } as Exercise);
            setShowFree(false);
          }}
          onClose={() => setShowFree(false)}
        />
      )}

      {detailEx && (
        <ExerciseDetailModal ex={detailEx} onClose={() => setDetailEx(null)} />
      )}
    </>
  );
}

// ─── ExercisePickerCard ───────────────────────────────────────────────────────

function ExercisePickerCard({ ex, added, accentColor, onPick, onDetail }: {
  ex: Exercise;
  added: boolean;
  accentColor: string;
  onPick: () => void;
  onDetail: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px',
      borderBottom: '1px solid var(--border)',
      background: added ? 'var(--bg-input)' : 'var(--bg-card)',
      opacity: added ? 0.65 : 1,
    }}>
      {/* Venstre: navn + tags — klik åbner detalje */}
      <div
        onClick={onDetail}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <div style={{
          fontWeight: 600, fontSize: 15, color: 'var(--text)',
          marginBottom: 5, lineHeight: 1.3,
        }}>
          {ex.name}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {(ex.tags ?? []).map(t => (
            <span key={t} style={{
              fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 20, padding: '2px 8px', color: 'var(--text2)',
            }}>{t}</span>
          ))}
          {ex.default_mins ? (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>⏱ {ex.default_mins} min</span>
          ) : null}
          {ex.stars > 0 && (
            <span style={{ fontSize: 11, color: '#f59e0b' }}>{'★'.repeat(ex.stars)}</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>ℹ︎ Se detaljer</div>
      </div>

      {/* Højre: tilføj-knap */}
      {added ? (
        <span style={{ fontSize: 12, color: accentColor, fontWeight: 600, flexShrink: 0 }}>✓ Tilføjet</span>
      ) : (
        <button
          onClick={onPick}
          style={{
            background: accentColor, color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 16px', fontSize: 14,
            fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            minHeight: 40,
          }}
        >+ Tilføj</button>
      )}
    </div>
  );
}

// ─── SaveToCatalogModal ───────────────────────────────────────────────────────

function SaveToCatalogModal({ name, onSave, onClose }: {
  name: string;
  onSave: (exerciseId: string) => void;
  onClose: () => void;
}) {
  const [catalog, setCatalog] = useState<'hal' | 'fys'>('hal');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const res = await api.post<{ id: string }>('/api/exercises', {
        name,
        catalog,
        tags,
        age_groups: [],
      });
      setDone(true);
      setTimeout(() => { onSave(res.id); onClose(); }, 800);
    } catch {
      setSaving(false);
      alert('Fejl ved gem til katalog');
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 380,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontFamily: 'var(--font-heading)', fontSize: 20 }}>Gem til katalog</h2>
        <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 16 }}>"{name}"</div>

        {done ? (
          <p style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Gemt til katalog!</p>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Katalog</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['hal', 'fys'] as const).map(c => (
                  <button key={c} onClick={() => setCatalog(c)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 14, fontWeight: 600,
                    background: catalog === c ? 'var(--accent)' : 'var(--bg-input)',
                    color: catalog === c ? '#fff' : 'var(--text2)',
                    border: `1px solid ${catalog === c ? 'var(--accent)' : 'var(--border2)'}`,
                    cursor: 'pointer',
                  }}>{c === 'hal' ? 'Hal' : 'Fysisk'}</button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>Tags (kommaseparerede)</div>
              <input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="f.eks. afleveringer, teknik"
                style={{ ...inputSm, fontSize: 14, minHeight: 40 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ ...btnGhost, padding: '7px 16px' }}>Annuller</button>
              <button
                onClick={handleSave} disabled={saving}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '7px 18px', fontSize: 14, cursor: 'pointer',
                  opacity: saving ? 0.5 : 1,
                }}
              >{saving ? '…' : 'Gem'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ExerciseRow ──────────────────────────────────────────────────────────────

function ExerciseRow({ ex, exerciseDef, sectionColor, canEdit, isFirst, isLast,
  onToggleDone, onMoveUp, onMoveDown, onDelete, onClickName, onUpdate,
}: {
  ex: SectionExercise;
  exerciseDef: Exercise | undefined;
  sectionColor: string;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggleDone: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onClickName: () => void;
  onUpdate: (patch: Partial<SectionExercise>) => void;
}) {
  const [showSaveToCatalog, setShowSaveToCatalog] = useState(false);
  const isFree = !ex.id;
  const displayName = ex.customName || exerciseDef?.name || ex.id || '—';
  const tags = exerciseDef?.tags ?? [];

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '8px 10px', borderRadius: 6,
      background: 'var(--bg-input)', border: '1px solid var(--border)',
      marginBottom: 5,
      opacity: ex.done ? 0.5 : 1,
      transition: 'opacity 0.15s',
    }}>
      {/* Cirkel-afkrydsning */}
      <button
        onClick={onToggleDone}
        style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          border: ex.done ? 'none' : '2px solid var(--border2)',
          background: ex.done ? sectionColor : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: '#fff', marginTop: 1,
          transition: 'background 0.15s, border-color 0.15s',
        }}
        aria-label="Afkryds øvelse"
      >{ex.done ? '✓' : ''}</button>

      {/* Op/ned */}
      {canEdit && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}>
          <button onClick={onMoveUp} disabled={isFirst} style={{ ...btnGhost, padding: '1px 5px', fontSize: 11, opacity: isFirst ? 0.25 : 1 }}>▲</button>
          <button onClick={onMoveDown} disabled={isLast} style={{ ...btnGhost, padding: '1px 5px', fontSize: 11, opacity: isLast ? 0.25 : 1 }}>▼</button>
        </div>
      )}

      {/* Navn + tags */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {isFree && canEdit ? (
          <input
            value={ex.customName ?? ''}
            onChange={e => onUpdate({ customName: e.target.value })}
            placeholder="Fri øvelse…"
            style={{ ...inputSm, fontSize: 14, textDecoration: ex.done ? 'line-through' : 'none' }}
          />
        ) : (
          <span
            onClick={!isFree ? onClickName : undefined}
            style={{
              fontSize: 14, fontWeight: 500,
              textDecoration: ex.done ? 'line-through' : (!isFree ? 'underline dotted' : 'none'),
              color: ex.done ? 'var(--text3)' : 'var(--text)',
              cursor: !isFree ? 'pointer' : 'default',
            }}
          >{displayName}</span>
        )}
        {tags.length > 0 && !ex.done && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {tags.slice(0, 4).map(t => (
              <span key={t} style={{
                fontSize: 11, background: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: 20, padding: '1px 7px', color: 'var(--text2)',
              }}>{t}</span>
            ))}
          </div>
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
            style={{ ...inputSm, width: 50, textAlign: 'center', padding: '3px 5px', fontSize: 14 }}
          />
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{ex.mins}</span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>min</span>
      </div>

      {/* Gem til katalog (kun fri øvelse med navn) */}
      {canEdit && isFree && ex.customName?.trim() && (
        <button
          onClick={() => setShowSaveToCatalog(true)}
          title="Gem til katalog"
          style={{ ...btnGhost, padding: '3px 7px', flexShrink: 0, fontSize: 13 }}
        >📚</button>
      )}

      {/* Slet */}
      {canEdit && (
        <button
          onClick={onDelete}
          style={{ ...btnGhost, padding: '3px 7px', color: 'var(--red)', flexShrink: 0, fontSize: 14 }}
        >×</button>
      )}

      {showSaveToCatalog && (
        <SaveToCatalogModal
          name={ex.customName ?? ''}
          onSave={exerciseId => onUpdate({ id: exerciseId, customName: undefined })}
          onClose={() => setShowSaveToCatalog(false)}
        />
      )}
    </div>
  );
}

// ─── SectionBlock ─────────────────────────────────────────────────────────────

function SectionBlock({ section, sectionType, sectionIndex, totalSections, exercises, canEdit, teamId,
  onUpdate, onRemove, onMoveUp, onMoveDown, onToggleDone,
}: {
  section: Section;
  sectionType: SectionType | undefined;
  sectionIndex: number;
  totalSections: number;
  exercises: Exercise[];
  canEdit: boolean;
  teamId: string;
  onUpdate: (patch: Partial<Section>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleDone: (exerciseIdx: number) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [detailEx, setDetailEx] = useState<Exercise | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showLoadSection, setShowLoadSection] = useState(false);

  const color = sectionType?.color ?? '#6b6b6b';
  const label = sectionType?.label ?? section.type;
  const exList = section.exercises ?? [];
  const doneCount = exList.filter(e => e.done).length;
  const total = exList.length;
  const allDone = total > 0 && doneCount === total;

  // Gruppe-badge farver
  const groupStyle = section.group ? (GROUP_COLORS[section.group] ?? { bg: '#888', text: '#fff' }) : null;

  function updateExercise(idx: number, patch: Partial<SectionExercise>) {
    const exs = [...exList];
    exs[idx] = { ...exs[idx], ...patch };
    onUpdate({ exercises: exs });
  }

  function removeExercise(idx: number) {
    onUpdate({ exercises: exList.filter((_, i) => i !== idx) });
  }

  function moveExercise(idx: number, dir: -1 | 1) {
    const exs = [...exList];
    const other = idx + dir;
    if (other < 0 || other >= exs.length) return;
    [exs[idx], exs[other]] = [exs[other], exs[idx]];
    onUpdate({ exercises: exs });
  }

  function addExercise(ex: Exercise) {
    const usedMins = exList.reduce((s, e) => s + (e.mins || 0), 0);
    const remaining = section.mins - usedMins;
    const isFree = !ex.id;
    const newEx: SectionExercise = {
      id: isFree ? undefined : ex.id,
      customName: isFree ? ex.name : undefined,
      mins: ex.default_mins ?? Math.max(1, Math.min(remaining, 10)),
      done: false,
    };
    onUpdate({ exercises: [...exList, newEx] });
  }

  const alreadyAddedIds = exList.filter(e => !!e.id).map(e => e.id!);

  return (
    <div style={{
      borderLeft: `4px solid ${color}`,
      border: `1px solid var(--border)`,
      borderRadius: 8, marginBottom: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 13px', background: 'var(--bg-input)',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        {/* Flyt op/ned */}
        {canEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={onMoveUp} disabled={sectionIndex === 1}
              style={{ ...btnGhost, padding: '1px 5px', fontSize: 11, opacity: sectionIndex === 1 ? 0.25 : 1, lineHeight: 1 }}>▲</button>
            <button onClick={onMoveDown} disabled={sectionIndex === totalSections}
              style={{ ...btnGhost, padding: '1px 5px', fontSize: 11, opacity: sectionIndex === totalSections ? 0.25 : 1, lineHeight: 1 }}>▼</button>
          </div>
        )}

        {/* Chevron */}
        <span style={{
          fontSize: 13, color: 'var(--text3)', flexShrink: 0,
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>▾</span>

        {/* Label */}
        <span style={{
          fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 700,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          color, flexShrink: 0,
        }}>
          {sectionIndex}. {label}
        </span>

        {/* Afkrydsnings-progress */}
        {total > 0 && (
          <span style={{
            fontSize: 12, flexShrink: 0,
            color: allDone ? 'var(--green)' : 'var(--text3)',
            fontWeight: allDone ? 700 : 400,
          }}>
            {allDone ? '✓ Færdig' : `${doneCount}/${total}`}
          </span>
        )}

        {/* Gruppe-badge */}
        {section.group && groupStyle && (
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: groupStyle.bg, color: groupStyle.text,
            borderRadius: 4, padding: '1px 7px', flexShrink: 0,
          }}>Gruppe {section.group}</span>
        )}

        {/* Collapsed: vis antal + tid */}
        {collapsed && (
          <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto', flexShrink: 0 }}>
            {total > 0 ? `${total} øv · ` : ''}{section.mins} min
          </span>
        )}

        {/* Ikke collapsed: mins + gruppe + slet (kun disse i headeren) */}
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }} onClick={e => e.stopPropagation()}>
            {/* Minutter */}
            {canEdit ? (
              <input
                type="number"
                value={section.mins || ''}
                onChange={e => onUpdate({ mins: Number(e.target.value) || 0 })}
                min={1} max={240}
                style={{ ...inputSm, width: 52, textAlign: 'center', padding: '3px 6px', fontSize: 15, fontWeight: 700 }}
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 700, color }}>{section.mins}</span>
            )}
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>min</span>

            {/* Gruppe-select */}
            {canEdit && (
              <select
                value={section.group ?? ''}
                onChange={e => onUpdate({ group: e.target.value || undefined })}
                style={{ ...inputSm, width: 'auto', fontSize: 11, padding: '3px 6px', minHeight: 'auto' }}
              >
                <option value="">Gruppe –</option>
                {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            )}

            {/* Slet sektion */}
            {canEdit && (
              <button onClick={onRemove} style={{ ...btnGhost, padding: '3px 8px', color: 'var(--red)', fontSize: 15 }}>✕</button>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: '10px 12px 12px', background: 'var(--bg-card)' }}>
          {/* Note */}
          {canEdit && (
            <input
              value={section.note ?? ''}
              onChange={e => onUpdate({ note: e.target.value })}
              placeholder="Note til sektionen…"
              style={{ ...inputSm, marginBottom: 8, fontSize: 13 }}
            />
          )}
          {!canEdit && section.note && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text2)', fontStyle: 'italic' }}>{section.note}</p>
          )}

          {/* AI + Øvelse + skabelon knapper */}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <button
                disabled
                title="AI-forslag til denne sektion (Session 5)"
                style={{ ...btnGhost, border: '1px solid #7c3aed', color: '#7c3aed', opacity: 0.4, cursor: 'not-allowed', padding: '5px 10px', fontSize: 13, flex: 1 }}
              >✨ AI</button>
              <button
                onClick={() => setShowPicker(true)}
                style={{ ...btnGhost, borderColor: color, color, padding: '5px 12px', fontSize: 13, fontWeight: 600, flex: 2 }}
              >+ Øvelse</button>
              <button
                onClick={() => setShowLoadSection(true)}
                title="Indlæs sektionsskabelon"
                style={{ ...btnGhost, padding: '5px 10px', fontSize: 13 }}
              >📋</button>
            </div>
          )}

          {exList.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: '4px 0', textAlign: 'center' }}>Ingen øvelser</p>
          ) : exList.map((ex, idx) => {
            const exDef = exercises.find(e => e.id === ex.id);
            return (
              <ExerciseRow
                key={idx}
                ex={ex}
                exerciseDef={exDef}
                sectionColor={color}
                canEdit={canEdit}
                isFirst={idx === 0}
                isLast={idx === exList.length - 1}
                onToggleDone={() => onToggleDone(idx)}
                onMoveUp={() => moveExercise(idx, -1)}
                onMoveDown={() => moveExercise(idx, 1)}
                onDelete={() => removeExercise(idx)}
                onClickName={() => exDef && setDetailEx(exDef)}
                onUpdate={patch => updateExercise(idx, patch)}
              />
            );
          })}
        </div>
      )}

      {/* ExercisePicker */}
      {showPicker && sectionType && (
        <ExercisePicker
          sectionType={sectionType}
          exercises={exercises}
          alreadyAdded={alreadyAddedIds}
          onPick={ex => {
            addExercise(ex);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Øvelse-detalje modal */}
      {detailEx && <ExerciseDetailModal ex={detailEx} onClose={() => setDetailEx(null)} />}

      {/* Indlæs sektionsskabelon */}
      {showLoadSection && sectionType && (
        <LoadSectionTemplateModal
          teamId={teamId}
          sectionTypeId={sectionType.id}
          onLoad={s => onUpdate({ exercises: s.exercises, mins: s.mins, note: s.note })}
          onClose={() => setShowLoadSection(false)}
        />
      )}
    </div>
  );
}

// ─── LoadTemplateModal (fuld træning) ────────────────────────────────────────

function LoadTemplateModal({ teamId, hasSections, onLoad, onClose }: {
  teamId: string;
  hasSections: boolean;
  onLoad: (sections: Section[]) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<import('../lib/types').Template[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    api.fetchTemplates(teamId, { type: 'training' })
      .then(setTemplates)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [teamId]);

  async function handleDelete(id: string) {
    if (!confirm('Slet skabelon?')) return;
    await api.deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function handleLoad(sections: Section[]) {
    const clean = sections.map(s => ({
      ...s, id: uid(),
      exercises: (s.exercises ?? []).map(e => ({ ...e, done: false })),
    }));
    onLoad(clean);
    onClose();
  }

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
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22 }}>Indlæs træningsskabelon</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text2)' }}>×</button>
        </div>

        {hasSections && (
          <div style={{
            background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
            padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#78350f',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <span>⚠</span><span>Dette erstatter dine nuværende sektioner.</span>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Indlæser…</p>
        ) : templates.length === 0 ? (
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Ingen træningsskabeloner — gem en træning som skabelon.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 10,
                gap: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t.sections?.length ?? 0} sektioner</div>
                  {t.description && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{t.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleDelete(t.id)}
                    style={{ ...btnGhost, padding: '5px 8px', color: 'var(--red)', fontSize: 13 }}>🗑</button>
                  <button onClick={() => handleLoad(t.sections)}
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
                    Indlæs
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LoadSectionTemplateModal ─────────────────────────────────────────────────

function LoadSectionTemplateModal({ teamId, sectionTypeId, onLoad, onClose }: {
  teamId: string;
  sectionTypeId: string;
  onLoad: (section: Section) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<import('../lib/types').Template[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    api.fetchTemplates(teamId, { type: 'section', section_type: sectionTypeId })
      .then(setTemplates)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [teamId, sectionTypeId]);

  async function handleDelete(id: string) {
    if (!confirm('Slet skabelon?')) return;
    await api.deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function handleLoad(tmpl: import('../lib/types').Template) {
    const raw = tmpl.sections[0];
    if (!raw) return;
    onLoad({ ...raw, id: uid(), exercises: raw.exercises.map(e => ({ ...e, done: false })) });
    onClose();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 420, maxHeight: '75vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 20 }}>Indlæs sektionsskabelon</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text2)' }}>×</button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Indlæser…</p>
        ) : templates.length === 0 ? (
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Ingen skabeloner for denne sektionstype.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 10, gap: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {t.sections[0]?.exercises?.length ?? 0} øvelse{(t.sections[0]?.exercises?.length ?? 0) !== 1 ? 'r' : ''} · {t.sections[0]?.mins ?? 0} min
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => handleDelete(t.id)}
                    style={{ ...btnGhost, padding: '5px 8px', color: 'var(--red)', fontSize: 13 }}>🗑</button>
                  <button onClick={() => handleLoad(t)}
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
                    Indlæs
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SectionList (hoved-eksport) ──────────────────────────────────────────────

export function SectionList({ training, canEdit, onUpdate, onInstantSave }: {
  training: Training;
  canEdit: boolean;
  onUpdate: (patch: Partial<Training>) => void;
  onInstantSave: (patch: Partial<Training>) => void;
}) {
  const [sectionTypes, setSectionTypes] = useState<SectionType[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
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
    updateSections([...sections, { id: uid(), type: st.id, mins: 15, exercises: [] }]);
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

  // Straks-gem ved afkrydsning (ingen debounce)
  function toggleDone(sectionIdx: number, exerciseIdx: number) {
    const updated = sections.map((sec, si) => {
      if (si !== sectionIdx) return sec;
      return {
        ...sec,
        exercises: sec.exercises.map((ex, ei) =>
          ei !== exerciseIdx ? ex : { ...ex, done: !ex.done }
        ),
      };
    });
    onInstantSave({ sections: updated });
  }

  // Nulstil alle afkrydsninger
  function resetDone() {
    const anyDone = sections.some(s => s.exercises.some(e => e.done));
    if (!anyDone) return;
    const updated = sections.map(sec => ({
      ...sec,
      exercises: sec.exercises.map(ex => ({ ...ex, done: false })),
    }));
    onInstantSave({ sections: updated });
  }

  const anyDone = sections.some(s => s.exercises.some(e => e.done));

  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      overflow: 'hidden',
    }}>
      {/* Card-header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, flex: 1 }}>
          Sektioner & øvelser
        </span>

        {/* Nulstil afkrydsninger */}
        {anyDone && (
          <button onClick={resetDone} title="Nulstil alle afkrydsninger" style={{ ...btnGhost, padding: '5px 10px', fontSize: 13 }}>
            ↺ Nulstil
          </button>
        )}

        {/* Indlæs skabelon */}
        <button onClick={() => setShowLoadTemplate(true)} title="Indlæs skabelon" style={{ ...btnGhost, padding: '5px 10px' }}>📋</button>

        {/* AI hele træning — disabled til Session 5 */}
        <button
          disabled
          title="AI-forslag til hele træning (Session 5)"
          style={{
            ...btnGhost,
            border: '1px solid #7c3aed', color: '#7c3aed',
            opacity: 0.45, cursor: 'not-allowed', padding: '5px 12px',
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
        ) : sections.map((sec, idx) => {
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
              teamId={teamId}
              onUpdate={patch => updateSection(idx, patch)}
              onRemove={() => removeSection(idx)}
              onMoveUp={() => moveSection(idx, -1)}
              onMoveDown={() => moveSection(idx, 1)}
              onToggleDone={exIdx => toggleDone(idx, exIdx)}
            />
          );
        })}
      </div>

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
          hasSections={sections.length > 0}
          onLoad={secs => updateSections(secs)}
          onClose={() => setShowLoadTemplate(false)}
        />
      )}
    </div>
  );
}
