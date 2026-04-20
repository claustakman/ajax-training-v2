import { useState } from 'react';
import { api, type AISuggestResultSection } from '../lib/api';
import { durMin } from '../lib/dateUtils';
import { ExerciseResultRow } from './ExerciseResultRow';
import type { Training, Section, SectionType } from '../lib/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AISuggestModalProps {
  training: Training;
  teamId: string;
  sectionTypes: SectionType[];
  onAccept(sections: Section[]): void;
  onClose(): void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'configure' | 'loading' | 'result' | 'error';


// ─── Hjælper: minsfarve ───────────────────────────────────────────────────────

function getMinsColor(planned: number, total: number | null) {
  if (!total || total === 0) return undefined;
  const ratio = planned / total;
  if (ratio < 0.9) return 'var(--blue)';
  if (ratio <= 1.1) return 'var(--green)';
  return 'var(--red)';
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function AISuggestModal({
  training,
  teamId,
  sectionTypes,
  onAccept,
  onClose,
}: AISuggestModalProps) {

  // ── Initialisér rows fra eksisterende sektioner ────────────────────────────
  // `locked` = true kun for required-sektioner der er auto-tilføjet (ikke redigerbare).
  // Manuelt tilføjede rækker er altid locked: false, uanset sektionstype.
  const initRows = (): Array<{ type: string; mins: number; locked: boolean }> => {
    if (training.sections.length > 0) {
      return training.sections.map(s => {
        const isRequired = sectionTypes.find(st => st.id === s.type)?.required === 1;
        return { type: s.type, mins: s.mins || 15, locked: isRequired };
      });
    }
    const first = sectionTypes.find(st => st.required !== 1);
    return [{ type: first?.id ?? sectionTypes[0]?.id ?? '', mins: 15, locked: false }];
  };

  const [step, setStep] = useState<Step>('configure');
  const [rows, setRows] = useState<Array<{ type: string; mins: number; locked: boolean }>>(initRows);
  const [vary, setVary] = useState(true);
  const [result, setResult] = useState<AISuggestResultSection[] | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ── Hjælpefunktioner til rows ──────────────────────────────────────────────

  function updateRow(index: number, field: 'type' | 'mins', value: string | number) {
    setRows(r => r.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  function removeRow(index: number) {
    setRows(r => r.filter((_, i) => i !== index));
  }

  // ── handleGenerate ─────────────────────────────────────────────────────────

  async function handleGenerate() {
    setStep('loading');
    try {
      const res = await api.suggestTraining({
        team_id: teamId,
        sections: rows,
        themes: training.themes,
        vary,
      });
      setResult(res);
      setStep('result');
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'AI-forslag fejlede');
      setStep('error');
    }
  }

  // ── handleAccept ───────────────────────────────────────────────────────────

  function handleAccept() {
    if (!result) return;
    const sections: Section[] = result.map(r => ({
      id: crypto.randomUUID(),
      type: r.type,
      mins: r.mins,
      exercises: r.exercises.map(e => ({
        exerciseId: e.exerciseId,
        mins: e.mins,
        done: false,
      })),
    }));
    onAccept(sections);
  }

  // ── Overskrift pr. step ────────────────────────────────────────────────────

  const title =
    step === 'result' ? 'Forslag til træning' :
    step === 'error'  ? 'AI-forslag fejlede' :
    '✨ AI-forslag til træning';

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="modal-sheet"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', borderRadius: 16,
          width: '100%', maxWidth: 640,
          maxHeight: '90dvh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <h2 style={{
            fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700,
            margin: 0, marginBottom: step === 'loading' ? 0 : 16,
          }}>
            {title}
          </h2>
        </div>

        {/* ── Step: configure ──────────────────────────────────────────────── */}
        {step === 'configure' && (
          <div style={{ padding: '0 24px', flex: 1, overflowY: 'auto' }}>

            {/* Sektioner */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>
                Sektioner
              </div>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {/* Farvet dot */}
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: sectionTypes.find(st => st.id === row.type)?.color ?? 'var(--border2)',
                  }} />

                  {/* Sektionstype select */}
                  <select
                    value={row.type}
                    disabled={row.locked}
                    onChange={e => updateRow(i, 'type', e.target.value)}
                    style={{
                      flex: 1, fontSize: 14, padding: '6px 8px',
                      background: 'var(--bg-input)', border: '1px solid var(--border2)',
                      borderRadius: 6, color: 'var(--text)',
                      opacity: row.locked ? 0.6 : 1,
                    }}
                  >
                    {sectionTypes.map(st => (
                      <option key={st.id} value={st.id}>{st.label}</option>
                    ))}
                  </select>

                  {/* Minutter */}
                  <input
                    type="number" min={5} max={60}
                    value={row.mins}
                    onChange={e => updateRow(i, 'mins', +e.target.value)}
                    style={{
                      width: 60, textAlign: 'center', fontSize: 14,
                      padding: '6px 4px',
                      background: 'var(--bg-input)', border: '1px solid var(--border2)',
                      borderRadius: 6, color: 'var(--text)',
                    }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>min</span>

                  {/* Slet */}
                  {!row.locked && (
                    <button
                      onClick={() => removeRow(i)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: 'var(--red)', fontSize: 16, padding: '0 4px',
                        flexShrink: 0, lineHeight: 1,
                      }}
                      aria-label="Fjern sektion"
                    >
                      ✕
                    </button>
                  )}

                  {/* Låst */}
                  {row.locked && (
                    <span style={{
                      fontSize: 11, color: 'var(--text3)', flexShrink: 0,
                      width: 24, textAlign: 'center',
                    }}>
                      🔒
                    </span>
                  )}
                </div>
              ))}

              <button
                onClick={() => setRows(r => [...r, { type: sectionTypes[0]?.id ?? '', mins: 15, locked: false }])}
                style={{
                  marginTop: 4, background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--accent)', fontSize: 13,
                  padding: '4px 0', fontWeight: 500,
                }}
              >
                + Tilføj sektion
              </button>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

            {/* Variation */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text2)' }}>
                Variation
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setVary(true)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: vary ? 'var(--accent)' : 'var(--bg-input)',
                    color: vary ? '#fff' : 'var(--text)',
                    border: `1px solid ${vary ? 'var(--accent)' : 'var(--border2)'}`,
                    cursor: 'pointer',
                  }}
                >
                  Varier øvelser
                </button>
                <button
                  onClick={() => setVary(false)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                    background: !vary ? 'var(--bg-input)' : 'var(--bg-input)',
                    color: !vary ? 'var(--text)' : 'var(--text2)',
                    border: `1px solid ${!vary ? 'var(--accent)' : 'var(--border2)'}`,
                    cursor: 'pointer',
                  }}
                >
                  Gentag gerne
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                {vary
                  ? 'AI undgår øvelser brugt i de seneste træninger'
                  : 'AI genbruger gerne øvelser fra seneste træninger'}
              </p>
            </div>

            {/* Temaer */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: 'var(--text2)' }}>
                Temaer fra træningen
              </div>
              {training.themes.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {training.themes.map(t => (
                    <span key={t} style={{
                      display: 'inline-block', padding: '2px 8px',
                      borderRadius: 12, fontSize: 12, fontWeight: 500,
                      background: 'var(--accent-light)', color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>
                  Ingen temaer valgt på træningen — vælg temaer i Oplysninger
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step: loading ─────────────────────────────────────────────────── */}
        {step === 'loading' && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: 240, gap: 16, padding: '24px',
          }}>
            <div style={{ fontSize: 48, animation: 'pulse 1.5s ease-in-out infinite' }}>
              ✨
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                AI sammensætter træning…
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                Dette tager typisk 5–15 sekunder
              </div>
            </div>
          </div>
        )}

        {/* ── Step: result ──────────────────────────────────────────────────── */}
        {step === 'result' && result && (
          <div style={{ padding: '0 24px', flex: 1, overflowY: 'auto' }}>
            {/* Summary */}
            {(() => {
              const totalMinsResult = result.reduce((sum, s) => sum + s.mins, 0);
              const trainingDur = durMin(training.start_time, training.end_time) ?? 0;
              const color = getMinsColor(totalMinsResult, trainingDur || null);
              return (
                <div style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: 'var(--bg-input)', fontSize: 13, marginBottom: 16,
                }}>
                  Planlagt:{' '}
                  <strong style={{ color: color ?? 'var(--text)' }}>
                    {totalMinsResult} min
                  </strong>
                  {trainingDur > 0 && (
                    <span style={{ color: 'var(--text2)' }}>
                      {' '}af {trainingDur} min træning
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Sektionsliste */}
            {result.map((sec, i) => {
              const sectionType = sectionTypes.find(st => st.id === sec.type);
              return (
                <div key={i} style={{
                  borderLeft: `3px solid ${sectionType?.color ?? 'var(--border2)'}`,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  marginBottom: 10,
                  overflow: 'hidden',
                }}>
                  {/* Header */}
                  <div style={{
                    padding: '8px 12px', background: 'var(--bg-input)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{
                      fontFamily: 'Barlow Condensed, sans-serif',
                      fontWeight: 700, fontSize: 13,
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      color: sectionType?.color ?? 'var(--text)',
                    }}>
                      {sectionType?.label ?? sec.type}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text2)' }}>
                      {sec.mins} min
                    </span>
                  </div>

                  {/* Øvelser */}
                  <div style={{ padding: '8px 12px' }}>
                    {sec.exercises.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Ingen øvelser</p>
                    ) : (
                      sec.exercises.map((ex, ei) => (
                        <ExerciseResultRow
                          key={ei}
                          exerciseId={ex.exerciseId}
                          mins={ex.mins}
                          teamId={teamId}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Step: error ───────────────────────────────────────────────────── */}
        {step === 'error' && (
          <div style={{ padding: '0 24px' }}>
            <div style={{
              padding: '12px 16px', borderRadius: 8,
              background: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.25)',
              color: 'var(--red)',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>AI-forslag fejlede</div>
              <div style={{ fontSize: 13 }}>{errorMessage}</div>
            </div>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0,
        }}>
          {step === 'configure' && (
            <>
              <button
                onClick={onClose}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 14,
                  background: 'var(--bg-input)', color: 'var(--text)',
                  border: '1px solid var(--border2)', cursor: 'pointer',
                  minHeight: 44,
                }}
              >
                Annuller
              </button>
              <button
                disabled={rows.length === 0}
                onClick={handleGenerate}
                style={{
                  padding: '9px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  background: '#7c3aed', color: '#fff',
                  border: '1px solid #7c3aed', cursor: rows.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: rows.length === 0 ? 0.5 : 1, minHeight: 44,
                }}
              >
                ✨ Generer forslag
              </button>
            </>
          )}

          {step === 'result' && (
            <>
              <button
                onClick={() => setStep('configure')}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 14,
                  background: 'var(--bg-input)', color: 'var(--text)',
                  border: '1px solid var(--border2)', cursor: 'pointer', minHeight: 44,
                }}
              >
                ← Tilpas
              </button>
              <button
                onClick={handleGenerate}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                  background: 'none', color: '#7c3aed',
                  border: '1px solid #7c3aed', cursor: 'pointer', minHeight: 44,
                }}
              >
                ✨ Nyt forslag
              </button>
              <button
                onClick={handleAccept}
                style={{
                  padding: '9px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                  background: 'var(--accent)', color: '#fff',
                  border: '1px solid var(--accent)', cursor: 'pointer', minHeight: 44,
                }}
              >
                Brug forslag
              </button>
            </>
          )}

          {step === 'error' && (
            <>
              <button
                onClick={onClose}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 14,
                  background: 'var(--bg-input)', color: 'var(--text)',
                  border: '1px solid var(--border2)', cursor: 'pointer', minHeight: 44,
                }}
              >
                Luk
              </button>
              <button
                onClick={() => setStep('configure')}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                  background: 'var(--bg-input)', color: 'var(--text)',
                  border: '1px solid var(--border2)', cursor: 'pointer', minHeight: 44,
                }}
              >
                ← Prøv igen
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
