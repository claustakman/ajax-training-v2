import { useState, useMemo, useRef, useCallback } from 'react';
import { EXERCISES } from '../lib/exerciseData';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export interface Exercise {
  id: string;
  name: string;
  description: string;
  catalog: string;
  tags: string[];
  age_groups: string[];
  stars: number;
  variants: string | null;
  link: string | null;
  default_mins: number | null;
  image_r2_key: string | null;
}

const HAL_TAGS = [
  'opvarmning', 'aflevering', 'skud', 'finter', 'forsvar', 'kontra',
  'keeper', 'sammenspil', 'beslutning', 'taktik', 'duel', 'kamp',
  'stafet', 'leg', 'styrke', 'hurtighed',
];
const FYS_TAGS = ['plyometrik', 'eksplosion', 'styrke', 'hurtighed', 'finter', 'opvarmning'];
const AGE_GROUPS = ['U9', 'U11', 'U13', 'U15', 'U17', 'U19'];
const ALL_TAGS = [...new Set([...HAL_TAGS, ...FYS_TAGS])];

function imageUrl(ex: Exercise) {
  if (!ex.image_r2_key) return null;
  const key = encodeURIComponent(ex.image_r2_key);
  return `${API_URL}/api/exercises/${encodeURIComponent(ex.id)}/image?key=${key}`;
}

// Resize billede client-side til max 800px JPEG 0.75
async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Resize fejl')), 'image/jpeg', 0.75);
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Hoved-komponent ────────────────────────────────────────────────────────

export default function Catalog() {
  const { user } = useAuth();
  const canEdit = hasRole(user, 'trainer');

  const [tab, setTab] = useState<'hal' | 'fys'>('hal');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAge, setSelectedAge] = useState('');
  const [starsOnly, setStarsOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Lokal state — starter med CSV-data, muteres ved CRUD
  const [exercises, setExercises] = useState<Exercise[]>(
    () => (EXERCISES as unknown as Exercise[])
  );

  const [editingEx, setEditingEx] = useState<Exercise | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const tags = tab === 'hal' ? HAL_TAGS : FYS_TAGS;

  const filtered = useMemo(() => {
    return exercises.filter(ex => {
      if (ex.catalog !== tab) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!ex.name.toLowerCase().includes(q) && !ex.description?.toLowerCase().includes(q)) return false;
      }
      if (selectedTags.length > 0) {
        if (!selectedTags.every(t => ex.tags.includes(t))) return false;
      }
      if (selectedAge) {
        if (ex.age_groups.length > 0 && !ex.age_groups.includes(selectedAge)) return false;
      }
      if (starsOnly && ex.stars === 0) return false;
      return true;
    });
  }, [exercises, tab, search, selectedTags, selectedAge, starsOnly]);

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function clearFilters() {
    setSearch(''); setSelectedTags([]); setSelectedAge(''); setStarsOnly(false);
  }

  function handleSaved(ex: Exercise) {
    setExercises(prev => {
      const idx = prev.findIndex(e => e.id === ex.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = ex; return next; }
      return [...prev, ex];
    });
    setEditingEx(null);
    setIsCreating(false);
  }

  function handleDeleted(id: string) {
    setExercises(prev => prev.filter(e => e.id !== id));
    setEditingEx(null);
    setExpanded(null);
  }

  const hasFilters = search || selectedTags.length > 0 || selectedAge || starsOnly;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, margin: 0 }}>
          Øvelseskatalog
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>{filtered.length} øvelser</span>
          {canEdit && (
            <button
              onClick={() => { setIsCreating(true); setEditingEx({ id: '', name: '', description: '', catalog: tab, tags: [], age_groups: [], stars: 0, variants: null, link: null, default_mins: null, image_r2_key: null }); }}
              style={{ padding: '7px 14px', background: 'var(--accent)', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 13 }}
            >
              + Ny øvelse
            </button>
          )}
        </div>
      </div>

      {/* Subtabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-input)', borderRadius: 10, padding: 4 }}>
        {(['hal', 'fys'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSelectedTags([]); }}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 600, fontSize: 14, background: tab === t ? 'var(--bg-card)' : 'transparent', color: tab === t ? 'var(--accent)' : 'var(--text2)', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            {t === 'hal' ? '🤾 Haltræning' : '💪 Fysisk'}
          </button>
        ))}
      </div>

      {/* Søgning */}
      <input type="search" placeholder="Søg øvelse…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', marginBottom: 12, background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 10, fontSize: 16, color: 'var(--text)', boxSizing: 'border-box' }} />

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {tags.map(tag => (
          <button key={tag} onClick={() => toggleTag(tag)}
            style={{ padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500, background: selectedTags.includes(tag) ? 'var(--accent)' : 'var(--bg-card)', color: selectedTags.includes(tag) ? '#fff' : 'var(--text2)', border: `1px solid ${selectedTags.includes(tag) ? 'var(--accent)' : 'var(--border2)'}` }}>
            {tag}
          </button>
        ))}
      </div>

      {/* Aldersgruppe + stjerner */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <select value={selectedAge} onChange={e => setSelectedAge(e.target.value)}
          style={{ padding: '0 12px', height: 36, borderRadius: 8, fontSize: 14, background: 'var(--bg-card)', border: '1px solid var(--border2)', color: selectedAge ? 'var(--text)' : 'var(--text3)' }}>
          <option value="">Alle aldersgrupper</option>
          {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <button onClick={() => setStarsOnly(o => !o)}
          style={{ height: 36, padding: '0 12px', borderRadius: 8, fontSize: 14, background: starsOnly ? 'var(--accent-light)' : 'var(--bg-card)', color: starsOnly ? 'var(--accent)' : 'var(--text2)', border: `1px solid ${starsOnly ? 'var(--accent)' : 'var(--border2)'}` }}>
          ⭐ Favoritter
        </button>
        {hasFilters && (
          <button onClick={clearFilters} style={{ height: 36, padding: '0 12px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text3)', border: '1px solid var(--border)' }}>
            Ryd filtre
          </button>
        )}
      </div>

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text3)' }}>
            Ingen øvelser matcher søgningen
          </div>
        )}
        {filtered.map(ex => (
          <ExerciseCard key={ex.id} ex={ex}
            isExpanded={expanded === ex.id}
            onToggle={() => setExpanded(prev => prev === ex.id ? null : ex.id)}
            canEdit={canEdit}
            onEdit={() => { setEditingEx(ex); setIsCreating(false); }}
          />
        ))}
      </div>

      {/* Editor modal */}
      {editingEx && (
        <ExerciseEditor
          ex={editingEx}
          isNew={isCreating}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => { setEditingEx(null); setIsCreating(false); }}
        />
      )}
    </div>
  );
}

