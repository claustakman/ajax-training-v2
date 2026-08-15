import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { Training, Exercise } from '../lib/types';

const WEEKDAY_ORDER = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

function getWeekday(dateStr: string): string {
  const d = new Date(dateStr);
  return WEEKDAY_ORDER[(d.getDay() + 6) % 7];
}

// Dato-streng (YYYY-MM-DD) ≤ i dag
function isPast(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr) <= today;
}

export default function Statistik() {
  const { currentTeamId } = useAuth();
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagFilterOpen, setTagFilterOpen] = useState(false);

  const { data: activeTrainings = [], isLoading: loadingActive } = useQuery({
    queryKey: ['trainings', currentTeamId, 'active'],
    queryFn: () => api.fetchTrainings(currentTeamId!, 0),
    enabled: !!currentTeamId,
  });

  const { data: archivedTrainings = [], isLoading: loadingArchived } = useQuery({
    queryKey: ['trainings', currentTeamId, 'archived'],
    queryFn: () => api.fetchTrainings(currentTeamId!, 1),
    enabled: !!currentTeamId,
  });

  const { data: exercises = [] } = useQuery<Exercise[]>({
    queryKey: ['exercises', currentTeamId],
    queryFn: () => api.fetchExercises(),
    enabled: !!currentTeamId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = loadingActive || loadingArchived;

  // Kun afholdte træninger (dato sat + dato ≤ i dag)
  const allTrainings: Training[] = useMemo(
    () => [...activeTrainings, ...archivedTrainings].filter(t => t.date && isPast(t.date)),
    [activeTrainings, archivedTrainings]
  );

  const exerciseMap = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);

  const allExerciseTags = useMemo(() => {
    const s = new Set<string>();
    for (const e of exercises) for (const t of e.tags) s.add(t);
    return [...s].sort();
  }, [exercises]);

  // ── Beregninger ──────────────────────────────────────────────────────────────

  const totalCount = allTrainings.length;

  const avgTrainers = useMemo(() => {
    if (totalCount === 0) return 0;
    const sum = allTrainings.reduce((acc, t) => acc + (t.trainers?.length ?? 0), 0);
    return sum / totalCount;
  }, [allTrainings, totalCount]);

  const avgPlayers = useMemo(() => {
    const withData = allTrainings.filter(t => (t.participant_count ?? 0) > 0);
    if (withData.length === 0) return null;
    const sum = withData.reduce((acc, t) => acc + (t.participant_count ?? 0), 0);
    return sum / withData.length;
  }, [allTrainings]);

  // Tidsserie: træninger med deltagertal, sorteret kronologisk
  const playerTimeSeries = useMemo(() => {
    return allTrainings
      .filter(t => t.date && (t.participant_count ?? 0) > 0)
      .sort((a, b) => a.date!.localeCompare(b.date!))
      .map(t => ({ date: t.date!, count: t.participant_count! }));
  }, [allTrainings]);

  // Gennemsnitlig antal spillere per ugedag
  const playersByWeekday = useMemo(() => {
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const t of allTrainings) {
      if (!t.date || !((t.participant_count ?? 0) > 0)) continue;
      const day = getWeekday(t.date);
      sums[day] = (sums[day] ?? 0) + (t.participant_count ?? 0);
      counts[day] = (counts[day] ?? 0) + 1;
    }
    return WEEKDAY_ORDER
      .filter(day => counts[day] > 0)
      .map(day => ({ day, avg: sums[day] / counts[day], count: counts[day] }));
  }, [allTrainings]);

  // Gennemsnitlig antal trænere per ugedag
  const trainersByWeekday = useMemo(() => {
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const t of allTrainings) {
      if (!t.date) continue;
      const day = getWeekday(t.date);
      sums[day] = (sums[day] ?? 0) + (t.trainers?.length ?? 0);
      counts[day] = (counts[day] ?? 0) + 1;
    }
    return WEEKDAY_ORDER
      .filter(day => counts[day] > 0)
      .map(day => ({ day, avg: sums[day] / counts[day], count: counts[day] }));
  }, [allTrainings]);

  const leadTrainerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allTrainings) {
      if (t.lead_trainer) {
        counts[t.lead_trainer] = (counts[t.lead_trainer] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allTrainings]);

  const themeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allTrainings) {
      for (const theme of (t.themes ?? [])) {
        counts[theme] = (counts[theme] ?? 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allTrainings]);

  const exerciseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allTrainings) {
      for (const section of (t.sections ?? [])) {
        for (const ex of (section.exercises ?? [])) {
          if (!ex.id) continue;
          const exObj = exerciseMap.get(ex.id);
          if (!exObj) continue;
          if (tagFilter.length > 0 && !tagFilter.every(tag => exObj.tags.includes(tag))) continue;
          counts[ex.id] = (counts[ex.id] ?? 0) + 1;
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
  }, [allTrainings, exerciseMap, tagFilter]);

  const maxPlayers = Math.max(...playersByWeekday.map(r => r.avg), 1);
  const maxWeekday = Math.max(...trainersByWeekday.map(r => r.avg), 1);
  const maxLead = leadTrainerCounts[0]?.[1] ?? 1;
  const maxTheme = themeCounts[0]?.[1] ?? 1;
  const maxExercise = exerciseCounts[0]?.[1] ?? 1;

  if (isLoading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>
          Statistik
        </h1>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: 16 }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>
        Statistik
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 20px' }}>
        Kun afholdte træninger
      </p>

      {/* ── Counters ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {/* Række 1: Træninger i alt — fuld bredde */}
        <StatCard label="Træninger i alt" value={totalCount} fullWidth />
        {/* Række 2: de to gennemsnit side om side */}
        <div style={{ display: 'flex', gap: 12 }}>
          <StatCard label="Spillere pr. træning (gns.)" value={avgPlayers !== null ? avgPlayers.toFixed(1) : '–'} />
          <StatCard label="Trænere pr. træning (gns.)" value={avgTrainers.toFixed(1)} />
        </div>
      </div>

      {/* ── Spillere per ugedag ─────────────────────────────────────────────── */}
      <Section title="Gennemsnitlig antal spillere per ugedag">
        {playersByWeekday.length === 0 ? (
          <Empty text="Ingen spillerdata — synkronisér træningerne med Holdsport" />
        ) : (
          playersByWeekday.map(({ day, avg, count }) => (
            <BarFloat
              key={day}
              label={day}
              value={avg}
              max={maxPlayers}
              subtitle={`${count} træning${count !== 1 ? 'er' : ''}`}
              color="var(--blue)"
            />
          ))
        )}
      </Section>

      {/* ── Tidsserie: spillere ─────────────────────────────────────────────── */}
      <Section title="Spillere til træning over tid">
        {playerTimeSeries.length < 2 ? (
          <Empty text="Ikke nok data til at vise tidsserie — synkronisér træningerne med Holdsport" />
        ) : (
          <PlayerChart data={playerTimeSeries} avg={avgPlayers ?? 0} />
        )}
      </Section>

      {/* ── Trænere per ugedag ──────────────────────────────────────────────── */}
      <Section title="Gennemsnitlig antal trænere per ugedag">
        {trainersByWeekday.length === 0 ? (
          <Empty text="Ingen træninger med dato registreret" />
        ) : (
          trainersByWeekday.map(({ day, avg, count }) => (
            <BarFloat
              key={day}
              label={day}
              value={avg}
              max={maxWeekday}
              subtitle={`${count} træning${count !== 1 ? 'er' : ''}`}
              color="var(--purple)"
            />
          ))
        )}
      </Section>

      {/* ── Ansvarlig træner ────────────────────────────────────────────────── */}
      <Section title="Ansvarlig træner">
        {leadTrainerCounts.length === 0 ? (
          <Empty text="Ingen data — sæt ansvarlig træner på træningerne" />
        ) : (
          leadTrainerCounts.map(([name, count]) => (
            <Bar key={name} label={name} count={count} max={maxLead} color="var(--accent)" />
          ))
        )}
      </Section>

      {/* ── Temaer ──────────────────────────────────────────────────────────── */}
      <Section title="Temaer">
        {themeCounts.length === 0 ? (
          <Empty text="Ingen temaer registreret på træningerne" />
        ) : (
          themeCounts.map(([theme, count]) => (
            <Bar key={theme} label={theme} count={count} max={maxTheme} color="var(--blue)" />
          ))
        )}
      </Section>

      {/* ── Mest anvendte øvelser ───────────────────────────────────────────── */}
      <Section title="Mest anvendte øvelser — top 20">
        {/* Tag-filter — collapsed som default */}
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setTagFilterOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 20, fontSize: 13,
              background: tagFilter.length > 0 ? 'var(--accent-light)' : 'var(--bg-input)',
              color: tagFilter.length > 0 ? 'var(--accent)' : 'var(--text2)',
              border: tagFilter.length > 0 ? '1px solid var(--accent)' : '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            <span>Filtrer på tags</span>
            {tagFilter.length > 0 && (
              <span style={{
                background: 'var(--accent)', color: '#fff',
                borderRadius: '50%', width: 18, height: 18,
                fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {tagFilter.length}
              </span>
            )}
            <span style={{ fontSize: 10, opacity: 0.6 }}>{tagFilterOpen ? '▲' : '▼'}</span>
          </button>

          {tagFilterOpen && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {allExerciseTags.map(tag => {
                const active = tagFilter.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => setTagFilter(prev =>
                      active ? prev.filter(t => t !== tag) : [...prev, tag]
                    )}
                    style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 12,
                      background: active ? 'var(--accent)' : 'var(--bg-input)',
                      color: active ? '#fff' : 'var(--text2)',
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      cursor: 'pointer',
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
              {tagFilter.length > 0 && (
                <button
                  onClick={() => setTagFilter([])}
                  style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 12,
                    background: 'none', color: 'var(--text3)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                  }}
                >
                  Nulstil
                </button>
              )}
            </div>
          )}
        </div>

        {exerciseCounts.length === 0 ? (
          <Empty text={tagFilter.length > 0 ? 'Ingen øvelser matcher de valgte tags' : 'Ingen øvelsesdata'} />
        ) : (
          exerciseCounts.map(([id, count]) => {
            const ex = exerciseMap.get(id);
            return (
              <Bar
                key={id}
                label={ex?.name ?? id}
                count={count}
                max={maxExercise}
                color="var(--green)"
              />
            );
          })
        )}
      </Section>
    </div>
  );
}

// ── Hjælpekomponenter ─────────────────────────────────────────────────────────

function StatCard({ label, value, fullWidth }: { label: string; value: string | number; fullWidth?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      padding: '16px 24px', flex: fullWidth ? '1 1 100%' : '1 1 140px', minWidth: fullWidth ? 0 : 120,
    }}>
      <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--accent)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      padding: 20, marginBottom: 20,
    }}>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: 'var(--text)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Bar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = Math.max(4, Math.round((count / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 140, fontSize: 13, color: 'var(--text)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>
        {label}
      </div>
      <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: 4, height: 18, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ width: 28, fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
        {count}
      </div>
    </div>
  );
}

