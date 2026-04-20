/**
 * SectionList — sektioner og øvelser i trænings-editoren.
 * Session 3 — fuldt implementeret.
 */

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { Section, SectionExercise, SectionType, Exercise, Training } from '../lib/types';
import { ExerciseEditor } from '../pages/Catalog';
import type { Exercise as CatalogExercise } from '../pages/Catalog';

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
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.45)',
    }} onClick={onClose}>
      <div className="modal-sheet" style={{
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
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.4)',
    }} onClick={onClose}>
      <div className="modal-sheet" style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22 }}>Tilføj sektion</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, color: 'var(--text2)', padding: '4px 8px', lineHeight: 1, minHeight: 44, display: 'flex', alignItems: 'center' }}>×</button>
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

function FreeExerciseModal({ initialName = '', onAddFree, onAddCatalog, onClose }: {
  initialName?: string;
  onAddFree: (name: string) => void;
  onAddCatalog: (ex: Exercise) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [showCatalogEditor, setShowCatalogEditor] = useState(false);

  // Blank øvelse til katalogeditor
  const blankExercise: CatalogExercise = {
    id: '', name: name.trim(), description: '', catalog: 'hal',
    tags: [], age_groups: [], stars: 0,
    variants: null, link: null, default_mins: null,
    image_r2_key: null, created_by: null, created_by_email: null, created_at: null,
  };

  if (showCatalogEditor) {
    return (
      <ExerciseEditor
        ex={{ ...blankExercise, name: name.trim() }}
        isNew
        zIndex={600}
        onSaved={(saved) => {
          // Konvertér CatalogExercise → SectionList Exercise og tilføj til sektion
          onAddCatalog({
            id: saved.id,
            name: saved.name,
            description: saved.description ?? undefined,
            catalog: saved.catalog as 'hal' | 'fys',
            tags: saved.tags,
            age_groups: saved.age_groups,
            stars: saved.stars,
            variants: saved.variants ?? undefined,
            link: saved.link ?? undefined,
            default_mins: saved.default_mins ?? undefined,
            image_url: undefined,
            image_r2_key: saved.image_r2_key ?? undefined,
            created_at: saved.created_at ?? '',
            updated_at: '',
          });
          onClose();
        }}
        onDeleted={() => onClose()}
        onClose={() => setShowCatalogEditor(false)}
      />
    );
  }

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.45)',
    }} onClick={onClose}>
      <div className="modal-sheet" style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 380, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--font-heading)', fontSize: 20, textTransform: 'uppercase' }}>
          Tilføj øvelse
        </h2>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onAddFree(name.trim()); onClose(); } }}
          placeholder="Navn på øvelse…"
          style={{ ...inputSm, fontSize: 15, marginBottom: 14, minHeight: 42 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ ...btnGhost, padding: '7px 12px', whiteSpace: 'nowrap' }}>Annuller</button>
          <button
            onClick={() => { if (name.trim()) { onAddFree(name.trim()); onClose(); } }}
            disabled={!name.trim()}
            style={{
              flex: 1, background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '7px 10px', fontSize: 13, cursor: name.trim() ? 'pointer' : 'not-allowed',
              opacity: name.trim() ? 1 : 0.4, whiteSpace: 'nowrap',
            }}
          >Opret fritekst</button>
          <button
            onClick={() => { if (name.trim()) setShowCatalogEditor(true); }}
            disabled={!name.trim()}
            style={{
              flex: 1, background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '7px 10px', fontSize: 13, fontWeight: 600,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
              opacity: name.trim() ? 1 : 0.4, whiteSpace: 'nowrap',
            }}
          >Opret i katalog</button>
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
  const [viewportH, setViewportH] = useState(window.visualViewport?.height ?? window.innerHeight);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Fix 1 — forsinket autoFocus: vent til bottom sheet animation er færdig
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Fix 4 — visualViewport højde
  // Fix 2 + 3 — scroll modal op og beregn tastaturhøjde
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handler = () => {
      setViewportH(vv.height);

      // Fix 3 — beregn tastaturhøjde og løft modalen
      if (window.innerWidth <= 640) {
        const kbHeight = window.innerHeight - vv.height - vv.offsetTop;
        setKeyboardHeight(Math.max(0, kbHeight));
      }

      // Fix 2 — scroll modal til toppen så søgefeltet er synligt
      if (window.innerWidth <= 640) {
        modalRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);

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

  // Fix 2 — scroll til top når filter ændres
  useEffect(() => {
    resultsRef.current?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [filtered.length, search, activeTags.join(',')]);

  function toggleTag(tag: string) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'flex-end',
      }} onClick={onClose}>
          {/* Fix 3+4 — brug visualViewport-højde + løft modalen over tastatur */}
        <div
          ref={modalRef}
          style={{
            background: 'var(--bg)',
            borderRadius: '16px 16px 0 0',
            width: '100%',
            maxHeight: `${viewportH * 0.92}px`,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            ...(keyboardHeight > 0
              ? { marginBottom: keyboardHeight, transition: 'margin-bottom 0.25s ease' }
              : { transition: 'margin-bottom 0.25s ease' }
            ),
          }}
          onClick={e => e.stopPropagation()}
        >

          {/* Fix 1 — fast header: aldrig scrollet væk */}
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: '16px 16px 0 0',
            padding: '12px 16px 12px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border2)', margin: '0 auto 14px' }} />

            {/* Titel + luk */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 20, color: sectionType.color }}>
                Tilføj øvelse — {sectionType.label}
              </h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, color: 'var(--text2)', padding: '4px 8px', lineHeight: 1, minHeight: 44, display: 'flex', alignItems: 'center' }}>×</button>
            </div>

            {/* Fix 1+3 — søgefelt: ingen autoFocus (bruger forsinket focus via ref) */}
            <input
              ref={searchInputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Søg øvelse…"
              style={{ ...inputSm, marginBottom: 8, fontSize: 16, padding: '10px 12px', minHeight: 44 }}
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

          {/* Fix 1 + 5 — scrollbar resultatliste med safe-area padding i bunden */}
          <div
            ref={resultsRef}
            style={{
              overflowY: 'auto',
              flex: 1,
              minHeight: 160,
              WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
            }}
          >
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>
                  Ingen øvelser fundet
                </div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                  Prøv en anden søgning eller tilføj en fri øvelse nedenfor.
                </div>
              </div>
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
                  paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
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
          initialName={search}
          onAddFree={name => {
            onPick({ id: '', name, default_mins: 5 } as Exercise);
            setShowFree(false);
          }}
          onAddCatalog={ex => {
            onPick(ex);
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
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.45)',
    }} onClick={onClose}>
      <div className="modal-sheet" style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 380, maxHeight: '80vh', overflowY: 'auto',
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
  onUpdate, onRemove, onMoveUp, onMoveDown, onToggleDone, onToast, onAISuggest,
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
  onToast: (msg: string) => void;
  onAISuggest?: () => void;
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
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '9px 10px 9px 13px', background: 'var(--bg-input)',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          flexWrap: 'nowrap',
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

        {/* Label — kan bre op på flere linjer */}
        <span style={{
          fontFamily: 'var(--font-heading)', fontSize: 13, fontWeight: 700,
          letterSpacing: '0.07em', textTransform: 'uppercase',
          color, flex: 1, minWidth: 0, wordBreak: 'break-word',
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
            {allDone ? '✓' : `${doneCount}/${total}`}
          </span>
        )}

        {/* Gruppe-badge — altid synlig, viser '–' hvis ingen gruppe */}
        {canEdit && (
          <span style={{
            fontSize: 11, fontWeight: 700, flexShrink: 0,
            background: groupStyle ? groupStyle.bg : 'var(--bg-input)',
            color: groupStyle ? groupStyle.text : 'var(--text3)',
            border: groupStyle ? 'none' : '1px solid var(--border2)',
            borderRadius: 4, padding: '1px 6px',
          }}>
            {section.group ?? '–'}
          </span>
        )}
        {!canEdit && section.group && groupStyle && (
          <span style={{
            fontSize: 11, fontWeight: 700, flexShrink: 0,
            background: groupStyle.bg, color: groupStyle.text,
            borderRadius: 4, padding: '1px 6px',
          }}>Gr. {section.group}</span>
        )}

        {/* Collapsed: vis antal + tid */}
        {collapsed && (
          <span style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>
            {total > 0 ? `${total} øv · ` : ''}{section.mins} min
          </span>
        )}

        {/* Ikke collapsed: mins + slet — gruppe er rykket til body */}
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {/* Minutter */}
            {canEdit ? (
              <input
                type="number"
                value={section.mins || ''}
                onChange={e => onUpdate({ mins: Number(e.target.value) || 0 })}
                min={1} max={240}
                style={{ ...inputSm, width: 44, textAlign: 'center', padding: '3px 4px', fontSize: 15, fontWeight: 700 }}
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 700, color }}>{section.mins}</span>
            )}
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>min</span>

            {/* Slet sektion — altid synlig, flexShrink: 0 */}
            {canEdit && (
              <button onClick={onRemove} style={{ ...btnGhost, padding: '4px 8px', color: 'var(--red)', fontSize: 15, flexShrink: 0 }}>✕</button>
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

          {/* Gruppe + AI + Øvelse + skabelon — samme række */}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <select
                value={section.group ?? ''}
                onChange={e => onUpdate({ group: e.target.value || undefined })}
                title="Gruppe"
                style={{ ...inputSm, width: 'auto', fontSize: 13, padding: '5px 8px', minHeight: 'auto', flexShrink: 0 }}
              >
                <option value="">–</option>
                {GROUP_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button
                title="AI-forslag til denne sektion"
                style={{ ...btnGhost, border: '1px solid #7c3aed', color: '#7c3aed', padding: '5px 10px', fontSize: 13, flex: 1 }}
                onClick={e => { e.stopPropagation(); onAISuggest?.(); }}
              >✨</button>
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
          sectionTypeLabel={sectionType.label}
          exerciseCount={exList.length}
          exerciseDefs={exercises}
          onLoad={exs => {
            onUpdate({ exercises: exs });
            onToast('Skabelon indlæst ✓');
          }}
          onClose={() => setShowLoadSection(false)}
        />
      )}
    </div>
  );
}

