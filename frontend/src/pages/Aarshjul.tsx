import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';

interface QuarterDB {
  id: string;
  team_id: string;
  quarter: number;
  themes: string[];
}

// Static quarter config — label/months/color/season are not stored in DB
const QUARTER_CONFIG = [
  { quarter: 1, label: 'Q1', months: 'Jan – Mar', color: '#f59e0b', season: 'Forår' },
  { quarter: 2, label: 'Q2a', months: 'Maj – Jun', color: '#22c55e', season: 'Sæsonstart' },
  { quarter: 3, label: 'Q3', months: 'Aug – Sep', color: '#3b82f6', season: 'Efterår' },
  { quarter: 4, label: 'Q4', months: 'Okt – Dec', color: '#8b5cf6', season: 'Vinter' },
  { quarter: 5, label: 'Q5', months: 'Apr', color: '#ec4899', season: 'Overgangsperiode' },
  { quarter: 6, label: 'Q2b', months: 'Maj – Jun', color: '#22c55e', season: 'Næste sæsonstart' },
];

interface QuarterState {
  quarter: number;
  themes: string[];
  dbId?: string;
  saving: boolean;
}

export default function Aarshjul() {
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canEdit = hasRole(user, 'team_manager', currentTeamRole);

  const [quarters, setQuarters] = useState<QuarterState[]>(
    QUARTER_CONFIG.map(q => ({ quarter: q.quarter, themes: [], saving: false }))
  );
  const [loading, setLoading] = useState(true);

  // debounce refs per quarter
  const debounceRefs = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!currentTeamId) return;
    setLoading(true);
    api.get<QuarterDB[]>(`/api/quarters?team_id=${currentTeamId}`)
      .then(data => {
        setQuarters(QUARTER_CONFIG.map(cfg => {
          const db = data.find(d => d.quarter === cfg.quarter);
          return {
            quarter: cfg.quarter,
            themes: db?.themes ?? [],
            dbId: db?.id,
            saving: false,
          };
        }));
      })
      .catch(() => {/* keep empty */})
      .finally(() => setLoading(false));
  }, [currentTeamId]);

  const saveQuarter = useCallback(async (q: QuarterState, themes: string[]) => {
    if (!currentTeamId) return;
    setQuarters(prev => prev.map(p => p.quarter === q.quarter ? { ...p, saving: true } : p));
    try {
      await api.put(`/api/quarters/${q.dbId ?? 'new'}`, {
        team_id: currentTeamId,
        quarter: q.quarter,
        themes,
      });
    } catch {/* ignore */} finally {
      setQuarters(prev => prev.map(p => p.quarter === q.quarter ? { ...p, saving: false } : p));
    }
  }, [currentTeamId]);

  function updateThemes(quarterNum: number, themes: string[]) {
    let currentQ: QuarterState | undefined;
    setQuarters(prev => {
      currentQ = prev.find(p => p.quarter === quarterNum);
      return prev.map(p => p.quarter === quarterNum ? { ...p, themes } : p);
    });
    if (!currentQ) return;
    const qSnap = currentQ;
    const existing = debounceRefs.current.get(quarterNum);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      saveQuarter(qSnap, themes);
    }, 800);
    debounceRefs.current.set(quarterNum, timer);
  }

  function addTheme(quarterNum: number) {
    const q = quarters.find(p => p.quarter === quarterNum);
    if (!q) return;
    updateThemes(quarterNum, [...q.themes, '']);
  }

  function updateTheme(quarterNum: number, idx: number, value: string) {
    const q = quarters.find(p => p.quarter === quarterNum);
    if (!q) return;
    updateThemes(quarterNum, q.themes.map((t, i) => i === idx ? value : t));
  }

  function removeTheme(quarterNum: number, idx: number) {
    const q = quarters.find(p => p.quarter === quarterNum);
    if (!q) return;
    updateThemes(quarterNum, q.themes.filter((_, i) => i !== idx));
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 20px' }}>Årshjul</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {QUARTER_CONFIG.map(q => (
            <div key={q.quarter} style={{
              background: 'var(--bg-card)', borderRadius: 12, padding: 20,
              borderLeft: `4px solid ${q.color}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ height: 20, width: 80, background: 'var(--bg-input)', borderRadius: 4, marginBottom: 8 }} />
              <div style={{ height: 14, width: 120, background: 'var(--bg-input)', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: 0 }}>Årshjul</h1>
        {!canEdit && (
          <span style={{ fontSize: 13, color: 'var(--text3)', background: 'var(--bg-input)', padding: '4px 10px', borderRadius: 20 }}>
            Kun visning
          </span>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 16,
      }} className="aarshjul-grid">
        {QUARTER_CONFIG.map(cfg => {
          const q = quarters.find(p => p.quarter === cfg.quarter)!;
          return (
            <QuarterCard
              key={cfg.quarter}
              config={cfg}
              state={q}
              canEdit={canEdit}
              onAddTheme={() => addTheme(cfg.quarter)}
              onUpdateTheme={(idx, val) => updateTheme(cfg.quarter, idx, val)}
              onRemoveTheme={(idx) => removeTheme(cfg.quarter, idx)}
            />
          );
        })}
      </div>

      <style>{`
        @media (max-width: 600px) {
          .aarshjul-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

interface QuarterCardProps {
  config: typeof QUARTER_CONFIG[number];
  state: QuarterState;
  canEdit: boolean;
  onAddTheme: () => void;
  onUpdateTheme: (idx: number, val: string) => void;
  onRemoveTheme: (idx: number) => void;
}

function QuarterCard({ config, state, canEdit, onAddTheme, onUpdateTheme, onRemoveTheme }: QuarterCardProps) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      borderRadius: 12,
      padding: 20,
      borderLeft: `4px solid ${config.color}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700,
              color: config.color,
            }}>{config.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#fff',
              background: config.color,
              padding: '2px 8px', borderRadius: 20,
              opacity: 0.9,
            }}>{config.season}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{config.months}</div>
        </div>
        {state?.saving && (
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Gemmer…</span>
        )}
      </div>

      {/* Themes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(!state?.themes?.length) && !canEdit && (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Ingen temaer endnu</div>
        )}
        {(state?.themes ?? []).map((theme, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {canEdit ? (
              <>
                <input
                  value={theme}
                  onChange={e => onUpdateTheme(idx, e.target.value)}
                  placeholder="Tema…"
                  style={{
                    flex: 1, padding: '6px 10px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border2)',
                    borderRadius: 8, fontSize: 14,
                    color: 'var(--text)',
                    minHeight: 36,
                  }}
                />
                <button
                  onClick={() => onRemoveTheme(idx)}
                  style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: 'rgba(220,38,38,0.08)',
                    color: 'var(--red)',
                    fontSize: 16, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  title="Fjern tema"
                >
                  ×
                </button>
              </>
            ) : (
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '4px 10px',
                background: `${config.color}18`,
                color: config.color,
                borderRadius: 20, fontSize: 13, fontWeight: 500,
                border: `1px solid ${config.color}30`,
              }}>
                {theme || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Tomt tema</span>}
              </span>
            )}
          </div>
        ))}

        {canEdit && (
          <button
            onClick={onAddTheme}
            style={{
              alignSelf: 'flex-start',
              marginTop: (state?.themes?.length ?? 0) > 0 ? 4 : 0,
              padding: '5px 12px',
              background: `${config.color}18`,
              color: config.color,
              borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px dashed ${config.color}50`,
              cursor: 'pointer',
            }}
          >
            + Tema
          </button>
        )}
      </div>
    </div>
  );
}