// ─── Øvelseskort ─────────────────────────────────────────────────────────────

function ExerciseCard({ ex, isExpanded, onToggle, canEdit, onEdit }: {
  ex: Exercise; isExpanded: boolean; onToggle: () => void; canEdit: boolean; onEdit: () => void;
}) {
  const imgUrl = imageUrl(ex);

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px', background: 'none', textAlign: 'left' }}>
        {/* Thumbnail */}
        {imgUrl && (
          <img src={imgUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
        )}
        {ex.stars > 0 && <span style={{ fontSize: 14, flexShrink: 0 }}>{'⭐'.repeat(Math.min(ex.stars, 3))}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>{ex.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ex.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, background: 'var(--bg-input)', color: 'var(--text2)' }}>{tag}</span>
            ))}
            {ex.age_groups.length > 0 && (
              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, background: 'var(--accent-light)', color: 'var(--accent)' }}>{ex.age_groups.join('/')}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {ex.default_mins && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{ex.default_mins} min</span>}
          <span style={{ fontSize: 12, color: 'var(--text3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </div>
      </button>

      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {/* Stort billede */}
          {imgUrl && (
            <img src={imgUrl} alt={ex.name} style={{ width: '100%', maxHeight: 260, objectFit: 'contain', background: '#f8f8f8' }} />
          )}
          <div style={{ padding: '12px 16px 16px' }}>
            {ex.description && (
              <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{ex.description}</p>
            )}
            {ex.variants && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>Varianter</div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text2)', whiteSpace: 'pre-wrap' }}>{ex.variants}</p>
              </div>
            )}
            {ex.link && (
              <a href={ex.link} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12, fontSize: 13, color: 'var(--blue)' }}>
                🔗 Se video/øvelse
              </a>
            )}
            {canEdit && (
              <button onClick={e => { e.stopPropagation(); onEdit(); }}
                style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'var(--bg-input)', color: 'var(--text2)', border: '1px solid var(--border2)' }}>
                Rediger
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Øvelses-editor modal ─────────────────────────────────────────────────────

