import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth, hasRole, ROLE_LABELS } from '../lib/auth';
import { api } from '../lib/api';
import type { Team } from '../lib/auth';

// Faste nav-punkter — desktop topbar
const NAV_ITEMS = [
  { to: '/',         label: 'Træning', icon: '📋' },
  { to: '/katalog',  label: 'Katalog', icon: '📚' },
  { to: '/tavle',    label: 'Tavle',   icon: '📌', showUnread: true },
  { to: '/aarshjul', label: 'Årshjul', icon: '📅' },
];

// Mobil bundnav — kun tre punkter + hamburger
const MOBILE_NAV_ITEMS = [
  { to: '/',        label: 'Træning', icon: '📋' },
  { to: '/katalog', label: 'Katalog', icon: '📚' },
  { to: '/tavle',   label: 'Tavle',   icon: '📌', showUnread: true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, currentTeamId, setCurrentTeam, currentTeamRole } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);

  const currentTeam = user?.teams.find(t => t.id === currentTeamId);
  const multipleTeams = (user?.teams.length ?? 0) > 1;

  const { data: unreadData } = useQuery({
    queryKey: ['board-unread', currentTeamId],
    queryFn: () => api.fetchBoardUnread(currentTeamId!),
    enabled: !!currentTeamId && !!user,
    refetchInterval: 60_000,
  });
  const hasUnread = unreadData?.unread === true;

  function handleTeamSwitch(team: Team) {
    setCurrentTeam(team.id);
    setTeamPickerOpen(false);
    setMenuOpen(false);
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Topbar */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: 'var(--topbar-h)',
        background: 'var(--bg-card)',
        borderBottom: '3px solid var(--accent)',
        display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 8,
      }}>
        <img src="/ajax-logo.png" alt="Ajax" style={{ height: 36, width: 36, objectFit: 'contain', marginRight: 4 }} />

        {/* Desktop nav */}
        <nav style={{ display: 'flex', gap: 4, flex: 1 }} className="desktop-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                padding: '6px 14px',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: 14,
                color: isActive ? 'var(--accent)' : 'var(--text2)',
                background: isActive ? 'var(--accent-light)' : 'transparent',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              })}
            >
              {item.label}
              {item.showUnread && hasUnread && (
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'inline-block', flexShrink: 0,
                }} />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Hold-viser / switcher (desktop) */}
        {currentTeam && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => multipleTeams ? setTeamPickerOpen(o => !o) : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: 8,
                background: 'var(--accent-light)',
                color: 'var(--accent)',
                fontSize: 13, fontWeight: 600,
                cursor: multipleTeams ? 'pointer' : 'default',
              }}
              aria-label={multipleTeams ? 'Skift hold' : undefined}
            >
              {currentTeam.name}
              {multipleTeams && <span style={{ fontSize: 10, opacity: 0.7 }}>▼</span>}
            </button>

            {/* Hold-picker dropdown */}
            {teamPickerOpen && multipleTeams && (
              <>
                <div onClick={() => setTeamPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 200,
                  background: 'var(--bg-card)', borderRadius: 12,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)', minWidth: 220, overflow: 'hidden',
                }}>
                  <div style={{ padding: '8px 16px 4px', fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Skift hold
                  </div>
                  {user!.teams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleTeamSwitch(t)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        width: '100%', textAlign: 'left',
                        padding: '10px 16px',
                        background: t.id === currentTeamId ? 'var(--accent-light)' : 'none',
                        color: t.id === currentTeamId ? 'var(--accent)' : 'var(--text)',
                        fontSize: 14,
                      }}
                    >
                      <span>{t.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ROLE_LABELS[t.role] ?? t.role}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Hamburger — kun synlig på desktop (mobil har hamburger i bundnav) */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{ background: 'none', padding: 8, fontSize: 20, color: 'var(--text2)' }}
          aria-label="Menu"
          className="desktop-hamburger"
        >
          ☰
        </button>
      </header>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 150 }}
          />
          <div style={{
            position: 'fixed', zIndex: 200,
            background: 'var(--bg-card)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            minWidth: 200,
            overflow: 'hidden',
          }} className="menu-dropdown">
            {/* Årshjul: kun mobil (desktop har det i topbar) */}
            <MenuItem to="/aarshjul" onClick={() => setMenuOpen(false)} className="mobile-only-item">Årshjul</MenuItem>
            {/* Tavle: kun mobil (desktop har det i topbar) */}
            <MenuItem to="/tavle" onClick={() => setMenuOpen(false)} className="mobile-only-item">
              Tavle{hasUnread && (
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--accent)', marginLeft: 7, verticalAlign: 'middle',
                }} />
              )}
            </MenuItem>
            {/* Arkiv: altid synlig */}
            <MenuItem to="/arkiv" onClick={() => setMenuOpen(false)}>Arkiv</MenuItem>
            {hasRole(user, 'team_manager', currentTeamRole) && (
              <MenuItem to="/holdindstillinger" onClick={() => setMenuOpen(false)}>Holdindstillinger</MenuItem>
            )}
            {hasRole(user, 'team_manager', currentTeamRole) && (
              <MenuItem to="/brugere" onClick={() => setMenuOpen(false)}>Brugere</MenuItem>
            )}
            {hasRole(user, 'admin', currentTeamRole) && (
              <MenuItem to="/admin" onClick={() => setMenuOpen(false)}>Admin</MenuItem>
            )}
            <MenuItem to="/profil" onClick={() => setMenuOpen(false)}>Profil</MenuItem>
            {/* Hold-switcher i hamburger-menu */}
            {user && user.teams.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
                <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>
                  {multipleTeams ? 'Skift hold' : 'Aktivt hold'}
                </div>
                {user.teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleTeamSwitch(t)}
                    disabled={!multipleTeams}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', textAlign: 'left',
                      padding: '10px 16px', background: t.id === currentTeamId ? 'var(--accent-light)' : 'none',
                      color: t.id === currentTeamId ? 'var(--accent)' : 'var(--text)',
                      fontSize: 14, cursor: multipleTeams ? 'pointer' : 'default',
                    }}
                  >
                    <span>{t.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ROLE_LABELS[t.role] ?? t.role}</span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={handleLogout}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '12px 16px', background: 'none',
                  color: 'var(--red)', fontSize: 14,
                }}
              >
                Log ud
              </button>
            </div>
          </div>
        </>
      )}

      {/* Indhold */}
      <main style={{ flex: 1, padding: '16px', paddingBottom: 'calc(var(--bottomnav-h) + 16px + env(safe-area-inset-bottom))' }}>
        {children}
      </main>

      {/* Bundnav (mobil) */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }} className="mobile-nav">
        {MOBILE_NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '8px 0',
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              fontSize: 10, fontWeight: 500, gap: 2,
              borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            })}
          >
            <span style={{ position: 'relative', fontSize: 20 }}>
              {item.icon}
              {item.showUnread && hasUnread && (
                <span style={{
                  position: 'absolute', top: 0, right: -2,
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--accent)', border: '1.5px solid var(--bg-card)',
                }} />
              )}
            </span>
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMenuOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '8px 0', background: 'none',
            color: menuOpen ? 'var(--accent)' : 'var(--text3)',
            fontSize: 10, fontWeight: 500, gap: 2,
            borderTop: menuOpen ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          <span style={{ fontSize: 20 }}>☰</span>
          Mere
        </button>
      </nav>

      <style>{`
        @media (min-width: 768px) {
          .mobile-nav { display: none !important; }
          main { padding-bottom: 16px !important; }
          .menu-dropdown {
            top: var(--topbar-h);
            right: 16px;
            border-radius: 12px;
          }
        }
        @media (max-width: 767px) {
          .desktop-nav { display: none !important; }
          .desktop-hamburger { display: none !important; }
          .menu-dropdown {
            left: 0;
            right: 0;
            bottom: calc(var(--bottomnav-h) + env(safe-area-inset-bottom));
            border-radius: 16px 16px 0 0;
            max-height: 75vh;
            overflow-y: auto;
          }
        }
        /* Skjul desktop-only items i mobil-hamburger (allerede i bundnav) */
        @media (max-width: 767px) {
          .mobile-only-item { display: block !important; }
        }
        /* Skjul mobil-only items i desktop-hamburger (allerede i topbar) */
        @media (min-width: 768px) {
          .mobile-only-item { display: none !important; }
        }
      `}</style>
    </div>
  );
}

function MenuItem({ to, onClick, children, className }: { to: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={className}
      style={({ isActive }) => ({
        display: 'block', padding: '12px 16px',
        background: isActive ? 'var(--accent-light)' : 'none',
        color: isActive ? 'var(--accent)' : 'var(--text)',
        fontSize: 14,
      })}
    >
      {children}
    </NavLink>
  );
}