function BarFloat({ label, value, max, subtitle, color }: { label: string; value: number; max: number; subtitle?: string; color: string }) {
  const pct = Math.max(4, Math.round((value / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 80, flexShrink: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>{label}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{subtitle}</div>}
      </div>
      <div style={{ flex: 1, background: 'var(--bg-input)', borderRadius: 4, height: 18, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ width: 32, fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'right', flexShrink: 0 }}>
        {value.toFixed(1)}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ color: 'var(--text3)', fontSize: 14, padding: '8px 0' }}>{text}</div>
  );
}

// ── Tidsserie-graf ────────────────────────────────────────────────────────────

interface ChartPoint { date: string; count: number }

function PlayerChart({ data, avg }: { data: ChartPoint[]; avg: number }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: ChartPoint } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 660;
  const H = 180;
  const PAD = { top: 16, right: 16, bottom: 32, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const minVal = 0;
  const maxVal = Math.max(...data.map(d => d.count), avg * 1.2, 1);

  const xScale = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const yScale = (v: number) => PAD.top + innerH - ((v - minVal) / (maxVal - minVal)) * innerH;

  // Y-akse ticks — 4 jævnt fordelte
  const yTicks = useMemo(() => {
    const step = Math.ceil(maxVal / 4);
    return Array.from({ length: 5 }, (_, i) => i * step).filter(v => v <= maxVal + step);
  }, [maxVal]);

  // X-akse: vis måned+år ved første datapunkt i hver måned
  const xLabels = useMemo(() => {
    const seen = new Set<string>();
    return data.map((d, i) => {
      const key = d.date.slice(0, 7); // YYYY-MM
      if (seen.has(key)) return null;
      seen.add(key);
      const dt = new Date(d.date);
      const label = dt.toLocaleDateString('da-DK', { month: 'short', year: '2-digit' });
      return { i, label };
    }).filter(Boolean) as { i: number; label: string }[];
  }, [data]);

  // SVG polyline points-streng
  const linePoints = data.map((d, i) => `${xScale(i)},${yScale(d.count)}`).join(' ');

  // Fyldt areal under linjen
  const areaPoints = [
    `${xScale(0)},${PAD.top + innerH}`,
    ...data.map((d, i) => `${xScale(i)},${yScale(d.count)}`),
    `${xScale(data.length - 1)},${PAD.top + innerH}`,
  ].join(' ');

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const relX = svgX - PAD.left;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round((relX / innerW) * (data.length - 1))));
    const point = data[idx];
    setTooltip({ x: xScale(idx), y: yScale(point.count), point });
  }, [data, innerW, xScale, yScale]);

  const avgY = yScale(avg);

  return (
    <div style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', minWidth: 280, display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--blue)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--blue)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Y-grid + ticks */}
        {yTicks.map(v => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yScale(v)} x2={PAD.left + innerW} y2={yScale(v)}
              stroke="var(--border)" strokeWidth="1"
            />
            <text x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end" fontSize="10" fill="var(--text3)">
              {v}
            </text>
          </g>
        ))}

        {/* Areal */}
        <polygon points={areaPoints} fill="url(#area-grad)" />

        {/* Linje */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--blue)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Datapunkter */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xScale(i)} cy={yScale(d.count)} r="3"
            fill="var(--blue)" stroke="var(--bg-card)" strokeWidth="1.5"
          />
        ))}

        {/* Gennemsnits-linje (stiplet, sekundær) */}
        <line
          x1={PAD.left} y1={avgY} x2={PAD.left + innerW} y2={avgY}
          stroke="var(--text3)" strokeWidth="1.5" strokeDasharray="5 4"
        />
        <text x={PAD.left + innerW - 2} y={avgY - 5} textAnchor="end" fontSize="10" fill="var(--text3)">
          gns. {avg.toFixed(1)}
        </text>

        {/* X-akse labels */}
        {xLabels.map(({ i, label }) => (
          <text key={i} x={xScale(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text3)">
            {label}
          </text>
        ))}

        {/* Tooltip — lodret linje + cirkel fremhævet */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={PAD.top + innerH}
              stroke="var(--text3)" strokeWidth="1" strokeDasharray="3 3"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r="5" fill="var(--blue)" stroke="var(--bg-card)" strokeWidth="2" />
          </>
        )}
      </svg>

      {/* Tooltip boks — positioneres relativt til SVG-container */}
      {tooltip && (() => {
        const svgEl = svgRef.current;
        const rect = svgEl?.getBoundingClientRect();
        const containerRect = svgEl?.parentElement?.getBoundingClientRect();
        if (!rect || !containerRect) return null;
        const pxX = ((tooltip.x / W) * rect.width) + rect.left - containerRect.left;
        const pxY = ((tooltip.y / H) * rect.height) + rect.top - containerRect.top;
        const flipLeft = pxX > containerRect.width * 0.65;
        return (
          <div style={{
            position: 'absolute',
            left: flipLeft ? undefined : pxX + 10,
            right: flipLeft ? containerRect.width - pxX + 10 : undefined,
            top: Math.max(0, pxY - 28),
            background: 'var(--text)', color: 'var(--bg-card)',
            borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600,
            pointerEvents: 'none', whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}>
            {tooltip.point.date.slice(5).replace('-', '/')} — {tooltip.point.count} spillere
          </div>
        );
      })()}

      {/* Legende */}
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="20" height="3"><line x1="0" y1="1.5" x2="20" y2="1.5" stroke="var(--blue)" strokeWidth="2" /></svg>
          Antal spillere
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <svg width="20" height="3"><line x1="0" y1="1.5" x2="20" y2="1.5" stroke="var(--text3)" strokeWidth="1.5" strokeDasharray="5 4" /></svg>
          Gennemsnit
        </span>
      </div>
    </div>
  );
}
