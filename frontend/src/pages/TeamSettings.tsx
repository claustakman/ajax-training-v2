import { useState, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, hasRole } from '../lib/auth';
import { api, ApiError } from '../lib/api';

interface SectionType {
  id: string;
  label: string;
  color: string;
  tags: string[];
  themes: string[];
  required: number; // D1 returns integer
  sort_order: number;
  team_id: string | null;
}


const PRESET_COLORS = [
  '#22c55e', '#3b82f6', '#C8102E', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#f59e0b',
  '#14b8a6', '#6366f1', '#84cc16', '#ef4444',
];

export default function TeamSettings() {
  const { user, currentTeamId, currentTeamRole } = useAuth();
  if (!hasRole(user, 'team_manager', currentTeamRole)) return <Navigate to="/" replace />;

  const [sectionTypes, setSectionTypes] = useState<SectionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SectionType | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [quarterThemes, setQuarterThemes] = useState<string[]>([]);

  // Drag state
  const dragIdx = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    if (!currentTeamId) return;
    setLoading(true);
    Promise.all([
      api.get<SectionType[]>(`/api/section-types?team_id=${currentTeamId}`),
      api.get<string[]>('/api/exercises/tags').catch(() => []),
      api.get<Array<{ themes: string[] }>>(`/api/quarters?team_id=${currentTeamId}`),
    ]).then(async ([st, tags, quarters]) => {
      // If we got global defaults (team_id=null), copy them to this team so all edits are team-scoped
      const isGlobal = st.length > 0 && st[0].team_id === null;
      if (isGlobal) {
        const copies = await Promise.all(st.map((s, i) =>
          api.post<{ id: string }>('/api/section-types', {
            label: s.label, color: s.color, tags: s.tags, themes: s.themes,
            required: s.required === 1, sort_order: i + 1, team_id: currentTeamId,
          }).then(r => ({ ...s, id: r.id, team_id: currentTeamId }))
          .catch(() => ({ ...s, team_id: currentTeamId }))
        ));
        setSectionTypes(copies);
      } else {
        setSectionTypes(st);
      }
      setAllTags([...new Set(tags)].sort());
      const themes = new Set<string>();
      for (const q of quarters) for (const t of q.themes) if (t) themes.add(t);
      setQuarterThemes([...themes].sort());
    }).catch(() => {/* ignore */})
      .finally(() => setLoading(false));
  }, [currentTeamId]);

  function openNew() {
    setEditTarget(null);
    setModalOpen(true);
  }

  function openEdit(st: SectionType) {
    setEditTarget(st);
    setModalOpen(true);
  }

  async function handleSave(data: {
    label: string; color: string; tags: string[]; themes: string[]; required: boolean;
  }) {
    if (!currentTeamId) return;
    if (editTarget) {
      // PATCH
      const updated: SectionType = {
        ...editTarget,
        ...data,
        required: data.required ? 1 : 0,
      };
      setSectionTypes(prev => prev.map(s => s.id === editTarget.id ? updated : s));
      try {
        await api.patch(`/api/section-types/${editTarget.id}?team_id=${currentTeamId}`, data);
      } catch {
        setSectionTypes(prev => prev.map(s => s.id === editTarget.id ? editTarget : s));
      }
    } else {
      // POST
      try {
        const result = await api.post<{ id: string }>('/api/section-types', {
          ...data,
          required: data.required,
          sort_order: sectionTypes.length + 1,
          team_id: currentTeamId,
        });
        const newSt: SectionType = {
          id: result.id,
          label: data.label,
          color: data.color,
          tags: data.tags,
          themes: data.themes,
          required: data.required ? 1 : 0,
          sort_order: sectionTypes.length + 1,
          team_id: currentTeamId,
        };
        setSectionTypes(prev => [...prev, newSt]);
      } catch (err) {
        alert(err instanceof ApiError ? err.message : 'Opret fejlede');
      }
    }
    setModalOpen(false);
  }

  async function handleDelete(st: SectionType) {
    if (!confirm(`Slet sektionstypen "${st.label}"?`)) return;
    setSectionTypes(prev => prev.filter(s => s.id !== st.id));
    try {
      await api.delete(`/api/section-types/${st.id}?team_id=${currentTeamId}`);
    } catch {
      // revert
      setSectionTypes(prev => {
        const copy = [...prev];
        copy.push(st);
        return copy.sort((a, b) => a.sort_order - b.sort_order);
      });
    }
  }

  // Drag-to-reorder
  function handleDragStart(idx: number) {
    dragIdx.current = idx;
  }

  function handleDragEnter(idx: number) {
    setDragOver(idx);
  }

  async function handleDrop(targetIdx: number) {
    const fromIdx = dragIdx.current;
    if (fromIdx === null || fromIdx === targetIdx) { setDragOver(null); return; }
    const reordered = [...sectionTypes];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(targetIdx, 0, moved);
    setSectionTypes(reordered);
    setDragOver(null);
    dragIdx.current = null;
    // persist
    try {
      await api.put('/api/section-types/reorder', {
        team_id: currentTeamId,
        order: reordered.map(s => s.id),
      });
    } catch {/* ignore */}
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 20px' }}>Holdindstillinger</h1>
        <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, color: 'var(--text3)' }}>Henter…</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: '0 0 20px' }}>Holdindstillinger</h1>

      {/* Section types */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Sektionstyper</div>
          <button
            onClick={openNew}
            style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
          >
            + Ny type
          </button>
        </div>

        {sectionTypes.length === 0 && (
          <div style={{ fontSize: 14, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>
            Ingen sektionstyper endnu. Hold har globale standardtyper.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sectionTypes.map((st, idx) => (
            <div
              key={st.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragOver(null); dragIdx.current = null; }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px',
                borderRadius: 10,
                background: dragOver === idx ? 'var(--accent-light)' : 'var(--bg-input)',
                border: `1px solid ${dragOver === idx ? 'var(--accent)' : 'var(--border2)'}`,
                borderLeft: `4px solid ${st.color}`,
                cursor: 'grab',
                transition: 'background 0.15s',
              }}
            >
              {/* Drag handle */}
              <span style={{ color: 'var(--text3)', fontSize: 14, flexShrink: 0 }}>⠿</span>

              {/* Color dot */}
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                background: st.color, flexShrink: 0,
              }} />

              {/* Label */}
              <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{st.label}</span>

              {/* Required badge */}
              {st.required === 1 && (
                <span style={{
                  fontSize: 11, color: 'var(--text3)',
                  background: 'var(--bg-card)',
                  padding: '2px 8px', borderRadius: 20,
                  border: '1px solid var(--border2)',
                }}>Påkrævet</span>
              )}

              {/* Tags */}
              {st.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {st.tags.slice(0, 3).map(t => (
                    <span key={t} style={{
                      fontSize: 11, padding: '2px 6px',
                      background: `${st.color}20`, color: st.color,
                      borderRadius: 12,
                    }}>{t}</span>
                  ))}
                  {st.tags.length > 3 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>+{st.tags.length - 3}</span>}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => openEdit(st)}
                  style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, background: 'var(--bg-card)', color: 'var(--text2)', border: '1px solid var(--border2)' }}
                >
                  Rediger
                </button>
                <button
                  onClick={() => handleDelete(st)}
                  style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, background: 'rgba(220,38,38,0.08)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.2)' }}
                >
                  Slet
                </button>
              </div>
            </div>
          ))}
        </div>

        {sectionTypes.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, textAlign: 'center' }}>
            Træk for at ændre rækkefølge
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <SectionTypeModal
          initial={editTarget}
          allTags={allTags}
          quarterThemes={quarterThemes}
          onSave={handleSave}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial: SectionType | null;
  allTags: string[];
  quarterThemes: string[];
  onSave: (data: { label: string; color: string; tags: string[]; themes: string[]; required: boolean }) => void;
  onClose: () => void;
}