function ExerciseEditor({ ex, isNew, onSaved, onDeleted, onClose }: {
  ex: Exercise; isNew: boolean; onSaved: (ex: Exercise) => void;
  onDeleted: (id: string) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Exercise>({ ...ex });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [imgPreview, setImgPreview] = useState<string | null>(ex.image_r2_key ? imageUrl(ex) : null);
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof Exercise, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  async function handleImageFile(file: File) {
    try {
      const blob = await resizeImage(file);
      setImgBlob(blob);
      setImgPreview(URL.createObjectURL(blob));
      setForm(f => ({ ...f, image_r2_key: 'pending' }));
    } catch { setError('Kunne ikke læse billedet'); }
  }

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (item) { const file = item.getAsFile(); if (file) handleImageFile(file); }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) handleImageFile(file);
  }, []);

  async function handleAiDescription() {
    if (!form.name.trim()) { setError('Skriv et navn først'); return; }
    setAiLoading(true); setError('');
    try {
      const tags = form.tags.length > 0 ? `Tags: ${form.tags.join(', ')}. ` : '';
      const catalog = form.catalog === 'hal' ? 'håndbold haltræning' : 'håndbold fysisk træning';
      const prompt = `Du er træner i Ajax håndbold og skal skrive en kort, præcis beskrivelse af følgende ${catalog}-øvelse til brug i en træningsplanlægger.\n\nØvelse: "${form.name}"\n${tags}${form.age_groups.length > 0 ? `Aldersgruppe: ${form.age_groups.join(', ')}. ` : ''}\n\nSkriv 2-4 sætninger der beskriver:\n1. Hvad spillerne gør\n2. Hvad øvelsen træner\n\nVær konkret og praktisk. Brug dansk. Ingen overskrift, ingen punktlister — kun løbende tekst.`;
      const res = await api.post<{ text: string }>('/api/ai/suggest', { prompt });
      set('description', res.text.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'AI fejlede');
    } finally { setAiLoading(false); }
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Navn er påkrævet'); return; }
    setSaving(true); setError('');
    try {
      let savedId = form.id;

      if (isNew) {
        const res = await api.post<{ id: string }>('/api/exercises', {
          name: form.name, description: form.description, catalog: form.catalog,
          tags: form.tags, age_groups: form.age_groups, stars: form.stars,
          variants: form.variants, link: form.link, default_mins: form.default_mins,
        });
        savedId = res.id;
      } else {
        await api.patch(`/api/exercises/${form.id}`, {
          name: form.name, description: form.description, catalog: form.catalog,
          tags: form.tags, age_groups: form.age_groups, stars: form.stars,
          variants: form.variants, link: form.link, default_mins: form.default_mins,
        });
      }

      // Upload billede hvis nyt
      if (imgBlob && savedId) {
        const fd = new FormData();
        fd.append('image', imgBlob, 'image.jpg');
        await api.upload(`/api/exercises/${savedId}/image`, fd);
      }

      onSaved({ ...form, id: savedId, image_r2_key: imgBlob ? 'uploaded' : form.image_r2_key });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gem fejlede');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`Slet "${form.name}"?`)) return;
    setDeleting(true);
    try {
      await api.delete(`/api/exercises/${form.id}`);
      onDeleted(form.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Slet fejlede');
    } finally { setDeleting(false); }
  }

  function toggleArrItem(key: 'tags' | 'age_groups', val: string) {
    setForm(f => ({
      ...f,
      [key]: (f[key] as string[]).includes(val)
        ? (f[key] as string[]).filter(x => x !== val)
        : [...(f[key] as string[]), val],
    }));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', padding: 24, maxHeight: '92dvh', overflowY: 'auto' }}
        onPaste={onPaste}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontWeight: 700, margin: 0 }}>
            {isNew ? 'Ny øvelse' : 'Rediger øvelse'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', fontSize: 20, color: 'var(--text3)', padding: 4 }}>✕</button>
        </div>

        {error && <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '10px 12px', color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Katalog */}
          <div>
            <Label>Katalog</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['hal', 'fys'] as const).map(c => (
                <button key={c} onClick={() => set('catalog', c)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, background: form.catalog === c ? 'var(--accent)' : 'var(--bg-input)', color: form.catalog === c ? '#fff' : 'var(--text2)', border: 'none' }}>
                  {c === 'hal' ? '🤾 Hal' : '💪 Fysisk'}
                </button>
              ))}
            </div>
          </div>

          {/* Navn */}
          <div>
            <Label>Navn *</Label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              style={inputStyle} placeholder="Øvelsens navn" />
          </div>

          {/* Beskrivelse */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>Beskrivelse</div>
              <button onClick={handleAiDescription} disabled={aiLoading}
                style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: aiLoading ? 'var(--bg-input)' : 'var(--accent-light)', color: aiLoading ? 'var(--text3)' : 'var(--accent)', border: `1px solid ${aiLoading ? 'var(--border)' : 'var(--accent)'}` }}>
                {aiLoading ? '⏳ Genererer…' : '✨ Generer med AI'}
              </button>
            </div>
            <textarea value={form.description ?? ''} onChange={e => set('description', e.target.value)}
              rows={4} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Beskriv øvelsen…" />
          </div>

          {/* Varianter */}
          <div>
            <Label>Varianter</Label>
            <textarea value={form.variants ?? ''} onChange={e => set('variants', e.target.value || null)}
              rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Varianter og progressioner…" />
          </div>

          {/* Tags */}
          <div>
            <Label>Tags</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ALL_TAGS.map(tag => (
                <button key={tag} onClick={() => toggleArrItem('tags', tag)}
                  style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: form.tags.includes(tag) ? 'var(--accent)' : 'var(--bg-input)', color: form.tags.includes(tag) ? '#fff' : 'var(--text2)', border: `1px solid ${form.tags.includes(tag) ? 'var(--accent)' : 'var(--border2)'}` }}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Aldersgrupper */}
          <div>
            <Label>Aldersgrupper</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AGE_GROUPS.map(ag => (
                <button key={ag} onClick={() => toggleArrItem('age_groups', ag)}
                  style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: form.age_groups.includes(ag) ? 'var(--accent)' : 'var(--bg-input)', color: form.age_groups.includes(ag) ? '#fff' : 'var(--text2)', border: `1px solid ${form.age_groups.includes(ag) ? 'var(--accent)' : 'var(--border2)'}` }}>
                  {ag}
                </button>
              ))}
            </div>
          </div>

          {/* Stjerner + minutter */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Label>Stjerner</Label>
              <StarRating value={form.stars} onChange={n => set('stars', n)} />
            </div>
            <div style={{ flex: 1 }}>
              <Label>Vejl. minutter</Label>
              <input type="number" min={1} max={60} value={form.default_mins ?? ''} onChange={e => set('default_mins', e.target.value ? parseInt(e.target.value) : null)}
                style={inputStyle} placeholder="fx 10" />
            </div>
          </div>

          {/* Link */}
          <div>
            <Label>Link (video/øvelse)</Label>
            <input type="url" value={form.link ?? ''} onChange={e => set('link', e.target.value || null)}
              style={inputStyle} placeholder="https://…" />
          </div>

          {/* Billede */}
          <div>
            <Label>Illustration</Label>
            <div ref={dropRef}
              onDrop={onDrop} onDragOver={e => e.preventDefault()}
              style={{ border: '2px dashed var(--border2)', borderRadius: 12, padding: 16, textAlign: 'center', background: 'var(--bg-input)', cursor: 'pointer' }}
              onClick={() => fileInputRef.current?.click()}>
              {imgPreview ? (
                <div>
                  <img src={imgPreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'contain' }} />
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Klik eller træk for at skifte • Paste virker også</div>
                </div>
              ) : (
                <div style={{ color: 'var(--text3)', fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
                  Klik, træk eller <strong>paste</strong> et billede ind
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }} />
          </div>

          {/* Knapper */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
            {!isNew && (
              <button onClick={handleDelete} disabled={deleting}
                style={{ padding: '11px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500, background: 'rgba(220,38,38,0.08)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.2)' }}>
                {deleting ? 'Sletter…' : 'Slet'}
              </button>
            )}
            <button onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 8, fontSize: 14, fontWeight: 500, background: 'var(--bg-input)', color: 'var(--text2)', border: 'none' }}>
              Annuller
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ flex: 2, padding: '11px 0', borderRadius: 8, fontSize: 14, fontWeight: 600, background: saving ? 'var(--text3)' : 'var(--accent)', color: '#fff', border: 'none' }}>
              {saving ? 'Gemmer…' : isNew ? 'Opret øvelse' : 'Gem ændringer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>{children}</div>;
}

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 44 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(value === n ? 0 : n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{ background: 'none', padding: '2px 3px', fontSize: 22, lineHeight: 1, opacity: n <= (hover || value) ? 1 : 0.25, transition: 'opacity 0.1s' }}
          title={`${n} stjerne${n > 1 ? 'r' : ''}`}
        >
          ⭐
        </button>
      ))}
      {value > 0 && (
        <button onClick={() => onChange(0)} style={{ background: 'none', fontSize: 12, color: 'var(--text3)', padding: '2px 4px' }}>
          ✕
        </button>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'var(--bg-input)',
  border: '1px solid var(--border2)', borderRadius: 8, fontSize: 16,
  color: 'var(--text)', boxSizing: 'border-box', minHeight: 44,
};
