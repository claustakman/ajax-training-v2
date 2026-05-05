import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAuth, hasRole } from '../lib/auth';
import { api } from '../lib/api';
import TagInput from '../components/ui/TagInput';

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
  created_by: string | null;
  created_by_email: string | null;
  created_at: string | null;
}

const HAL_TAGS = [
  'opvarmning', 'aflevering', 'skud', 'finter', 'forsvar', 'kontra',
  'sammenspil', 'beslutning', 'taktik', 'duel', 'kamp',
  'stafet', 'leg', 'returløb', 'småspil', 'tvekamp',
];
const FYS_TAGS = ['plyometrik', 'eksplosion', 'styrke', 'hurtighed', 'finter', 'opvarmning'];
const KEEPER_TAGS = ['keeper', 'teknik', 'aflevering', 'skud', 'forsvar'];

// Tags der placerer en øvelse under Fysisk-tab
const FYS_TAB_TAGS = new Set(['plyometrik', 'styrke', 'eksplosion', 'hurtighed']);
const AGE_GROUPS = ['U9', 'U11', 'U13', 'U15', 'U17', 'U19'];

type SortOrder = 'newest' | 'oldest' | 'name';

function imageUrl(ex: Exercise) {
  if (!ex.image_r2_key) return null;
  const key = encodeURIComponent(ex.image_r2_key);
  return `${API_URL}/api/exercises/${encodeURIComponent(ex.id)}/image?key=${key}`;
}

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

function formatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Hoved-komponent ────────────────────────────────────────────────────────