// ─── LoadTemplateModal (fuld træning) ────────────────────────────────────────

function LoadTemplateModal({ teamId, sectionCount, onLoad, onClose }: {
  teamId: string;
  sectionCount: number;
  onLoad: (sections: Section[]) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<import('../lib/types').Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.fetchTemplates(teamId, { type: 'training' })
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, [teamId]);

  async function handleDelete(id: string) {
    if (!confirm('Slet skabelon?')) return;
    await api.deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function handleLoad(t: import('../lib/types').Template) {
    const clean = t.sections.map(s => ({
      ...s, id: uid(),
      exercises: (s.exercises ?? []).map(e => ({ ...e, done: false })),
    }));
    onLoad(clean);
    onClose();
  }

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.4)',
    }} onClick={onClose}>
      <div className="modal-sheet" style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 480, maxHeight: '82vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22 }}>Indlæs træningsskabelon</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, color: 'var(--text2)', padding: '4px 8px', lineHeight: 1, minHeight: 44, display: 'flex', alignItems: 'center' }}>×</button>
        </div>

        {/* Advarsel */}
        {sectionCount > 0 && (
          <div style={{
            background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
            padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#78350f',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <span>⚠</span>
            <span>Dette erstatter dine nuværende {sectionCount} sektion{sectionCount !== 1 ? 'er' : ''}.</span>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Indlæser…</p>
        ) : templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Ingen træningsskabeloner endnu</div>
            <div style={{ fontSize: 13 }}>Gem en træning som skabelon via 💾 i toolbar.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(t => {
              const totalEx = t.sections.reduce((s, sec) => s + (sec.exercises?.length ?? 0), 0);
              return (
                <div
                  key={t.id}
                  onClick={() => handleLoad(t)}
                  style={{
                    padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 10,
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-light)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Navn */}
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{t.name}</div>

                      {/* Beskrivelse */}
                      {t.description && (
                        <div style={{
                          fontSize: 13, color: 'var(--text2)', marginBottom: 6,
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        }}>{t.description}</div>
                      )}

                      {/* Temaer */}
                      {t.themes && t.themes.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                          {t.themes.map(th => (
                            <span key={th} style={{
                              fontSize: 11, fontWeight: 500,
                              background: 'var(--accent-light)', color: 'var(--accent)',
                              borderRadius: 20, padding: '2px 8px',
                            }}>{th}</span>
                          ))}
                        </div>
                      )}

                      {/* Tæller */}
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                        {t.sections?.length ?? 0} sektioner · {totalEx} øvelser
                      </div>
                    </div>

                    {/* Slet */}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                      style={{ ...btnGhost, padding: '4px 8px', color: 'var(--red)', fontSize: 14, flexShrink: 0 }}
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LoadSectionTemplateModal ─────────────────────────────────────────────────

function LoadSectionTemplateModal({ teamId, sectionTypeId, sectionTypeLabel, exerciseCount, exerciseDefs, onLoad, onClose }: {
  teamId: string;
  sectionTypeId: string;
  sectionTypeLabel: string;
  exerciseCount: number;
  exerciseDefs: Exercise[];
  onLoad: (exercises: SectionExercise[]) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<import('../lib/types').Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    api.fetchTemplates(teamId, { type: 'section', section_type: sectionTypeId })
      .then(setTemplates)
      .finally(() => setLoading(false));
  }, [teamId, sectionTypeId]);

  async function handleDelete(id: string) {
    if (!confirm('Slet skabelon?')) return;
    await api.deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function handleLoad(tmpl: import('../lib/types').Template) {
    const raw = tmpl.sections[0];
    if (!raw) return;
    const exercises = raw.exercises.map(e => ({ ...e, done: false }));
    onLoad(exercises);
    onClose();
  }

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.45)',
    }} onClick={onClose}>
      <div className="modal-sheet" style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 20 }}>Indlæs øvelser fra skabelon</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, color: 'var(--text2)', padding: '4px 8px', lineHeight: 1, minHeight: 44, display: 'flex', alignItems: 'center' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Viser skabeloner for <strong>{sectionTypeLabel}</strong>
        </div>

        {/* Advarsel */}
        {exerciseCount > 0 && (
          <div style={{
            background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
            padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#78350f',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <span>⚠</span>
            <span>Dette erstatter sektionens nuværende {exerciseCount} øvelse{exerciseCount !== 1 ? 'r' : ''}.</span>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text3)', fontSize: 14 }}>Indlæser…</p>
        ) : templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Ingen skabeloner for {sectionTypeLabel} endnu
            </div>
            <div style={{ fontSize: 13 }}>Gem en sektion som skabelon fra trænings-editoren.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.map(t => {
              const sec = t.sections[0];
              const exList = sec?.exercises ?? [];
              const isExpanded = expandedId === t.id;
              const MAX_SHOW = 8;
              return (
                <div
                  key={t.id}
                  onClick={() => handleLoad(t)}
                  style={{
                    padding: '12px 14px', background: 'var(--bg-input)', borderRadius: 10,
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-light)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-input)')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Navn */}
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{t.name}</div>

                      {/* Beskrivelse */}
                      {t.description && (
                        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>{t.description}</div>
                      )}

                      {/* Temaer */}
                      {t.themes && t.themes.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                          {t.themes.map(th => (
                            <span key={th} style={{
                              fontSize: 11, fontWeight: 500,
                              background: 'var(--accent-light)', color: 'var(--accent)',
                              borderRadius: 20, padding: '2px 8px',
                            }}>{th}</span>
                          ))}
                        </div>
                      )}

                      {/* Tæller + fold-toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                          {exList.length} øvelse{exList.length !== 1 ? 'r' : ''} · {sec?.mins ?? 0} min
                        </span>
                        {exList.length > 0 && (
                          <button
                            onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : t.id); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text2)', padding: '0 4px' }}
                          >{isExpanded ? '▾ Skjul' : '▸ Se øvelser'}</button>
                        )}
                      </div>

                      {/* Foldbar øvelseliste */}
                      {isExpanded && (
                        <div style={{ marginTop: 8, paddingLeft: 4 }} onClick={e => e.stopPropagation()}>
                          {exList.slice(0, MAX_SHOW).map((ex, i) => {
                            const defName = ex.id ? exerciseDefs.find(e => e.id === ex.id)?.name : undefined;
                            const displayName = ex.customName ?? defName ?? ex.id ?? '—';
                            return (
                              <div key={i} style={{ fontSize: 13, color: 'var(--text2)', padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                                {displayName}{ex.mins ? ` · ${ex.mins} min` : ''}
                              </div>
                            );
                          })}
                          {exList.length > MAX_SHOW && (
                            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>+ {exList.length - MAX_SHOW} flere</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Slet */}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
                      style={{ ...btnGhost, padding: '4px 8px', color: 'var(--red)', fontSize: 14, flexShrink: 0 }}
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SectionList (hoved-eksport) ──────────────────────────────────────────────

// ─── Mini-toast ───────────────────────────────────────────────────────────────
function MiniToast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      zIndex: 700, padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
      background: 'var(--green)', color: '#fff',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)', pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}>{message}</div>
  );
}

export function SectionList({ training, canEdit, onUpdate, onInstantSave, onAIWholeTraining, onAISectionIndex }: {
  training: Training;
  canEdit: boolean;
  onUpdate: (patch: Partial<Training>) => void;
  onInstantSave: (patch: Partial<Training>) => void;
  onAIWholeTraining?: () => void;
  onAISectionIndex?: (idx: number) => void;
}) {
  const [sectionTypes, setSectionTypes] = useState<SectionType[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showLoadTemplate, setShowLoadTemplate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
    setToast('Afkrydsninger nulstillet ✓');
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

        {/* AI hele træning */}
        <button
          title="AI-forslag til hele træning"
          style={{ ...btnGhost, border: '1px solid #7c3aed', color: '#7c3aed', padding: '5px 12px' }}
          onClick={onAIWholeTraining}
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
              onToast={setToast}
              onAISuggest={onAISectionIndex ? () => onAISectionIndex(idx) : undefined}
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
          sectionCount={sections.length}
          onLoad={secs => {
            updateSections(secs);
            setToast('Skabelon indlæst ✓');
          }}
          onClose={() => setShowLoadTemplate(false)}
        />
      )}

      {toast && <MiniToast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
