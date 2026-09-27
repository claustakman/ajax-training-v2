/**
 * StationBlockModal — konfigurer en stationsblok i en sektion.
 * Åbnes fra SectionBlock ved klik på "Stationer"-knap eller blok-header.
 */

import { useState } from 'react';
import type { StationBlock, SectionExercise } from '../lib/types';

const inputSm: React.CSSProperties = {
  background: 'var(--bg-input)', border: '1px solid var(--border2)',
  borderRadius: 6, padding: '5px 8px', fontSize: 16, color: 'var(--text)',
  width: '100%', boxSizing: 'border-box', minHeight: 34,
};

export default function StationBlockModal({
  blockId,
  block,
  exercises,
  onSave,
  onDelete,
  onClose,
}: {
  blockId: string;
  block: StationBlock;
  exercises: SectionExercise[];
  onSave: (patch: StationBlock) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [rotate, setRotate] = useState(block.rotate);
  const [mins, setMins] = useState(block.mins ?? 5);


  function handleSave() {
    onSave({ rotate, mins });
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="modal-sheet"
        style={{
          background: 'var(--bg-card)', borderRadius: 16, padding: 24,
          width: '100%', maxWidth: 400, maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700 }}>
            Stationsblok
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: 'var(--text2)', minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >×</button>
        </div>

        {/* Type */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Type</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setRotate(true)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: rotate ? '#2563eb' : 'var(--bg-input)',
                color: rotate ? '#fff' : 'var(--text2)',
                border: `1px solid ${rotate ? '#2563eb' : 'var(--border2)'}`,
                cursor: 'pointer',
              }}
            >🔁 Rotation</button>
            <button
              onClick={() => setRotate(false)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: !rotate ? '#2563eb' : 'var(--bg-input)',
                color: !rotate ? '#fff' : 'var(--text2)',
                border: `1px solid ${!rotate ? '#2563eb' : 'var(--border2)'}`,
                cursor: 'pointer',
              }}
            >🔀 Opdelt</button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
            {rotate
              ? 'Holdene roterer rundt til alle stationer'
              : 'Holdene roterer ikke, men grupper laver forskellige øvelser parallelt, fx. efter niveau'}
          </div>
        </div>

        {/* Tid */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
            Samlet tid
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              value={mins}
              onChange={e => setMins(Math.max(1, Number(e.target.value) || 1))}
              min={1}
              style={{ ...inputSm, width: 70, textAlign: 'center' }}
            />
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>min</span>
          </div>
        </div>

        {/* Handlinger */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { onDelete(); onClose(); }}
            style={{
              background: 'none', border: '1px solid var(--border2)',
              borderRadius: 8, padding: '12px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--red)',
            }}
          >Fjern blok</button>
          <button
            onClick={handleSave}
            style={{
              flex: 1, background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '12px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >Gem</button>
        </div>
      </div>
    </div>
  );
}
