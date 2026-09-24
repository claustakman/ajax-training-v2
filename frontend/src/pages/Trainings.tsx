import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import type { Training } from '../lib/types';
import { fmtDay, fmtMon, fmtWday, fmtWdayFull, durMin, totalMins } from '../lib/dateUtils';
import HoldsportImportModal from '../components/HoldsportImportModal';

// ─── Skeleton-kort ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      padding: '14px 16px', display: 'flex', gap: 16, alignItems: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div className="skeleton" style={{ width: 44, height: 54, borderRadius: 10 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ height: 15, width: '55%' }} />
        <div className="skeleton" style={{ height: 12, width: '35%' }} />
      </div>
    </div>
  );
}

// ─── Dato-boks ────────────────────────────────────────────────────────────────
function DateBox({ dateStr }: { dateStr: string }) {
  return (
    <div style={{
      minWidth: 44, width: 44,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--accent-light)', borderRadius: 10,
      padding: '6px 0', gap: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {fmtMon(dateStr)}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', lineHeight: 1.1, fontFamily: 'var(--font-heading)' }}>
        {fmtDay(dateStr)}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500 }}>
        {fmtWday(dateStr)}
      </span>
    </div>
  );
}

// ─── Trænings-kort ────────────────────────────────────────────────────────────
function TrainingCard({ training, onClick }: { training: Training; onClick: () => void }) {
  const dur = durMin(training.start_time, training.end_time);
  const mins = totalMins(training.sections ?? []);

  // Linje 2: tid + varighed
  const timeParts: string[] = [];
  if (training.start_time) {
    timeParts.push(training.start_time + (training.end_time ? `–${training.end_time}` : ''));
  }
  if (dur) timeParts.push(`${dur} min`);

  // Linje 3: sted + fornavn på ansvarlig
  const locationPart = training.location || '';
  const leadPart = training.lead_trainer ? training.lead_trainer.split(' ')[0] : '';
  const line3Parts: string[] = [];
  if (locationPart) line3Parts.push(locationPart);
  if (leadPart) line3Parts.push(leadPart);

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)', borderRadius: 12,
        padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        cursor: 'pointer', transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)')}
    >
      {training.date ? (
        <DateBox dateStr={training.date} />
      ) : (
        <div style={{
          minWidth: 44, width: 44, height: 54, borderRadius: 10,
          background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text3)', fontSize: 20,
        }}>📋</div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Linje 1: titel */}
        <div style={{
          fontWeight: 600, fontSize: 15, color: 'var(--text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {training.date ? fmtWdayFull(training.date) + ' træning' : 'Træning'}
        </div>
        {/* Linje 2: tid + varighed */}
        {timeParts.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap' }}>
            {timeParts.join(' · ')}
          </div>
        )}
        {/* Linje 3: sted + ansvarlig pill */}
        {(locationPart || leadPart) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 3,
            whiteSpace: 'nowrap', overflow: 'hidden',
          }}>
            {locationPart && (
              <span style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {locationPart}
              </span>
            )}
            {leadPart && (
              <span style={{
                fontSize: 12, fontWeight: 600, color: 'var(--accent)',
                border: '1.5px solid var(--accent)', borderRadius: 20,
                padding: '1px 8px', flexShrink: 0,
              }}>
                {leadPart}
              </span>
            )}
          </div>
        )}
        {/* Linje 4: tema-pills */}
        {training.themes && training.themes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
            {training.themes.slice(0, 4).map(th => (
              <span key={th} style={{
                fontSize: 11, fontWeight: 500, color: 'var(--accent)',
                background: 'var(--accent-light)', borderRadius: 20, padding: '1px 8px',
              }}>{th}</span>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {mins > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{mins} min plan</span>
        )}
        {training.stars > 0 && (
          <span style={{ fontSize: 13, color: '#f59e0b' }}>{'★'.repeat(training.stars)}</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {training.participant_count != null && training.participant_count > 0 && (
            <span title={`${training.participant_count} spillere`} style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: 'var(--text2)',
            }}>{training.participant_count}</span>
          )}
          {training.trainers && training.trainers.length > 0 && (
            <span title={training.trainers.join(', ')} style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--accent-light)', border: '1px solid rgba(200,16,46,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 600, color: 'var(--accent)',
            }}>{training.trainers.length}</span>
          )}
          {training.holdsport_id && (
            <span title="Importeret fra Holdsport" style={{
              fontSize: 10, fontWeight: 700, color: 'var(--text3)',
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '1px 5px', letterSpacing: '0.3px',
            }}>HS</span>
          )}
        </div>
        <span style={{ color: 'var(--text3)', fontSize: 16 }}>›</span>
      </div>
    </div>
  );
}

