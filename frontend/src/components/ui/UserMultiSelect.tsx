// Delte komponenter: Chip + UserMultiSelect (chips + dropdown med holdets brugere).
// Bruges af TrainingEditor og EventSheet (kampe/stævner).

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  borderRadius: 8, padding: '9px 16px', fontSize: 15, color: 'var(--text)',
  minHeight: 40, width: '100%', boxSizing: 'border-box',
};

// ─── Chip ────────────────────────────────────────────────────────────────────
export function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: 'var(--accent-light)', color: 'var(--accent)',
      borderRadius: 20, padding: '3px 10px', fontSize: 13, fontWeight: 500,
    }}>
      {label}
      {onRemove && (
        <button onClick={onRemove} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--accent)', padding: 0, lineHeight: 1, fontSize: 15,
        }}>×</button>
      )}
    </span>
  );
}

// ─── Bruger-multi-valg (chips + dropdown) ────────────────────────────────────
export function UserMultiSelect({
  selected,
  onChange,
  members,
  disabled,
  addLabel = '+ Tilføj træner…',
}: {
  selected: string[];
  onChange: (names: string[]) => void;
  members: { id: string; name: string }[];
  disabled?: boolean;
  addLabel?: string;
}) {
  const available = members.filter(m => !selected.includes(m.name));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {selected.map(name => (
          <Chip
            key={name}
            label={name}
            onRemove={disabled ? undefined : () => onChange(selected.filter(n => n !== name))}
          />
        ))}
      </div>
      {!disabled && available.length > 0 && (
        <select
          value=""
          onChange={e => {
            if (e.target.value) onChange([...selected, e.target.value]);
          }}
          style={{ ...inputStyle, color: selected.length > 0 ? 'var(--text2)' : 'var(--text)' }}
        >
          <option value="">{addLabel}</option>
          {available.map(m => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}