function SectionTypeModal({ initial, allTags, quarterThemes, onSave, onClose }: ModalProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [color, setColor] = useState(initial?.color ?? '#3b82f6');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [themes, setThemes] = useState<string[]>(initial?.themes ?? []);
  const [required, setRequired] = useState(initial ? initial.required === 1 : false);
  const [customColor, setCustomColor] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function toggleTheme(t: string) {
    setThemes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function handleSubmit() {
    if (!label.trim()) return;
    setSaving(true);
    await onSave({ label: label.trim(), color, tags, themes, required });
    setSaving(false);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)' }}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', zIndex: 400,
        transform: 'translate(-50%, -50%)',
        background: 'var(--bg-card)',
        borderRadius: 16,
        padding: 24,
        width: 'min(520px, calc(100vw - 32px))',
        maxHeight: 'calc(100dvh - 64px)',
        overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 20 }}>
          {initial ? 'Rediger sektionstype' : 'Ny sektionstype'}
        </div>

        {/* Label */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Navn</label>
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="fx Opvarmning"
            style={{
              width: '100%', padding: '9px 12px',
              background: 'var(--bg-input)', border: '1px solid var(--border2)',
              borderRadius: 8, fontSize: 15, color: 'var(--text)',
              minHeight: 44, boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Color */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Farve</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); setCustomColor(false); }}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: c,
                  border: color === c && !customColor ? '3px solid var(--text)' : '2px solid transparent',
                  flexShrink: 0,
                }}
                title={c}
              />
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="color"
                value={color}
                onChange={e => { setColor(e.target.value); setCustomColor(true); }}
                style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 0 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>Andet</span>
            </label>
            {/* Preview */}
            <span style={{
              marginLeft: 'auto', padding: '4px 12px',
              background: color, color: '#fff',
              borderRadius: 20, fontSize: 12, fontWeight: 600,
            }}>{label || 'Preview'}</span>
          </div>
        </div>

        {/* Tags */}
        {allTags.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
              Tags <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(øvelses-filter)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allTags.map(t => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 13,
                    background: tags.includes(t) ? color : 'var(--bg-input)',
                    color: tags.includes(t) ? '#fff' : 'var(--text2)',
                    border: `1px solid ${tags.includes(t) ? color : 'var(--border2)'}`,
                    fontWeight: tags.includes(t) ? 600 : 400,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Themes */}
        {quarterThemes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, display: 'block', marginBottom: 6 }}>
              Temaer <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(fra årshjul)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {quarterThemes.map(t => (
                <button
                  key={t}
                  onClick={() => toggleTheme(t)}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 13,
                    background: themes.includes(t) ? color : 'var(--bg-input)',
                    color: themes.includes(t) ? '#fff' : 'var(--text2)',
                    border: `1px solid ${themes.includes(t) ? color : 'var(--border2)'}`,
                    fontWeight: themes.includes(t) ? 600 : 400,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Required toggle */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div
              onClick={() => setRequired(r => !r)}
              style={{
                width: 40, height: 22, borderRadius: 11,
                background: required ? 'var(--accent)' : 'var(--border2)',
                position: 'relative', transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2, left: required ? 20 : 2,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontSize: 14, color: 'var(--text2)' }}>Påkrævet i alle træninger</span>
          </label>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '9px 18px', borderRadius: 8, fontSize: 14, background: 'var(--bg-input)', color: 'var(--text2)' }}
          >
            Annuller
          </button>
          <button
            onClick={handleSubmit}
            disabled={!label.trim() || saving}
            style={{
              padding: '9px 18px', borderRadius: 8, fontSize: 14,
              background: label.trim() && !saving ? 'var(--accent)' : 'var(--text3)',
              color: '#fff', fontWeight: 600,
            }}
          >
            {saving ? 'Gemmer…' : initial ? 'Gem ændringer' : 'Opret'}
          </button>
        </div>
      </div>
    </>
  );
}
