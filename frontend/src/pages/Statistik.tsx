import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import type { Training, Exercise } from '../lib/types';

const WEEKDAY_ORDER = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];

function getWeekday(dateStr: string): string {
  const d = new Date(dateStr);
  // getDay() returnerer 0=søndag, 1=mandag osv.
  return WEEKDAY_ORDER[(d.getDay() + 6) % 7];
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

  const allTrainings: Training[] = useMemo(
    () => [...activeTrainings, ...archivedTrainings],
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

  // Gennemsnitlig antal trænere per ugedag — kun ugedage med mindst én træning
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

  const maxWeekday = Math.max(...trainersByWeekday.map(r => r.avg), 1);
  const maxLead = leadTrainerCounts[0]?.[1] ?? 1;
  const maxTheme = themeCounts[0]?.[1] ?? 1;
  const maxExercise = exerciseCounts[0]?.[1] ?? 1;

  if (isLoading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 24px' }}>
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
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 24px' }}>
        Statistik
      </h1>

      {/* ── Counters ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Træninger i alt" value={totalCount} />
        <StatCard label="Trænere pr. træning (gns.)" value={avgTrainers.toFixed(1)} />
      </div>

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

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      padding: '16px 24px', flex: '1 1 160px', minWidth: 140,
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

// Bar til float-værdier (gennemsnit) — viser én decimal + grå subtitle
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
