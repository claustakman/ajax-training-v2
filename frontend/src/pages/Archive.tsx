export default function Archive() {
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 16px' }}>
        Arkiv
      </h1>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        color: 'var(--text2)',
      }}>
        Arkiverede træninger kommer her.
      </div>
    </div>
  );
}