// ─── Tom tilstand ─────────────────────────────────────────────────────────────
function EmptyState({ canEdit, onNew }: { canEdit: boolean; onNew: () => void }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 14,
      padding: '48px 24px', textAlign: 'center',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🏐</div>
      <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, margin: '0 0 8px' }}>
        Ingen kommende træninger
      </h2>
      <p style={{ color: 'var(--text2)', margin: '0 0 20px', fontSize: 15 }}>
        Opret den første træning for dette hold.
      </p>
      {canEdit && (
        <button onClick={onNew} style={{
          background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 10, padding: '10px 24px', fontSize: 15,
          fontWeight: 600, cursor: 'pointer',
        }}>+ Ny træning</button>
      )}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error'; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 600, padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 500,
      background: type === 'success' ? 'var(--green)' : 'var(--red)',
      color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      pointerEvents: 'none',
    }}>
      {message}
    </div>
  );
}

// ─── Hoved-komponent ───────────────────────────────────────────────────────────
export default function Trainings() {
  const navigate = useNavigate();
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const canEdit = hasRole(user, 'trainer', currentTeamRole);
  const hasHoldsport = !!(user?.teams.find(t => t.id === currentTeamId)?.holdsport_worker_url);
  const queryClient = useQueryClient();

  const { data: trainings = [], isLoading: loading, error: queryError, refetch } = useQuery<Training[]>({
    queryKey: ['trainings', currentTeamId, 'active'],
    queryFn: () => api.fetchTrainings(currentTeamId!, 0),
    enabled: !!currentTeamId,
    staleTime: 0,
    refetchInterval: 5 * 60 * 1000,
  });

  const error = queryError ? (queryError as Error).message ?? 'Fejl ved indlæsning' : null;

  const [showHoldsportModal, setShowHoldsportModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [sortAsc, setSortAsc] = useState<boolean>(() => {
    try { return localStorage.getItem('trainings_sort_asc') !== '0'; } catch { return true; }
  });
  const syncingRef = useRef(false);

  function load() {
    refetch();
  }

  function handleNew() {
    navigate('/traininger/ny');
  }

  function handleHoldsportClick() {
    setShowHoldsportModal(true);
  }

  // Delt sync-kerne — kører på et givet sæt træninger
  // silent=true: ingen toast, kun console-timing (bruges til auto-sync)
  async function syncTrainings(hsTrainings: Training[], silent = false) {
    if (!currentTeamId || hsTrainings.length === 0) return;
    const t0 = performance.now();
    try {
      const [config, members] = await Promise.all([
        api.fetchHoldsportConfig(currentTeamId),
        api.get<Array<{ id: string; name: string; team_role: string; holdsport_sync: number }>>(
          `/api/users/team-members?team_id=${currentTeamId}`
        ),
      ]);
      const trainerNames = new Set(
        members
          .filter(m => (m.team_role === 'trainer' || m.team_role === 'team_manager') && m.holdsport_sync !== 0)
          .map(m => m.name)
      );
      const nonSyncNames = new Set(
        members
          .filter(m => (m.team_role === 'trainer' || m.team_role === 'team_manager') && m.holdsport_sync === 0)
          .map(m => m.name)
      );
      const teams = await api.fetchHoldsportTeams(config.workerUrl, config.token);

      let updated = 0;
      for (const t of hsTrainings) {
        let found = null;
        for (const team of teams) {
          found = await api.fetchHoldsportActivity(
            config.workerUrl, config.token, team.id, t.holdsport_id!, t.date!
          );
          if (found) break;
        }
        if (!found) continue;

        const rec = found as unknown as Record<string, unknown>;
        const users = rec.activities_users;
        let playerCount = 0;
        const trainerList: string[] = [];
        if (Array.isArray(users)) {
          for (const u of users) {
            const ur = u as Record<string, unknown>;
            if (ur.status_code !== 1) continue;
            const name = ur.name as string;
            if (trainerNames.has(name)) trainerList.push(name);
            else playerCount++;
          }
        } else {
          playerCount = (rec.attendance_count ?? rec.signups_count ?? 0) as number;
        }
        for (const name of (t.trainers ?? [])) {
          if (nonSyncNames.has(name)) trainerList.push(name);
        }

        const patch: Partial<Training> = {
          participant_count: playerCount > 0 ? playerCount : undefined,
          trainers: trainerList,
        };
        await api.patch(`/api/trainings/${t.id}`, patch);
        queryClient.setQueryData<Training[]>(['trainings', currentTeamId, 'active'], prev =>
          (prev ?? []).map(x => x.id === t.id ? { ...x, ...patch } : x)
        );
        updated++;
      }

      const ms = Math.round(performance.now() - t0);
      console.log(`[AutoSync] ${updated}/${hsTrainings.length} træninger synkroniseret på ${ms}ms`);
      if (!silent) {
        setToast({ message: `${updated} træning${updated !== 1 ? 'er' : ''} synkroniseret ✓`, type: 'success' });
      }
    } catch (err) {
      const ms = Math.round(performance.now() - t0);
      console.error(`[AutoSync] Fejl efter ${ms}ms:`, err);
      if (!silent) {
        const msg = err instanceof Error ? err.message : String(err);
        setToast({ message: `Fejl ved synkronisering: ${msg}`, type: 'error' });
      }
    }
  }

  async function handleSyncAll() {
    if (!currentTeamId || syncing) return;
    const hsTrainings = trainings.filter(t => t.holdsport_id && t.date);
    if (hsTrainings.length === 0) {
      setToast({ message: 'Ingen Holdsport-træninger at synkronisere', type: 'error' });
      return;
    }
    setSyncing(true);
    await syncTrainings(hsTrainings, false);
    setSyncing(false);
  }

  // Auto-sync: ved mount og når tabben bliver aktiv igen
  // Kun træninger inden for -1 til +7 dage — throttle 10 min per session
  const AUTO_SYNC_KEY = `hs_autosync_${currentTeamId}`;
  const AUTO_SYNC_INTERVAL = 10 * 60 * 1000;

  async function runAutoSync(currentTrainings: Training[]) {
    if (!currentTeamId || syncingRef.current) return;
    const last = parseInt(sessionStorage.getItem(AUTO_SYNC_KEY) ?? '0', 10);
    if (Date.now() - last < AUTO_SYNC_INTERVAL) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoffFuture = new Date(today);
    cutoffFuture.setDate(today.getDate() + 7);
    const cutoffPast = new Date(today);
    cutoffPast.setDate(today.getDate() - 1);

    const nearby = currentTrainings.filter(t => {
      if (!t.holdsport_id || !t.date) return false;
      const d = new Date(t.date);
      return d >= cutoffPast && d <= cutoffFuture;
    });
    if (nearby.length === 0) return;

    sessionStorage.setItem(AUTO_SYNC_KEY, String(Date.now()));
    syncingRef.current = true;
    await syncTrainings(nearby, true);
    syncingRef.current = false;
  }

  // Kør auto-sync ved mount (når trainings er loaded)
  useEffect(() => {
    if (trainings.length > 0 && canEdit) {
      runAutoSync(trainings);
    }
  }, [trainings.length, currentTeamId]);

  // Kør auto-sync når bruger vender tilbage til tabben
  useEffect(() => {
    if (!canEdit) return;
    function onVisible() {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['trainings', currentTeamId, 'active'] });
        // trainings opdateres via React Query — auto-sync kicker i ovenstående useEffect
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [currentTeamId, canEdit]);

  async function handleHoldsportImport(activities: Parameters<typeof api.createTraining>[0][]) {
    setShowHoldsportModal(false);
    let successCount = 0;
    let skipCount = 0;

    for (const activity of activities) {
      try {
        await api.createTraining(activity);
        successCount++;
      } catch {
        skipCount++;
      }
    }

    // Genindlæs træningslisten
    load();

    if (successCount > 0) {
      setToast({
        message: `${successCount} træning${successCount !== 1 ? 'er' : ''} importeret ✓`,
        type: 'success',
      });
    }
    if (skipCount > 0) {
      setTimeout(() => {
        setToast({ message: `${skipCount} kunne ikke importeres`, type: 'error' });
      }, successCount > 0 ? 3800 : 0);
    }
  }

  return (
    <div>
      {/* ── Sidetitel + handlinger ── */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 8, flexWrap: 'wrap' }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700,
          margin: 0, flex: 1,
        }}>Træninger</h1>

        <button
          onClick={() => setSortAsc(o => {
            const next = !o;
            try { localStorage.setItem('trainings_sort_asc', next ? '1' : '0'); } catch {}
            return next;
          })}
          title={sortAsc ? 'Sortér faldende' : 'Sortér stigende'}
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: '8px 12px', fontSize: 14, cursor: 'pointer', color: 'var(--text2)',
          }}
        >{sortAsc ? '↑ Dato' : '↓ Dato'}</button>

        {canEdit && hasHoldsport && (
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            title="Synkroniser tilmeldte fra Holdsport for alle træninger"
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: syncing ? 'default' : 'pointer',
              color: 'var(--text)', opacity: syncing ? 0.6 : 1,
            }}
          >{syncing ? '↻ Synkroniserer…' : '↻ Sync'}</button>
        )}

        {canEdit && hasHoldsport && (
          <button
            onClick={handleHoldsportClick}
            title="Importer fra Holdsport"
            style={{
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
              color: 'var(--text)',
            }}
          >Holdsport ↓</button>
        )}
      </div>

      {/* ── Indhold ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(n => <SkeletonCard key={n} />)}
        </div>
      ) : error ? (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12, padding: 24,
          color: 'var(--red)', fontSize: 15,
        }}>
          {error}
        </div>
      ) : trainings.length === 0 ? (
        <EmptyState canEdit={canEdit} onNew={handleNew} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...trainings].sort((a, b) => {
            const da = a.date ?? '';
            const db = b.date ?? '';
            return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
          }).map(t => (
            <TrainingCard
              key={t.id}
              training={t}
              onClick={() => navigate(`/traininger/${t.id}`)}
            />
          ))}
        </div>
      )}

      {/* ── Holdsport import modal ── */}
      {showHoldsportModal && currentTeamId && (
        <HoldsportImportModal
          teamId={currentTeamId}
          existingTrainings={trainings}
          onImport={handleHoldsportImport}
          onClose={() => setShowHoldsportModal(false)}
        />
      )}

      {/* ── FAB: Ny træning ── */}
      {canEdit && (
        <button
          onClick={handleNew}
          title="Ny træning"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--bottomnav-h) + 16px + env(safe-area-inset-bottom))',
            right: 20,
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff', border: 'none',
            fontSize: 26, fontWeight: 300, lineHeight: 1,
            cursor: 'pointer', zIndex: 200,
            boxShadow: '0 4px 16px rgba(200,16,46,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
      )}

      {/* ── Toast ── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}
