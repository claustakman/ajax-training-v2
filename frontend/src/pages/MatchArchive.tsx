/**
 * Kamparkiv (/kamparkiv) — arkiverede kampe, adskilt fra træningsarkivet.
 * Arkiverede kampe tæller stadig med i Statistik udvælgelse.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training } from '../lib/types';
import { eventTitle, matchTeam, KIND_STYLE } from '../lib/events';
import { fmtDay, fmtMon, fmtWday } from '../lib/dateUtils';

const TEAM_FILTER_KEY = 'kamparkiv_team';

function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3200);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
      zIndex: 700, padding: '11px 22px', borderRadius: 10, fontSize: 14, fontWeight: 500,
      background: type === 'success' ? 'var(--green)' : 'var(--red)',
      color: '#fff', boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      {message}
    </div>
  );
}

function DateBox({ dateStr }: { dateStr: string }) {
  return (
    <div style={{
      minWidth: 44, width: 44,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-input)', borderRadius: 10, padding: '6px 0',
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {fmtMon(dateStr)}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text2)', lineHeight: 1.1, fontFamily: 'var(--font-heading)' }}>
        {fmtDay(dateStr)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>{fmtWday(dateStr)}</span>
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 8, fontSize: 13, minHeight: 32,
  background: 'var(--bg-input)', border: '1px solid var(--border2)', cursor: 'pointer',
};

export default function MatchArchive() {
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canEdit = hasRole(user, 'trainer', currentTeamRole);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>(() => {
    try { return sessionStorage.getItem(TEAM_FILTER_KEY) ?? ''; } catch { return ''; }
  });

  const { data: archived = [], isLoading } = useQuery({
    queryKey: ['trainings', currentTeamId, 'archived'],
    queryFn: () => api.fetchTrainings(currentTeamId!, 1),
    enabled: !!currentTeamId,
    staleTime: 0,
  });

  const matches = useMemo(
    () => archived.filter(t => t.kind === 'match').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.start_time ?? '').localeCompare(a.start_time ?? '')),
    [archived]
  );
  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const t of matches) { const mt = matchTeam(t); if (mt) s.add(mt); }
    return [...s].sort((a, b) => a.localeCompare(b, 'da', { numeric: true }));
  }, [matches]);
  const activeTeam = teams.includes(teamFilter) ? teamFilter : '';
  const visible = matches.filter(t => !activeTeam || matchTeam(t) === activeTeam);

  function chooseTeam(team: string) {
    setTeamFilter(team);
    try { sessionStorage.setItem(TEAM_FILTER_KEY, team); } catch { /* ignorer */ }
  }

  function removeLocal(id: string) {
    queryClient.setQueryData<Training[]>(['trainings', currentTeamId, 'archived'], prev => (prev ?? []).filter(t => t.id !== id));
    queryClient.invalidateQueries({ queryKey: ['trainings', currentTeamId, 'active'] });
  }

  async function handleRestore(t: Training) {
    try {
      await api.updateTraining(t.id, { archived: false });
      removeLocal(t.id);
      setToast({ message: 'Kamp genskabt ✓', type: 'success' });
    } catch {
      setToast({ message: 'Fejl ved gendannelse', type: 'error' });
    }
  }

  async function handleDelete(t: Training) {
    if (!confirm(`Slet kampen "${eventTitle(t)}" permanent? Den forsvinder også fra statistikken. Dette kan ikke fortrydes.`)) return;
    try {
      await api.deleteTraining(t.id);
      removeLocal(t.id);
      setToast({ message: 'Kamp slettet', type: 'success' });
    } catch {
      setToast({ message: 'Fejl ved sletning', type: 'error' });
    }
  }

  const style = KIND_STYLE.match;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 4px' }}>Kamparkiv</h1>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '0 0 16px' }}>
        Arkiverede kampe tæller stadig med i Statistik udvælgelse
      </p>

      {teams.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
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

      {isLoading ? (
        [1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12, marginBottom: 10 }} />)
      ) : visible.length === 0 ? (
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: '32px 20px', textAlign: 'center', color: 'var(--text3)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🗄️</div>
          <div style={{ fontWeight: 600, color: 'var(--text2)', marginBottom: 4 }}>Ingen arkiverede kampe</div>
          <div style={{ fontSize: 13 }}>Arkivér en kamp fra kampsiden med 🗄️ Arkiv</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(t => {
            const team = matchTeam(t);
            const sel = t.selected_players?.length ?? 0;
            const bench = t.bench_players?.length ?? 0;
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--bg-card)', borderRadius: 12, padding: 12,
                borderLeft: `4px solid ${style.color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                {t.date && <DateBox dateStr={t.date} />}
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate(`/kampe/${t.id}`)}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{eventTitle(t)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {team && <span style={{ fontWeight: 600, color: style.color }}>{team}</span>}
                    {t.start_time && <span>{t.start_time}</span>}
                    {t.location && <span>{t.location}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {sel || bench ? `${sel} udtaget · ${bench} oversidder${bench !== 1 ? 'e' : ''}` : 'Ingen spillerdata'}
                  </div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => handleRestore(t)} title="Genskab" aria-label="Genskab" style={{ ...smallBtn, color: 'var(--text)' }}>↩</button>
                    <button onClick={() => handleDelete(t)} title="Slet permanent" aria-label="Slet permanent" style={{ ...smallBtn, color: 'var(--red)' }}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
