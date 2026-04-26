/**
 * TagInput — pill-baseret tag-input med autocomplete fra eksisterende tags.
 *
 * Brug:
 *   <TagInput
 *     value={form.tags}
 *     onChange={tags => setForm(f => ({ ...f, tags }))}
 *     allTags={allTags}         // alle kendte tags til autocomplete
 *   />
 */

import { useState, useRef, useEffect } from 'react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  allTags: string[];
  placeholder?: string;
}

export default function TagInput({ value, onChange, allTags, placeholder = 'Tilføj tag…' }: TagInputProps) {
  const [inputVal, setInputVal] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filtrér suggestions: match på input, ikke allerede valgt, sortér kendte øverst
  const suggestions = inputVal.trim().length === 0 ? [] : (() => {
    const q = inputVal.trim().toLowerCase();
    const known = allTags.filter(t => t.toLowerCase().includes(q) && !value.includes(t));
    const isExact = allTags.some(t => t.toLowerCase() === q);
    // Tilføj "Opret ny: X" hvis inputtet ikke matcher eksakt og ikke allerede valgt
    const createOption = !isExact && !value.includes(inputVal.trim()) ? [`__new__${inputVal.trim()}`] : [];
    return [...known, ...createOption];
  })();

  // Nulstil activeIdx når suggestions ændrer sig
  useEffect(() => { setActiveIdx(0); }, [suggestions.length]);

  function addTag(raw: string) {
    const tag = raw.startsWith('__new__') ? raw.slice(7) : raw;
    const clean = tag.trim().toLowerCase();
    if (clean && !value.includes(clean)) {
      onChange([...value, clean]);
    }
    setInputVal('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    onChange(value.filter(t => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && open && suggestions.length > 0) {
      e.preventDefault();
      addTag(suggestions[activeIdx]);
      return;
    }
    if (e.key === 'Enter' && inputVal.trim()) {
      e.preventDefault();
      addTag(inputVal.trim());
      return;
    }
    if (e.key === 'Backspace' && inputVal === '' && value.length > 0) {
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  // Luk dropdown ved klik udenfor
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (listRef.current && !listRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      {/* Pill-boks */}
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          background: 'var(--bg-input)', border: '1px solid var(--border2)',
          borderRadius: 8, padding: '6px 8px', cursor: 'text', minHeight: 40,
        }}
      >
        {value.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'var(--accent)', color: '#fff',
            borderRadius: 20, padding: '2px 8px 2px 10px', fontSize: 12, fontWeight: 500,
          }}>
            {tag}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(tag); }}
              style={{
                background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1,
                display: 'flex', alignItems: 'center',
              }}
              title={`Fjern ${tag}`}
            >×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => { setInputVal(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => inputVal.trim() && setOpen(true)}
          placeholder={value.length === 0 ? placeholder : ''}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: 13, color: 'var(--text)', flexGrow: 1, minWidth: 80,
            padding: '2px 0',
          }}
        />
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--bg-card)', border: '1px solid var(--border2)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            listStyle: 'none', margin: 0, padding: '4px 0',
            zIndex: 900, maxHeight: 180, overflowY: 'auto',
          }}
        >
          {suggestions.map((s, i) => {
            const isNew = s.startsWith('__new__');
            const label = isNew ? `Opret "${s.slice(7)}"` : s;
            return (
              <li
                key={s}
                onMouseDown={e => { e.preventDefault(); addTag(s); }}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  padding: '7px 12px', fontSize: 13, cursor: 'pointer',
                  background: i === activeIdx ? 'var(--accent-light)' : 'transparent',
                  color: isNew ? 'var(--accent)' : 'var(--text)',
                  fontWeight: isNew ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {isNew ? <span style={{ fontSize: 11 }}>✦</span> : null}
                {label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
