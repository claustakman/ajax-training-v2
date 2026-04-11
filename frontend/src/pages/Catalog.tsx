import { useState, useMemo } from 'react';
import { EXERCISES } from '../lib/exerciseData';

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
}

const HAL_TAGS = [
  'opvarmning', 'aflevering', 'skud', 'finter', 'forsvar', 'kontra',
  'keeper', 'sammenspil', 'beslutning', 'taktik', 'duel', 'kamp',
  'stafet', 'leg', 'styrke', 'hurtighed',
];
const FYS_TAGS = ['plyometrik', 'eksplosion', 'styrke', 'hurtighed', 'finter', 'opvarmning'];
const AGE_GROUPS = ['U9', 'U11', 'U13', 'U15', 'U17', 'U19'];

export default function Catalog() {
  const [tab, setTab] = useState<'hal' | 'fys'>('hal');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAge, setSelectedAge] = useState('');
  const [starsOnly, setStarsOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const tags = tab === 'hal' ? HAL_TAGS : FYS_TAGS;

  const filtered = useMemo(() => {
    return (EXERCISES as unknown as Exercise[]).filter(ex => {
      if (ex.catalog !== tab) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!ex.name.toLowerCase().includes(q) && !ex.description.toLowerCase().includes(q)) return false;
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
  }, [tab, search, selectedTags, selectedAge, starsOnly]);

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  function clearFilters() {
    setSearch('');
    setSelectedTags([]);
    setSelectedAge('');
    setStarsOnly(false);
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

      {/* Subtabs: Hal / Fys */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16,
        background: 'var(--bg-input)', borderRadius: 10, padding: 4,
      }}>
        {(['hal', 'fys'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSelectedTags([]); }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 600, fontSize: 14,
              background: tab === t ? 'var(--bg-card)' : 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text2)',
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t === 'hal' ? '🤾 Haltræning' : '💪 Fysisk'}
          </button>
        ))}
      </div>

      {/* Søgning */}
      <input
        type="search"
        placeholder="Søg øvelse…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '10px 12px', marginBottom: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border2)',
          borderRadius: 10, fontSize: 16, color: 'var(--text)',
          boxSizing: 'border-box',
        }}
      />

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {tags.map(tag => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
              background: selectedTags.includes(tag) ? 'var(--accent)' : 'var(--bg-card)',
              color: selectedTags.includes(tag) ? '#fff' : 'var(--text2)',
              border: `1px solid ${selectedTags.includes(tag) ? 'var(--accent)' : 'var(--border2)'}`,
            }}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Filtre: aldersgruppe + stjerner */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selectedAge}
          onChange={e => setSelectedAge(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 14,
            background: 'var(--bg-card)', border: '1px solid var(--border2)',
            color: selectedAge ? 'var(--text)' : 'var(--text3)',
          }}
        >
          <option value="">Alle aldersgrupper</option>
          {AGE_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        <button
          onClick={() => setStarsOnly(o => !o)}
          style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 14,
            background: starsOnly ? 'var(--accent-light)' : 'var(--bg-card)',
            color: starsOnly ? 'var(--accent)' : 'var(--text2)',
            border: `1px solid ${starsOnly ? 'var(--accent)' : 'var(--border2)'}`,
          }}
        >
          ⭐ Favoritter
        </button>

        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: 'none', color: 'var(--text3)',
              border: '1px solid var(--border)',
            }}
          >
            Ryd filtre
          </button>
        )}
      </div>

      {/* Øvelsesliste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12, padding: 32,
            textAlign: 'center', color: 'var(--text3)',
          }}>
            Ingen øvelser matcher søgningen
          </div>
        )}
        {filtered.map(ex => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            isExpanded={expanded === ex.id}
            onToggle={() => setExpanded(prev => prev === ex.id ? null : ex.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseCard({ ex, isExpanded, onToggle }: {
  ex: Exercise;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      overflow: 'hidden',
    }}>
      {/* Hoved-række — klik for at udvide */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', padding: '14px 16px', background: 'none',
          textAlign: 'left',
        }}
      >
        {/* Stjerner */}
        {ex.stars > 0 && (
          <span style={{ fontSize: 14, flexShrink: 0 }}>
            {'⭐'.repeat(Math.min(ex.stars, 3))}
          </span>
        )}

        {/* Navn + tags */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
            {ex.name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ex.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                background: 'var(--bg-input)', color: 'var(--text2)',
              }}>
                {tag}
              </span>
            ))}
            {ex.age_groups.length > 0 && (
              <span style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                background: 'var(--accent-light)', color: 'var(--accent)',
              }}>
                {ex.age_groups.join('/')}
              </span>
            )}
          </div>
        </div>

        {/* Minutter + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {ex.default_mins && (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{ex.default_mins} min</span>
          )}
          <span style={{
            fontSize: 12, color: 'var(--text3)',
            transform: isExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}>▼</span>
        </div>
      </button>

      {/* Udvidet indhold */}
      {isExpanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.6, color: 'var(--text2)' }}>
            {ex.description}
          </p>

          {ex.variants && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
                Varianter
              </div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text2)' }}>
                {ex.variants}
              </p>
            </div>
          )}

          {ex.link && (
            <a
              href={ex.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                marginTop: 12, fontSize: 13, color: 'var(--blue)',
              }}
            >
              🔗 Se video/øvelse
            </a>
          )}
        </div>
      )}
    </div>
  );
}
