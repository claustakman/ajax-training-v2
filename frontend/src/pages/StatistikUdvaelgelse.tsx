/**
 * Statistik udvælgelse (/statistik-udvaelgelse) — hjælp til at vælge hvem der skal spille og hvem der skal sidde over.
 * Kun spillede kampe (aktive + arkiverede). Udtaget = Holdsport "Tilmeldt", oversidder = "Til rådighed".
 * Filter på kamphold (Ajax 1/2/3) ud fra kampnavnet.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training } from '../lib/types';
import { isTrainingKind, matchTeam, KIND_STYLE } from '../lib/events';
import { trainerList } from '../lib/holdsportAttendance';
import { fetchPlayerAttendance } from '../lib/playerAttendance';
import { Section, Empty, AttendanceChart, withShortLabels } from '../components/StatWidgets';

const RECENT_WEEKS = 5;
const RECENT_DAYS = RECENT_WEEKS * 7;
const TEAM_FILTER_KEY = 'stat_udv_team';

// Kampen er spillet når starttidspunktet er passeret (uden tid: datoen er i dag eller tidligere)
function isPlayed(t: Training, now: Date): boolean {
  if (!t.date) return false;
  return new Date(`${t.date}T${t.start_time || '00:00'}`) <= now;
}

function recentCutoff(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - RECENT_DAYS);
  return d;
}

type Row = { name: string; count: number };

// Tæl navne på tværs af kampe — alle i `universe` starter på 0, så spillere uden kampe/oversidninger også vises
function countNames(matches: Training[], pick: (t: Training) => string[], universe: Set<string>): Row[] {
  const counts = new Map<string, number>([...universe].map(n => [n, 0]));
  for (const t of matches) for (const n of pick(t)) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'da'));
}

function hasPlayerData(t: Training): boolean {
  return (t.selected_players?.length ?? 0) > 0 || (t.bench_players?.length ?? 0) > 0;
}

export default function StatistikUdvaelgelse() {
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canSee = hasRole(user, 'trainer', currentTeamRole);
  const [teamFilter, setTeamFilter] = useState<string>(() => {
    try { return sessionStorage.getItem(TEAM_FILTER_KEY) ?? ''; } catch { return ''; }
  });

  function chooseTeam(team: string) {
    setTeamFilter(team);
    try { sessionStorage.setItem(TEAM_FILTER_KEY, team); } catch { /* ignorer */ }
  }

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
  const isLoading = loadingActive || loadingArchived;
  const all = useMemo(() => [...activeTrainings, ...archivedTrainings], [activeTrainings, archivedTrainings]);

  // Spillede kampe (ikke stævner, ikke fremtidige)
  const playedMatches = useMemo(() => {
    const now = new Date();
    return all.filter(t => t.kind === 'match' && isPlayed(t, now));
  }, [all]);

  // Kamphold der optræder i data (Ajax 1, Ajax 2, …)
  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const t of playedMatches) { const mt = matchTeam(t); if (mt) s.add(mt); }
    return [...s].sort((a, b) => a.localeCompare(b, 'da', { numeric: true }));
  }, [playedMatches]);
  const activeTeam = teams.includes(teamFilter) ? teamFilter : '';

  const matches = useMemo(
    () => playedMatches.filter(t => !activeTeam || matchTeam(t) === activeTeam),
    [playedMatches, activeTeam]
  );
  const withData = useMemo(() => matches.filter(hasPlayerData), [matches]);
  const missingData = matches.length - withData.length;
  const recentMatches = useMemo(() => {
    const cutoff = recentCutoff();
    return withData.filter(t => new Date(t.date!) >= cutoff);
  }, [withData]);

  // Alle spillere der har været udtaget eller til rådighed i en kamp (for det valgte kamphold)
  const universe = useMemo(() => {
    const s = new Set<string>();
    for (const t of withData) for (const n of [...(t.selected_players ?? []), ...(t.bench_players ?? [])]) s.add(n);
    return s;
  }, [withData]);

  const matchesAll = useMemo(() => withShortLabels(countNames(withData, t => t.selected_players ?? [], universe)), [withData, universe]);
  const matchesRecent = useMemo(() => withShortLabels(countNames(recentMatches, t => t.selected_players ?? [], universe)), [recentMatches, universe]);
  const benchAll = useMemo(() => withShortLabels(countNames(withData, t => t.bench_players ?? [], universe)), [withData, universe]);
  const benchRecent = useMemo(() => withShortLabels(countNames(recentMatches, t => t.bench_players ?? [], universe)), [recentMatches, universe]);
  const trainerRows = useMemo(() => withShortLabels(countNames(
    matches,
    t => [...new Set([...trainerList(t), ...(t.keeper_trainers ?? []), ...(t.youth_trainers ?? [])])],
    new Set(),
  ).filter(r => r.count > 0)), [matches]);

  // Træningsfremmøde de sidste 5 uger — hentes live fra Holdsport (samme som Statistik træning)
  const recentHsTrainings = useMemo(() => {
    const cutoff = recentCutoff();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return all
      .filter(t => isTrainingKind(t) && t.holdsport_id && t.date && new Date(t.date) >= cutoff && new Date(t.date) <= today)
      .sort((a, b) => a.date!.localeCompare(b.date!));
  }, [all]);

  const { data: attendance, isLoading: loadingAttendance, isError: attendanceError } = useQuery({
    queryKey: ['player-attendance', currentTeamId, recentHsTrainings.map(t => t.id).join(',')],
    queryFn: () => fetchPlayerAttendance(currentTeamId!, recentHsTrainings),
    enabled: !!currentTeamId && canSee && recentHsTrainings.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  // Med kamphold valgt: kun spillere der har været på det holds kampe
  const attendanceRows = useMemo(() => {
    const players = attendance?.players ?? [];
    return withShortLabels(activeTeam ? players.filter(p => universe.has(p.name)) : players);
  }, [attendance, activeTeam, universe]);

  if (!canSee) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={h1Style}>Statistik udvælgelse</h1>
        <Empty text="Kun for trænere" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={h1Style}>Statistik udvælgelse</h1>
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: 16 }} />
        ))}
      </div>
    );
  }

  const green = KIND_STYLE.match.color;
  const noMatches = withData.length === 0;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={h1Style}>Statistik udvælgelse</h1>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px' }}>
        Kun spillede kampe · {withData.length} kamp{withData.length !== 1 ? 'e' : ''} med spillerdata
        {missingData > 0 && ` · ${missingData} uden spillerdata (synkronisér med Holdsport)`}
      </p>

      {/* ── Kamphold-filter ── */}
      {teams.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          {['', ...teams].map(team => {
            const on = activeTeam === team;
            return (
              <button key={team || 'alle'} onClick={() => chooseTeam(team)} style={{
                padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, minHeight: 36,
                background: on ? 'var(--accent)' : 'var(--bg-card)',
                border: on ? '1px solid var(--accent)' : '1px solid var(--border2)',
                color: on ? '#fff' : 'var(--text2)', cursor: 'pointer',
              }}>{team || 'Alle hold'}</button>
            );
          })}
        </div>
      )}

      {/* ── Kampe pr. spiller ── */}
      <Section title="Kampe pr. spiller">
        <Desc>Antal spillede kampe hvor spilleren var udtaget (status "Tilmeldt" i Holdsport).</Desc>
        {noMatches ? <Empty text="Ingen spillede kampe med spillerdata endnu" />
          : <AttendanceChart rows={matchesAll} total={withData.length} color={green} markerLabel="kampe" />}
      </Section>

      <Section title={`Kampe de sidste ${RECENT_WEEKS} uger`}>
        <Desc>Antal kampe som udtaget de sidste {RECENT_DAYS} dage.</Desc>
        {recentMatches.length === 0 ? <Empty text={`Ingen spillede kampe de sidste ${RECENT_WEEKS} uger`} />
          : <AttendanceChart rows={matchesRecent} total={recentMatches.length} color={green} markerLabel="kampe" />}
      </Section>

      {/* ── Træninger de sidste 5 uger (samme widget som Statistik træning) ── */}
      <Section title={`Træninger de sidste ${RECENT_WEEKS} uger`}>
        {recentHsTrainings.length === 0 ? (
          <Empty text={`Ingen Holdsport-træninger de sidste ${RECENT_WEEKS} uger`} />
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
            <Desc>
              Antal tilmeldinger korrigeret fra fravær (= fremmøde) de sidste {RECENT_DAYS} dage · % af alle afholdte træninger i denne app.
              {activeTeam && ` Viser spillere der har været på ${activeTeam}s kampe.`}
            </Desc>
            <AttendanceChart rows={attendanceRows} total={attendance.totalTrainings} />
          </>
        )}
      </Section>

      {/* ── Oversidninger ── */}
      <Section title="Oversidninger pr. spiller">
        <Desc>
          Antal kampe hvor spilleren stod som "Til rådighed" i Holdsport, altså var klar til at spille men ikke blev udtaget.
          Mange oversidninger kan være et argument for at udtage spilleren næste gang.
        </Desc>
        {noMatches ? <Empty text="Ingen spillede kampe med spillerdata endnu" />
          : <AttendanceChart rows={benchAll} color="var(--yellow)" />}
      </Section>

      <Section title={`Oversidninger de sidste ${RECENT_WEEKS} uger`}>
        <Desc>Samme som ovenfor, men kun kampe de sidste {RECENT_DAYS} dage. Viser hvem der har siddet over for nylig.</Desc>
        {recentMatches.length === 0 ? <Empty text={`Ingen spillede kampe de sidste ${RECENT_WEEKS} uger`} />
          : <AttendanceChart rows={benchRecent} color="var(--yellow)" />}
      </Section>

      {/* ── Kampe pr. træner ── */}
      <Section title="Kampe pr. træner">
        <Desc>Antal spillede kampe hvor træneren var tilmeldt (trænere, keeper- og ungtrænere).</Desc>
        {trainerRows.length === 0 ? <Empty text="Ingen trænere registreret på spillede kampe" />
          : <AttendanceChart rows={trainerRows} total={matches.length} color="var(--purple)" markerLabel="kampe" />}
      </Section>
    </div>
  );
}

const h1Style: React.CSSProperties = { fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 4px' };

function Desc({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--text3)', margin: '-8px 0 12px' }}>{children}</p>;
}
