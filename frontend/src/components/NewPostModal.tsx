import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

// ─── Typer ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  name: string;
}

// ─── Accepterede filtyper ────────────────────────────────────────────────────

const ACCEPTED = [
  'image/*',
  'application/pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
].join(',');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Auto-resize textarea ─────────────────────────────────────────────────────

function useAutoResize(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(120, el.scrollHeight) + 'px';
  }, [value, ref]);
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NewPostModalProps {
  teamId: string;
  onSaved: () => void;
  onClose: () => void;
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export default function NewPostModal({ teamId, onSaved, onClose }: NewPostModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // @-autocomplete state
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPos, setMentionPos] = useState<number | null>(null);
  const [showMentions, setShowMentions] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useAutoResize(textareaRef, body);

  // Hent hold-brugere til @-autocomplete
  const { data: members = [] } = useQuery({
    queryKey: ['users', teamId],
    queryFn: () => api.get<TeamMember[]>(`/api/users/team-members?team_id=${teamId}`),
    enabled: !!teamId,
    staleTime: 5 * 60_000,
  });

  // Filtrér brugere på mentionQuery
  const mentionMatches = mentionQuery
    ? members.filter(u => u.name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
    : members;

  // ── Body-ændring + @-detektion ─────────────────────────────────────────────

  function handleBodyChange(value: string) {
    setBody(value);

    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionPos(cursorPos - mentionMatch[0].length);
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  }

  // ── Indsæt mention ────────────────────────────────────────────────────────

  function insertMention(name: string) {
    const cursorPos = textareaRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, mentionPos!);
    const after = body.slice(cursorPos);
    const newBody = `${before}@${name} ${after}`;
    setBody(newBody);
    setShowMentions(false);
    // Sæt cursor efter mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const pos = before.length + name.length + 2; // "@" + name + " "
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  }

  function insertMentionAll() {
    const allMentions = members.map(u => `@${u.name}`).join(' ');
    const cursorPos = textareaRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, mentionPos!);
    const after = body.slice(cursorPos);
    const newBody = `${before}${allMentions} ${after}`;
    setBody(newBody);
    setShowMentions(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // ── Filer ─────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPendingFiles(prev => [...prev, ...files]);
    // Nulstil input så samme fil kan vælges igen
    e.target.value = '';
  }

  function removeFile(idx: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError('');
    try {
      const post = await api.createBoardPost({
        team_id: teamId,
        title: title.trim() || undefined,
        body: body.trim(),
      });
      // Upload vedhæftninger sekventielt
      for (const file of pendingFiles) {
        await api.uploadBoardAttachment(post.id, file);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Noget gik galt');
    } finally {
      setSaving(false);
    }
  }

  // ── Keyboard-genvej i textarea ────────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showMentions && (e.key === 'Escape')) {
      e.preventDefault();
      setShowMentions(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
      // Ikke send på Enter i modal — brugeren kan bruge Shift+Enter = ny linje.
      // "Del opslag"-knap bruges i stedet.
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 16,
    background: 'var(--bg-input)', border: '1px solid var(--border2)',
    borderRadius: 8, color: 'var(--text)', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)' }}
    >
      <div
        className="modal-sheet"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', borderRadius: 16, padding: 24,
          width: '100%', maxWidth: 560,
          maxHeight: '92dvh', overflowY: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', gap: 0,
        }}
      >
        {/* Overskrift */}
        <h2 style={{
          fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700,
          margin: '0 0 16px',
        }}>
          Nyt opslag
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Titel */}
          <input
            type="text"
            placeholder="Titel (valgfri)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ ...inputStyle, minHeight: 44 }}
          />

          {/* Body + @-autocomplete */}
          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => handleBodyChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Skriv et opslag… brug @navn for at nævne nogen"
              style={{
                ...inputStyle,
                resize: 'none', minHeight: 120,
                display: 'block', overflow: 'hidden',
              }}
              autoFocus
            />

            {/* @-autocomplete dropdown */}
            {showMentions && (mentionMatches.length > 0 || members.length > 0) && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                zIndex: 400, background: 'var(--bg-card)',
                border: '1px solid var(--border2)', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                maxHeight: 220, overflowY: 'auto',
              }}>
                {/* @alle option */}
                {members.length > 1 && (
                  <MentionItem
                    label="@alle"
                    sublabel={`Nævn alle ${members.length} på holdet`}
                    onClick={insertMentionAll}
                  />
                )}
                {mentionMatches.map(u => (
                  <MentionItem
                    key={u.id}
                    label={`@${u.name}`}
                    onClick={() => insertMention(u.name)}
                  />
                ))}
                {mentionMatches.length === 0 && (
                  <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text3)' }}>
                    Ingen brugere matcher "{mentionQuery}"
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Ventende filer */}
          {pendingFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pendingFiles.map((f, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'var(--bg-input)', border: '1px solid var(--border2)',
                    borderRadius: 20, padding: '3px 10px', fontSize: 13,
                  }}
                >
                  {f.type.startsWith('image/') ? '🖼' : '📄'}
                  <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </span>
                  <span style={{ color: 'var(--text3)', fontSize: 11 }}>
                    {fmtFileSize(f.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text3)', fontSize: 15, padding: 0, lineHeight: 1,
                      display: 'flex', alignItems: 'center',
                    }}
                    aria-label="Fjern fil"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Fejl */}
          {error && (
            <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 4, paddingTop: 4,
            borderTop: '1px solid var(--border)',
          }}>
            {/* Paperclip */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Vedhæft fil"
              style={{
                background: 'none', border: '1px solid var(--border2)',
                borderRadius: 8, cursor: 'pointer',
                color: 'var(--text2)', fontSize: 18,
                padding: '6px 10px', minHeight: 40,
              }}
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED}
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            <div style={{ flex: 1 }} />

            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                background: 'var(--bg-input)', color: 'var(--text)', minHeight: 44,
                cursor: 'pointer',
              }}
            >
              Annuller
            </button>
            <button
              type="submit"
              disabled={saving || !body.trim()}
              style={{
                padding: '9px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
                background: 'var(--accent)', color: '#fff', minHeight: 44,
                opacity: saving || !body.trim() ? 0.6 : 1,
                cursor: saving || !body.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {saving
                ? (pendingFiles.length > 0 ? 'Uploader…' : 'Deler…')
                : 'Del opslag'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Mention-item ─────────────────────────────────────────────────────────────

function MentionItem({
  label,
  sublabel,
  onClick,
}: {
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}  // preventDefault: bevar textarea-focus
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        width: '100%', textAlign: 'left',
        padding: '9px 14px', background: 'none', border: 'none',
        fontSize: 14, cursor: 'pointer', color: 'var(--text)',
        borderBottom: '1px solid var(--border)',
        gap: 1,
      }}
    >
      <span style={{ fontWeight: 500 }}>{label}</span>
      {sublabel && (
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{sublabel}</span>
      )}
    </button>
  );
}
