import { useState, useEffect, useCallback } from 'react';
import { api, type AISuggestResultSection } from '../lib/api';
import { ExerciseResultRow } from './ExerciseResultRow';
import type { Section, SectionExercise, SectionType, Training } from '../lib/types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface AISectionModalProps {
  section: Section;
  sectionIndex: number;
  training: Training;
  teamId: string;
  sectionTypes: SectionType[];
  onAccept(exercises: SectionExercise[]): void;
  onClose(): void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'loading' | 'result' | 'error';

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function AISectionModal({
  section,
  training,
  teamId,
  sectionTypes,
  onAccept,
  onClose,
}: AISectionModalProps) {
  const [step, setStep] = useState<Step>('loading');
  const [result, setResult] = useState<AISuggestResultSection | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const sectionType = sectionTypes.find(st => st.id === section.type);

  // ── Kald AI ────────────────────────────────────────────────────────────────

  const fetchSuggestion = useCallback(async () => {
    setStep('loading');
    try {
      const res = await api.suggestTraining({
        team_id: teamId,
        sections: [{ type: section.type, mins: section.mins }],
        themes: training.themes,
        vary: true,
        single_section: true,
      });
      setResult(res[0] ?? null);
      setStep('result');
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'AI-forslag fejlede');
      setStep('error');
    }
  }, [teamId, section.type, section.mins, training.themes]);

  useEffect(() => {
    fetchSuggestion();
  }, [fetchSuggestion]);

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
          width: '100%', maxWidth: 560,
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
            color: sectionType?.color ?? 'var(--text)',
          }}>
            ✨ Forslag til {sectionType?.label ?? section.type}
          </h2>
        </div>

        {/* ── Step: loading ─────────────────────────────────────────────────── */}
        {step === 'loading' && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            minHeight: 200, gap: 16, padding: '24px',
          }}>
            <div style={{ fontSize: 48, animation: 'pulse 1.5s ease-in-out infinite' }}>
              ✨
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                AI finder øvelser til {sectionType?.label ?? section.type}…
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
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
              {result.exercises.length} øvelser ·{' '}
              {result.exercises.reduce((s, e) => s + e.mins, 0)} min planlagt
              af {section.mins} min
            </div>

            {/* Øvelsesliste */}
            {result.exercises.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>Ingen øvelser</p>
            ) : (
              result.exercises.map((ex, i) => (
                <ExerciseResultRow
                  key={i}
                  exerciseId={ex.exerciseId}
                  mins={ex.mins}
                  teamId={teamId}
                />
              ))
            )}
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
          borderTop: step !== 'loading' ? '1px solid var(--border)' : 'none',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0,
        }}>
          {step === 'result' && (
            <>
              <button
                onClick={onClose}
                style={{
                  padding: '9px 16px', borderRadius: 8, fontSize: 14,
                  background: 'var(--bg-input)', color: 'var(--text)',
                  border: '1px solid var(--border2)', cursor: 'pointer', minHeight: 44,
                }}
              >
                Annuller
              </button>
              <button
                onClick={fetchSuggestion}
                style={{
                  padding: '9px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                  background: 'none', color: '#7c3aed',
                  border: '1px solid #7c3aed', cursor: 'pointer', minHeight: 44,
                }}
              >
                ✨ Nyt forslag
              </button>
              <button
                onClick={() => {
                  if (result) onAccept(result.exercises.map(e => ({
                    exerciseId: e.exerciseId,
                    mins: e.mins,
                    done: false,
                  })));
                }}
                style={{
                  padding: '11px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
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
                  padding: '9px 16px', borderRadius: 8, fontSize: 14,
                  background: 'var(--bg-input)', color: 'var(--text)',
                  border: '1px solid var(--border2)', cursor: 'pointer', minHeight: 44,
                }}
              >
                Luk
              </button>
              <button
                onClick={fetchSuggestion}
                style={{
                  padding: '9px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                  background: 'var(--bg-input)', color: 'var(--text)',
                  border: '1px solid var(--border2)', cursor: 'pointer', minHeight: 44,
                }}
              >
                ↩ Prøv igen
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
