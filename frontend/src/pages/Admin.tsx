import { useAuth, hasRole } from '../lib/auth';
import { Navigate } from 'react-router-dom';

export default function Admin() {
  const { user } = useAuth();

  if (!hasRole(user, 'admin')) return <Navigate to="/" replace />;

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 16px' }}>
        Admin
      </h1>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        color: 'var(--text2)',
      }}>
        Brugere, hold og indstillinger kommer her.
      </div>
    </div>
  );
}
