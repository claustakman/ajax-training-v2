import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training, Exercise } from '../lib/types';
import { isTrainingKind } from '../lib/events';
import { trainerList, extractPlayerNames } from '../lib/holdsportAttendance';
import type { TeamMember } from '../lib/holdsportAttendance';

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

const ATTENDANCE_DAYS = 30;
const TIME_SERIES_MONTHS = 3;

// "Mads Holm Hansen" → "Mads H."
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length < 2 ? full : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

interface PlayerAttendance {
  totalTrainings: number;  // HS-træninger hvor tilmeldinger kunne hentes
  players: { name: string; count: number }[];
}

// Henter tilmeldinger live fra Holdsport for den sidste måneds træninger og tæller pr. spiller
async function fetchPlayerAttendance(teamId: string, trainings: Training[]): Promise<PlayerAttendance> {
  const [config, members] = await Promise.all([
    api.fetchHoldsportConfig(teamId),
    api.get<TeamMember[]>(`/api/users/team-members?team_id=${teamId}`),
  ]);
  const hsTeams = await api.fetchHoldsportTeams(config.workerUrl, config.token);

  const results = await Promise.all(trainings.map(async t => {
    for (const team of hsTeams) {
      try {
        const act = await api.fetchHoldsportActivity(config.workerUrl, config.token, team.id, t.holdsport_id!, t.date!);
        if (act && Array.isArray((act as Record<string, unknown>).activities_users)) return extractPlayerNames(act, members);
      } catch { /* prøv næste hold */ }
    }
    return null;
  }));

  // Alle spillere der optræder på en aktivitet i perioden starter på 0 — så 0 fremmøde også vises
  const counts = new Map<string, number>();
  let totalTrainings = 0;
  for (const res of results) {
    if (!res) continue;
    totalTrainings++;
    for (const n of res.roster) if (!counts.has(n)) counts.set(n, 0);
    for (const n of res.attended) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const players = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'da'));
  return { totalTrainings, players };
}