export default function Catalog() {
  const { user, currentTeamRole } = useAuth();
  const canEdit = hasRole(user, 'trainer', currentTeamRole);
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<'hal' | 'fys' | 'keeper'>('hal');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAge, setSelectedAge] = useState('');
  const [starsOnly, setStarsOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('name');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [editingEx, setEditingEx] = useState<Exercise | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get<Exercise[]>('/api/exercises')
      .then(data => setExercises(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tags = tab === 'hal' ? HAL_TAGS : tab === 'fys' ? FYS_TAGS : KEEPER_TAGS;

  const filtered = useMemo(() => {
    let list = exercises.filter(ex => {
      if (tab === 'keeper') {
        // Keeper-tab: skal have keeper-tag
        if (!ex.tags.includes('keeper')) return false;
      } else if (tab === 'fys') {
        // Fysisk-tab: skal have mindst ét fys-tag
        if (!ex.tags.some(t => FYS_TAB_TAGS.has(t))) return false;
      } else {
        // Hal-tab: alle øvelser undtagen dem der udelukkende er keeper
        if (ex.tags.includes('keeper') && ex.tags.every(t => t === 'keeper')) return false;
      }
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

    if (sortOrder === 'newest') list = list.slice().sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    else if (sortOrder === 'oldest') list = list.slice().sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    else list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'da'));

    return list;
  }, [exercises, tab, search, selectedTags, selectedAge, starsOnly, sortOrder]);

  // Fix 2 — tæl aktive filtre
  const activeFilterCount =
    selectedTags.length +
    (selectedAge ? 1 : 0) +
    (starsOnly ? 1 : 0) +
    (sortOrder !== 'name' ? 1 : 0);

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function clearFilters() {
    setSearch(''); setSelectedTags([]); setSelectedAge(''); setStarsOnly(false);
  }

  // Fix 2 — nulstil alle filtre inkl. sortering
  function clearAllFilters() {
    setSearch(''); setSelectedTags([]); setSelectedAge(''); setStarsOnly(false); setSortOrder('name');
  }

  // Fix 3 — luk filtre automatisk når søgning starter
  function handleSearchInput(value: string) {
    setSearch(value);
    if (value.length > 0 && filtersOpen) {
      setFiltersOpen(false);
    }
  }

  function canEditExercise(ex: Exercise) {
    if (isAdmin) return true;
    if (!canEdit) return false;
    // Kun opretter eller admin kan rette
    return ex.created_by === user?.id;
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
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>{filtered.length} øvelser</span>
      </div>

      {/* Subtabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-input)', borderRadius: 10, padding: 4 }}>
        {([['hal', '🤾 Hal'], ['keeper', '🧤 Keeper'], ['fys', '💪 Fysisk']] as const).map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setSelectedTags([]); }}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 600, fontSize: 14, background: tab === t ? 'var(--bg-card)' : 'transparent', color: tab === t ? 'var(--accent)' : 'var(--text2)', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Fix 1 — Sticky søgefelt på mobil */}
      <div className="catalog-search-bar">
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Søg øvelse…"
          value={search}
          onChange={e => handleSearchInput(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', marginBottom: 8, background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 10, fontSize: 16, color: 'var(--text)', boxSizing: 'border-box' }}
        />

        {/* Fix 2 — Mobil: filter-toggle knap */}
        <div className="catalog-filter-toggle">
          <button
            onClick={() => setFiltersOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, fontSize: 14,
              background: filtersOpen ? 'var(--bg-input)' : 'var(--bg-card)',
              color: 'var(--text2)', border: '1px solid var(--border2)',
              cursor: 'pointer',
            }}
          >
            <span>Filtre</span>
            {activeFilterCount > 0 && (
              <span style={{
                background: 'var(--accent)', color: '#fff',
                borderRadius: 10, fontSize: 11, fontWeight: 700,
                padding: '1px 6px', lineHeight: 1.4,
              }}>{activeFilterCount}</span>
            )}
            <span style={{ fontSize: 11 }}>{filtersOpen ? '▲' : '▼'}</span>
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              style={{
                padding: '6px 12px', borderRadius: 8, fontSize: 12,
                background: 'none', color: 'var(--text3)', border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >Ryd</button>
          )}
        </div>
      </div>

      {/* Fix 2 — Filter-panel (altid synlig på desktop, toggle på mobil) */}
      <div className={`catalog-filters${filtersOpen ? ' open' : ''}`}>
        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {tags.map(tag => (
            <button key={tag} onClick={() => toggleTag(tag)}
              style={{ padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500, background: selectedTags.includes(tag) ? 'var(--accent)' : 'var(--bg-card)', color: selectedTags.includes(tag) ? '#fff' : 'var(--text2)', border: `1px solid ${selectedTags.includes(tag) ? 'var(--accent)' : 'var(--border2)'}` }}>
              {tag}
            </button>
          ))}
        </div>

        {/* Aldersgruppe + favoritter + sortering */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <select value={selectedAge} onChange={e => setSelectedAge(e.target.value)}
            style={{ padding: '0 12px', height: 36, borderRadius: 8, fontSize: 14, background: 'var(--bg-card)', border: '1px solid var(--border2)', color: selectedAge ? 'var(--text)' : 'var(--text3)' }}>
            <option value="">Alle aldersgrupper</option>
            {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button onClick={() => setStarsOnly(o => !o)}
            style={{ height: 36, padding: '0 12px', borderRadius: 8, fontSize: 14, background: starsOnly ? 'var(--accent-light)' : 'var(--bg-card)', color: starsOnly ? 'var(--accent)' : 'var(--text2)', border: `1px solid ${starsOnly ? 'var(--accent)' : 'var(--border2)'}` }}>
            ⭐ Favoritter
          </button>
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value as SortOrder)}
            style={{ padding: '0 12px', height: 36, borderRadius: 8, fontSize: 14, background: 'var(--bg-card)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>
            <option value="name">Navn A–Å</option>
            <option value="newest">Nyeste først</option>
            <option value="oldest">Ældste først</option>
          </select>
          {hasFilters && (
            <button onClick={clearFilters} style={{ height: 36, padding: '0 12px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text3)', border: '1px solid var(--border)' }}>
              Ryd filtre
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && [1,2,3,4,5,6,7,8].map(n => (
          <div key={n} style={{
            background: 'var(--bg-card)', borderRadius: 12,
            padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skeleton" style={{ height: 15, width: `${45 + (n * 7) % 35}%` }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <div className="skeleton" style={{ height: 20, width: 56, borderRadius: 10 }} />
                <div className="skeleton" style={{ height: 20, width: 44, borderRadius: 10 }} />
              </div>
            </div>
            <div className="skeleton" style={{ width: 36, height: 12, borderRadius: 6, flexShrink: 0 }} />
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12,
            padding: '40px 24px', textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
              Ingen øvelser fundet
            </div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>
              {hasFilters ? 'Prøv at ændre filtrene eller søgningen.' : 'Opret den første øvelse med + knappen.'}
            </div>
          </div>
        )}
        {filtered.map(ex => (
          <ExerciseCard key={ex.id} ex={ex}
            isExpanded={expanded === ex.id}
            onToggle={() => setExpanded(prev => prev === ex.id ? null : ex.id)}
            canEdit={canEditExercise(ex)}
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

      {/* FAB — Ny øvelse */}
      {canEdit && (
        <button
          onClick={() => {
            setIsCreating(true);
            setEditingEx({
              id: '', name: '', description: '',
              catalog: 'hal',
              tags: tab === 'keeper' ? ['keeper'] : [],
              age_groups: [], stars: 0, variants: null, link: null,
              default_mins: null, image_r2_key: null,
              created_by: user?.id ?? null, created_by_email: user?.email ?? null, created_at: null,
            });
          }}
          style={{
            position: 'fixed',
            bottom: 'calc(var(--bottomnav-h) + 16px + env(safe-area-inset-bottom))',
            right: 20,
            width: 52, height: 52,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#fff',
            fontSize: 28,
            lineHeight: 1,
            boxShadow: '0 4px 12px rgba(200,16,46,0.4)',
            zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer',
          }}
          title="Ny øvelse"
        >
          +
        </button>
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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>{ex.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {ex.stars > 0 && (
              <span style={{ fontSize: 11, color: 'var(--yellow)', letterSpacing: 1 }}>{'★'.repeat(Math.min(ex.stars, 5))}</span>
            )}
            {ex.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'var(--bg-input)', color: 'var(--text2)' }}>{tag}</span>
            ))}
            {ex.age_groups.length > 0 && (
              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, background: 'var(--accent-light)', color: 'var(--accent)' }}>{ex.age_groups.join('/')}</span>
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
            {/* Oprettet af + dato */}
            <div style={{ display: 'flex', gap: 16, marginBottom: canEdit ? 12 : 0, flexWrap: 'wrap' }}>
              {ex.created_by_email && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>Oprettet af</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>{ex.created_by_email}</div>
                </div>
              )}
              {ex.created_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 2 }}>Oprettet</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>{formatDate(ex.created_at)}</div>
                </div>
              )}
            </div>
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

export function ExerciseEditor({ ex, isNew, onSaved, onDeleted, onClose, zIndex = 300 }: {
  ex: Exercise; isNew: boolean; onSaved: (ex: Exercise) => void;
  onDeleted: (id: string) => void; onClose: () => void; zIndex?: number;
}) {
  const [form, setForm] = useState<Exercise>({ ...ex });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [imgPreview, setImgPreview] = useState<string | null>(ex.image_r2_key ? imageUrl(ex) : null);
  const [imgBlob, setImgBlob] = useState<Blob | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.fetchExerciseTags().then(tags => setAllTags(tags)).catch(() => {});
  }, []);

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
    <div style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.4)' }}
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
          {/* Keeper-toggle — styrer om øvelsen vises under Keeper-tab */}
          <div>
            <Label>Type</Label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== 'keeper') }))}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, background: !form.tags.includes('keeper') ? 'var(--accent)' : 'var(--bg-input)', color: !form.tags.includes('keeper') ? '#fff' : 'var(--text2)', border: 'none' }}>
                🤾 Markspiller
              </button>
              <button
                onClick={() => setForm(f => ({ ...f, catalog: 'hal', tags: f.tags.includes('keeper') ? f.tags : ['keeper', ...f.tags] }))}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, background: form.tags.includes('keeper') ? 'var(--accent)' : 'var(--bg-input)', color: form.tags.includes('keeper') ? '#fff' : 'var(--text2)', border: 'none' }}>
                🧤 Keeper
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
              Fysiske øvelser vises automatisk under Fysisk-tab ved tags som styrke, plyometrik, eksplosion, hurtighed.
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
                style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: aiLoading ? 'var(--bg-input)' : 'var(--accent-light)', color: aiLoading ? 'var(--text3)' : 'var(--accent)', border: `1px solid ${aiLoading ? 'var(--border)' : 'var(--accent)'}` }}>
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
            <TagInput
              value={form.tags}
              onChange={tags => setForm(f => ({ ...f, tags }))}
              allTags={allTags}
              placeholder="Søg eller opret tag…"
            />
          </div>

          {/* Aldersgrupper */}
          <div>
            <Label>Aldersgrupper</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AGE_GROUPS.map(ag => (
                <button key={ag} onClick={() => toggleArrItem('age_groups', ag)}
                  style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, background: form.age_groups.includes(ag) ? 'var(--accent)' : 'var(--bg-input)', color: form.age_groups.includes(ag) ? '#fff' : 'var(--text2)', border: `1px solid ${form.age_groups.includes(ag) ? 'var(--accent)' : 'var(--border2)'}` }}>
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
                style={{ padding: '11px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500, background: 'rgba(220,38,38,0.08)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.2)' }}>
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
