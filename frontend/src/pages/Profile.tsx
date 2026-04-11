import { useAuth } from '../lib/auth';

export default function Profile() {
  const { user } = useAuth();

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 16px' }}>
        Profil
      </h1>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <div style={{ marginBottom: 8 }}><strong>Navn:</strong> {user?.name}</div>
        <div style={{ marginBottom: 8 }}><strong>Email:</strong> {user?.email}</div>
        <div><strong>Rolle:</strong> {user?.role}</div>
      </div>
    </div>
  );
}
