/**
 * SaveTemplateModal — gem fuld træning eller enkelt sektion som skabelon.
 * Åbnes fra "💾 Skabelon"-knap i TrainingEditor toolbar.
 */

import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import type { Training, SectionType } from '../lib/types';

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  borderRadius: 8, padding: '9px 16px', fontSize: 15, color: 'var(--text)',
  minHeight: 40, width: '100%', boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle, minHeight: 60, resize: 'vertical', fontFamily: 'inherit',
};

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))',
      left: '50%', transform: 'translateX(-50%)',
      background: 'var(--text)', color: '#fff',
      padding: '10px 20px', borderRadius: 20,
      fontSize: 14, fontWeight: 500, zIndex: 9999,
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      whiteSpace: 'nowrap',
    }}>{msg}</div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  training: Training;
  teamId: string;
  sectionTypes: SectionType[];
  onSaved(): void;
  onClose(): void;
}

// ─── Hjælpefunktion ──────────────────────────────────────────────────────────

function totalExercises(training: Training) {
  return training.sections.reduce((s, sec) => s + sec.exercises.length, 0);
}

// ─── Hoved-komponent ─────────────────────────────────────────────────────────

export default function SaveTemplateModal({ training, teamId, sectionTypes, onSaved, onClose }: Props) {
  const [templateType, setTemplateType] = useState<'training' | 'section'>('training');
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [themes, setThemes] = useState<string[]>([]);
  const [allThemes, setAllThemes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  // Hent årshjul-temaer
  useEffect(() => {
    api.fetchQuarters(teamId).then(quarters => {
      const unique = Array.from(new Set(quarters.flatMap(q => q.themes ?? [])));
      setAllThemes(unique);
    }).catch(() => {});
  }, [teamId]);

  // Auto-fokus navn ved åbning
  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 80);
  }, []);

  // Når sektion vælges: auto-udfyld navn
  useEffect(() => {
    if (templateType !== 'section' || selectedSectionIndex === null) return;
    const sec = training.sections[selectedSectionIndex];
    if (!sec) return;
    const st = sectionTypes.find(s => s.id === sec.type);
    const label = st?.label ?? sec.type;
    // Tilføj årstema hvis træning har temaer
    const firstTheme = training.themes?.[0];
    setName(firstTheme ? `${label} – ${firstTheme}` : label);
  }, [selectedSectionIndex, templateType, training.sections, training.themes, sectionTypes]);

  // Reset sektion-valg når tab skifter
  function switchTab(t: 'training' | 'section') {
    setTemplateType(t);
    setSelectedSectionIndex(null);
    setName('');
    setDescription('');
    setThemes([]);
    setTimeout(() => nameRef.current?.focus(), 80);
  }

  function toggleTheme(th: string) {
    setThemes(prev => prev.includes(th) ? prev.filter(x => x !== th) : [...prev, th]);
  }

  // ── Label for sektionstype ──
  function sectionTypeLabel(typeId: string) {
    return sectionTypes.find(s => s.id === typeId)?.label ?? typeId;
  }

  function sectionTypeColor(typeId: string) {
    return sectionTypes.find(s => s.id === typeId)?.color ?? '#888';
  }

  // ── Gem ──
  async function handleSave() {
    if (!name.trim()) return;
    if (templateType === 'section' && selectedSectionIndex === null) return;
    setSaving(true);
    try {
      if (templateType === 'training') {
        await api.createTemplate({
          team_id: teamId,
          type: 'training',
          name: name.trim(),
          description: description.trim() || undefined,
          themes,
          sections: training.sections.map(sec => ({
            ...sec,
            id: crypto.randomUUID(),
            exercises: sec.exercises.map(ex => ({ ...ex, done: false })),
          })),
        });
      } else {
        const sec = training.sections[selectedSectionIndex!];
        await api.createTemplate({
          team_id: teamId,
          type: 'section',
          section_type: sec.type,
          name: name.trim(),
          description: description.trim() || undefined,
          themes,
          sections: [{
            ...sec,
            id: crypto.randomUUID(),
            exercises: sec.exercises.map(ex => ({ ...ex, done: false })),
          }],
        });
      }
      setToast('Skabelon gemt ✓');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 800);
    } catch {
      setToast('Fejl ved gem — prøv igen');
      setTimeout(() => setToast(''), 2000);
    } finally {
      setSaving(false);
    }
  }

  // ── Hjælper: section preview tekst ──
  function sectionPreviewExercises(sectionIdx: number) {
    const sec = training.sections[sectionIdx];
    if (!sec) return [];
    return sec.exercises.map(ex => ex.customName ?? ex.id ?? '?');
  }

  const canSave = name.trim().length > 0 &&
    (templateType === 'training' || selectedSectionIndex !== null);

  const selectedSec = selectedSectionIndex !== null ? training.sections[selectedSectionIndex] : null;

  return (
    <>
      {/* Overlay + modal i ét flex-element */}
      <div
        className="modal-overlay"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 500 }}
      >

      {/* Modal */}
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{
        width: 'min(520px, 95vw)',
        maxHeight: '88vh',
        overflowY: 'auto',
        background: 'var(--bg-card)',
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
        zIndex: 600,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 0',
          borderBottom: '1px solid var(--border)',
          paddingBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 20, textTransform: 'uppercase',
            }}>
              Gem skabelon
            </h2>
            <button onClick={onClose} style={{ background: 'none', fontSize: 22, color: 'var(--text3)', cursor: 'pointer', padding: 4 }}>✕</button>
          </div>

          {/* Tab-vælger */}
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg-input)', borderRadius: 10, padding: 4 }}>
            {(['training', 'section'] as const).map(t => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 14, fontWeight: 500,
                  cursor: 'pointer',
                  background: templateType === t ? 'var(--bg-card)' : 'transparent',
                  color: templateType === t ? 'var(--accent)' : 'var(--text2)',
                  boxShadow: templateType === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  border: 'none',
                  transition: 'all 0.15s',
                }}
              >
                {t === 'training' ? 'Fuld træning' : 'Enkelt sektion'}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ── Sektion-vælger (kun ved type='section') ── */}
          {templateType === 'section' && (
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Vælg sektion
              </label>
              {training.sections.length === 0 ? (
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text3)' }}>Ingen sektioner i denne træning.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {training.sections.map((sec, idx) => {
                    const color = sectionTypeColor(sec.type);
                    const label = sectionTypeLabel(sec.type);
                    const isSelected = selectedSectionIndex === idx;
                    return (
                      <button
                        key={sec.id}
                        onClick={() => setSelectedSectionIndex(idx)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '11px 20px',
                          borderRadius: 10,
                          border: isSelected ? `2px solid ${color}` : '2px solid var(--border)',
                          background: isSelected ? `rgba(${hexToRgb(color)},0.06)` : 'var(--bg-input)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                      >
                        <div style={{ width: 4, minHeight: 36, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: isSelected ? color : 'var(--text)' }}>{label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                            {sec.exercises.length} øvelse{sec.exercises.length !== 1 ? 'r' : ''} · {sec.mins} min
                            {sec.group ? ` · Gruppe ${sec.group}` : ''}
                          </div>
                        </div>
                        {isSelected && (
                          <span style={{ fontSize: 16, color }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Vis resten kun hvis: training ELLER sektion valgt ── */}
          {(templateType === 'training' || selectedSectionIndex !== null) && (
            <>
              {/* Navn */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  Navn
                </label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={templateType === 'training' ? 'fx Standard tirsdagstræning' : 'fx Opvarmning med bold'}
                  style={inputStyle}
                  onKeyDown={e => e.key === 'Enter' && canSave && handleSave()}
                />
              </div>

              {/* Beskrivelse */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                  Beskrivelse <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text3)' }}>(valgfri)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={
                    templateType === 'training'
                      ? 'Kort beskrivelse af hvad træningen fokuserer på…'
                      : 'Beskriv hvad sektionen træner og hvornår den passer…'
                  }
                  style={textareaStyle}
                />
              </div>

              {/* Temaer */}
              {allThemes.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    Temaer
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    {allThemes.map(th => {
                      const active = themes.includes(th);
                      return (
                        <button
                          key={th}
                          onClick={() => toggleTheme(th)}
                          style={{
                            padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                            cursor: 'pointer', border: 'none',
                            background: active ? 'var(--accent)' : 'var(--bg-input)',
                            color: active ? '#fff' : 'var(--text2)',
                            transition: 'background 0.15s, color 0.15s',
                          }}
                        >
                          {th}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>
                    {templateType === 'training'
                      ? 'Hjælper med at finde skabelonen igen'
                      : 'Vælg de temaer denne sektion passer til'}
                  </p>
                </div>
              )}

              {/* Preview */}
              <div style={{
                background: 'var(--bg-input)', borderRadius: 10, padding: '12px 14px',
              }}>
                {templateType === 'training' ? (
                  <>
                    <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, marginBottom: 8 }}>
                      {training.sections.length} sektion{training.sections.length !== 1 ? 'er' : ''} · {totalExercises(training)} øvelse{totalExercises(training) !== 1 ? 'r' : ''} i alt
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {training.sections.map(sec => {
                        const color = sectionTypeColor(sec.type);
                        const label = sectionTypeLabel(sec.type);
                        return (
                          <div key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                            <span style={{ color: 'var(--text2)' }}>{label}</span>
                            <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>{sec.mins} min</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : selectedSec && (
                  <>
                    <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, marginBottom: 8 }}>
                      {selectedSec.exercises.length} øvelse{selectedSec.exercises.length !== 1 ? 'r' : ''} · {selectedSec.mins} min
                    </div>
                    {(() => {
                      const names = sectionPreviewExercises(selectedSectionIndex!);
                      const shown = names.slice(0, 5);
                      const rest = names.length - shown.length;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {shown.map((n, i) => (
                            <div key={i} style={{ fontSize: 13, color: 'var(--text2)' }}>· {n}</div>
                          ))}
                          {rest > 0 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>+ {rest} flere</div>}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </>
          )}

          {/* Hint hvis ingen sektion valgt endnu */}
          {templateType === 'section' && selectedSectionIndex === null && training.sections.length > 0 && (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text3)', textAlign: 'center' }}>
              Vælg en sektion ovenfor
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '11px 20px', borderRadius: 10, fontSize: 14, cursor: 'pointer',
              background: 'var(--bg-input)', border: '1px solid var(--border2)', color: 'var(--text)',
            }}
          >
            Annuller
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: canSave && !saving ? 'pointer' : 'not-allowed',
              background: canSave ? 'var(--accent)' : 'var(--bg-input)',
              color: canSave ? '#fff' : 'var(--text3)',
              border: 'none',
              opacity: saving ? 0.7 : 1,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {saving ? 'Gemmer…' : 'Gem skabelon'}
          </button>
        </div>
      </div>

      </div>

      {toast && <Toast msg={toast} />}
    </>
  );
}

// ─── Hjælper: hex → rgb ───────────────────────────────────────────────────────
function hexToRgb(hex: string): string {
  const h = (hex ?? '#888').replace('#', '').padEnd(6, '0');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `${r},${g},${b}`;
}
