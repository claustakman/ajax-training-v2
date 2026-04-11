import { useAuth } from '../lib/auth';

export default function Trainings() {
  const { currentTeamId } = useAuth();

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 16px' }}>
        Træninger
      </h1>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        color: 'var(--text2)',
      }}>
        Team ID: {currentTeamId ?? '—'}<br />
        Træningsliste kommer her.
      </div>
    </div>
  );
}
