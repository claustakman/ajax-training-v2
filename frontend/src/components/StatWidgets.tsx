// Delte statistik-widgets — bruges af Statistik træning og Statistik udvælgelse.

// "Mads Holm Hansen" → "Mads H."
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length < 2 ? full : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/** Tilføjer label "Fornavn E." — fuldt navn hvis to personer ville få samme forkortelse */
export function withShortLabels<T extends { name: string }>(rows: T[]): (T & { label: string })[] {
  const shortCount = new Map<string, number>();
  for (const r of rows) shortCount.set(shortName(r.name), (shortCount.get(shortName(r.name)) ?? 0) + 1);
  return rows.map(r => ({ ...r, label: shortCount.get(shortName(r.name))! > 1 ? r.name : shortName(r.name) }));
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

export function Empty({ text }: { text: string }) {
  return (
    <div style={{ color: 'var(--text3)', fontSize: 14, padding: '8px 0' }}>{text}</div>
  );
}

/**
 * Søjler pr. person — sorteret af kalderen.
 * Lodret stiplet markør ved `total` (fx antal afholdte træninger/spillede kampe) med `markerLabel`.
 * Uden total vises ingen markør og ingen %.
 */
export function AttendanceChart({ rows, total, color = 'var(--green)', markerLabel = 'afholdt' }: {
  rows: { name: string; label: string; count: number }[];
  total?: number;
  color?: string;
  markerLabel?: string;
}) {
  const LABEL_W = 110, VALUE_W = total ? 76 : 36, GAP = 10;
  const showMarker = !!total && total > 0;
  // Lidt luft efter markøren så den ikke flugter med kanten
  const max = Math.max(total ?? 0, ...rows.map(r => r.count), 1) * (showMarker ? 1.15 : 1);
  const markerPct = showMarker ? (total! / max) * 100 : 0;
  return (
    <div style={{ position: 'relative', paddingTop: showMarker ? 20 : 0 }}>
      {showMarker && (
        // Markør: spænder over søjleområdet
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W + GAP, right: VALUE_W + GAP, pointerEvents: 'none', zIndex: 1 }}>
          <div style={{ position: 'absolute', left: `${markerPct}%`, top: 16, bottom: 0, borderLeft: '2px dashed var(--accent)' }} />
          <div style={{
            position: 'absolute', left: `${markerPct}%`, top: 0, transform: 'translateX(-50%)',
            fontSize: 11, fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap',
          }}>
            {total} {markerLabel}
          </div>
        </div>
      )}
      {rows.map((r, i) => {
        const share = total ? r.count / total : 0;
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
              <div style={{ width: r.count > 0 ? `${Math.max(2, (r.count / max) * 100)}%` : 0, background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ width: VALUE_W, fontSize: 13, color: 'var(--text)', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
              <span style={{ fontWeight: 600 }}>{r.count}</span>
              {total ? <span style={{ color: 'var(--text3)', marginLeft: 6 }}>{Math.round(share * 100)}%</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