export default function Statistik() {
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canSeeAttendance = hasRole(user, 'trainer', currentTeamRole);
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

  // Kun afholdte træninger (dato sat + dato ≤ i dag) — kampe/stævne tæller ikke med
  const allTrainings: Training[] = useMemo(
    () => [...activeTrainings, ...archivedTrainings].filter(t => t.date && isPast(t.date) && isTrainingKind(t)),
    [activeTrainings, archivedTrainings]
  );

  // Træninger fra Holdsport inden for den sidste måned
  const recentHsTrainings = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - ATTENDANCE_DAYS);
    return allTrainings
      .filter(t => t.holdsport_id && new Date(t.date!) >= cutoff)
      .sort((a, b) => a.date!.localeCompare(b.date!));
  }, [allTrainings]);

  const { data: attendance, isLoading: loadingAttendance, isError: attendanceError } = useQuery({
    queryKey: ['player-attendance', currentTeamId, recentHsTrainings.map(t => t.id).join(',')],
    queryFn: () => fetchPlayerAttendance(currentTeamId!, recentHsTrainings),
    enabled: !!currentTeamId && canSeeAttendance && recentHsTrainings.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // Fornavn + forbogstav i efternavn — fuldt navn hvis to spillere ville få samme forkortelse
  const attendanceRows = useMemo(() => {
    const players = attendance?.players ?? [];
    const shortCount = new Map<string, number>();
    for (const p of players) shortCount.set(shortName(p.name), (shortCount.get(shortName(p.name)) ?? 0) + 1);
    return players.map(p => ({ ...p, label: shortCount.get(shortName(p.name))! > 1 ? p.name : shortName(p.name) }));
  }, [attendance]);

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
    // Inkl. ansvarlig, keeper- og ungtrænere
    const sum = allTrainings.reduce((acc, t) =>
      acc + trainerList(t).length + (t.keeper_trainers?.length ?? 0) + (t.youth_trainers?.length ?? 0), 0);
    return sum / totalCount;
  }, [allTrainings, totalCount]);

  const avgPlayers = useMemo(() => {
    const withData = allTrainings.filter(t => (t.participant_count ?? 0) > 0);
    if (withData.length === 0) return null;
    const sum = withData.reduce((acc, t) => acc + (t.participant_count ?? 0), 0);
    return sum / withData.length;
  }, [allTrainings]);

  // Tidsserie: kun de sidste 3 måneder
  const playerTimeSeries = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setMonth(cutoff.getMonth() - TIME_SERIES_MONTHS);
    return allTrainings
      .filter(t => t.date && (t.participant_count ?? 0) > 0 && new Date(t.date) >= cutoff)
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
      // Inkl. keeper- og ungtrænere
      const n = trainerList(t).length + (t.keeper_trainers?.length ?? 0) + (t.youth_trainers?.length ?? 0);
      sums[day] = (sums[day] ?? 0) + n;
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

      {/* ── Træningsfremmøde sidste måned ───────────────────────────────────── */}
      {canSeeAttendance && (
        <Section title="Træningsfremmøde den sidste måned">
          {recentHsTrainings.length === 0 ? (
            <Empty text="Ingen Holdsport-træninger den sidste måned" />
          ) : loadingAttendance ? (
            [1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton" style={{ height: 18, marginBottom: 8, width: `${90 - i * 12}%` }} />
            ))
          ) : attendanceError || !attendance ? (
            <Empty text="Kunne ikke hente tilmeldinger fra Holdsport" />
          ) : attendanceRows.length === 0 ? (
            <Empty text="Ingen tilmeldte spillere fundet" />
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: '-8px 0 12px' }}>
                Antal tilmeldinger korrigeret fra fravær (= fremmøde) de sidste {ATTENDANCE_DAYS} dage · % af alle afholdte træninger
              </p>
              <AttendanceChart rows={attendanceRows} total={attendance.totalTrainings} />
            </>
          )}
        </Section>
      )}

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
      <Section title="Spillere til træning de sidste 3 måneder">
        {playerTimeSeries.length < 2 ? (
          <Empty text="Ikke nok data til at vise tidsserie — synkronisér træningerne med Holdsport" />
        ) : (
          <PlayerChart data={playerTimeSeries} avg={playerTimeSeries.reduce((a, p) => a + p.count, 0) / playerTimeSeries.length} />
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

// Fremmøde pr. spiller — lodret markør viser antal afholdte træninger i perioden
function AttendanceChart({ rows, total }: { rows: { name: string; label: string; count: number }[]; total: number }) {
  const LABEL_W = 110, VALUE_W = 76, GAP = 10;
  // Lidt luft efter markøren så den ikke flugter med kanten
  const max = Math.max(total, ...rows.map(r => r.count), 1) * 1.15;
  const markerPct = (total / max) * 100;
  return (
    <div style={{ position: 'relative', paddingTop: 20 }}>
      {/* Markør: spænder over søjleområdet */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W + GAP, right: VALUE_W + GAP, pointerEvents: 'none', zIndex: 1 }}>
        <div style={{ position: 'absolute', left: `${markerPct}%`, top: 16, bottom: 0, borderLeft: '2px dashed var(--accent)' }} />
        <div style={{
          position: 'absolute', left: `${markerPct}%`, top: 0, transform: 'translateX(-50%)',
          fontSize: 11, fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap',
        }}>
          {total} afholdt
        </div>
      </div>
      {rows.map((r, i) => {
        const share = total > 0 ? r.count / total : 0;
        return (
          // Zebra-striber: hver anden række får svag baggrund så linjerne er lette at følge
          <div key={r.name} style={{
            display: 'flex', alignItems: 'center', gap: GAP,
            padding: '4px 6px', margin: '0 -6px', borderRadius: 6,
            background: i % 2 === 1 ? 'var(--bg-input)' : 'transparent',
          }}>
            <div style={{ width: LABEL_W, fontSize: 13, color: 'var(--text)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.name}>
              {r.label}
            </div>
            <div style={{ flex: 1, height: 18 }}>
              <div style={{ width: r.count > 0 ? `${Math.max(2, (r.count / max) * 100)}%` : 0, background: 'var(--green)', height: '100%', borderRadius: 4, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ width: VALUE_W, fontSize: 13, color: 'var(--text)', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 600 }}>{r.count}</span>
              <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{Math.round(share * 100)}%</span>
            </div>
          </div>
        );
      })}
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
