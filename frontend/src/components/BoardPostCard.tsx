import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { hasRole } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import type { BoardPost, BoardComment, BoardAttachment } from '../lib/types';
import type { AuthUser } from '../lib/auth';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Lige nu';
  if (mins < 60) return `${mins} min siden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d siden`;
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'short' }).format(new Date(iso));
}

function fmtDateFull(iso: string): string {
  return new Intl.DateTimeFormat('da-DK', {
    dateStyle: 'long', timeStyle: 'short',
  }).format(new Date(iso));
}

function fmtFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Render @-mentions ────────────────────────────────────────────────────────

function renderBody(text: string, currentUser: AuthUser): React.ReactNode[] {
  return text.split(/(@\w[\w\s]*)/g).map((part, i) => {
    if (part.startsWith('@')) {
      const isMe = part.toLowerCase().includes(currentUser.name.toLowerCase());
      return (
        <span key={i} style={{
          background: isMe ? 'rgba(200,16,46,0.12)' : 'var(--bg-input)',
          color: isMe ? 'var(--accent)' : 'var(--text)',
          borderRadius: 4,
          padding: '1px 4px',
          fontWeight: 500,
        }}>
          {part}
        </span>
      );
    }
    return part;
  });
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--accent-light)', color: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700,
    }}>
      {initials(name)}
    </div>
  );
}

// ─── Vedhæftnings-liste ───────────────────────────────────────────────────────

function AttachmentList({ attachments }: { attachments: BoardAttachment[] }) {
  if (!attachments.length) return null;

  const images = attachments.filter(a => a.type === 'image');
  const docs = attachments.filter(a => a.type === 'document');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {/* Billeder */}
      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {images.map(a => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}
            >
              <img
                src={a.url}
                alt={a.filename}
                style={{
                  maxHeight: 200, maxWidth: '100%', display: 'block',
                  borderRadius: 8, objectFit: 'cover',
                  border: '1px solid var(--border)',
                }}
              />
            </a>
          ))}
        </div>
      )}
      {/* Dokumenter */}
      {docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {docs.map(a => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              download={a.filename}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 8, fontSize: 13,
                background: 'var(--bg-input)', color: 'var(--text)',
                border: '1px solid var(--border2)', textDecoration: 'none',
                alignSelf: 'flex-start',
              }}
            >
              <span style={{ fontSize: 16 }}>📄</span>
              <span style={{ fontWeight: 500 }}>{a.filename}</span>
              {a.size_bytes != null && (
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>
                  {fmtFileSize(a.size_bytes)}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Auto-resize textarea ─────────────────────────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  placeholder,
  onSubmit,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit: () => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.max(40, ref.current.scrollHeight) + 'px';
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rows={1}
      style={{
        flex: 1, padding: '8px 10px', fontSize: 14, borderRadius: 8,
        background: 'var(--bg-input)', border: '1px solid var(--border2)',
        resize: 'none', fontFamily: 'inherit', color: 'var(--text)',
        minHeight: 40, overflow: 'hidden', lineHeight: 1.5,
        boxSizing: 'border-box',
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
    />
  );
}

// ─── Kommentar-række ─────────────────────────────────────────────────────────

function CommentRow({
  comment,
  postId,
  currentUser,
  isManager,
  onUpdate,
  onDelete,
}: {
  comment: BoardComment;
  postId: string;
  currentUser: AuthUser;
  isManager: boolean;
  onUpdate: (c: BoardComment) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [saving, setSaving] = useState(false);

  const isOwner = comment.user_id === currentUser.id;
  const canAct = isOwner || isManager;

  async function handleSave() {
    if (!editBody.trim()) return;
    setSaving(true);
    try {
      const updated = await api.updateBoardComment(postId, comment.id, editBody.trim());
      onUpdate(updated);
      setEditing(false);
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Slet denne kommentar?')) return;
    try {
      await api.deleteBoardComment(postId, comment.id);
      onDelete(comment.id);
    } catch { /* ignore */ }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <Avatar name={comment.user_name} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <AutoTextarea
              value={editBody}
              onChange={setEditBody}
              onSubmit={handleSave}
              autoFocus
            />
            <button
              onClick={() => { setEditing(false); setEditBody(comment.body); }}
              style={smallBtnStyle}
            >
              Annuller
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !editBody.trim()}
              style={{ ...smallBtnStyle, background: 'var(--accent)', color: '#fff', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? '…' : 'Gem'}
            </button>
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-input)', borderRadius: '0 10px 10px 10px',
            padding: '8px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{comment.user_name}</span>
              <span
                title={fmtDateFull(comment.created_at)}
                style={{ fontSize: 11, color: 'var(--text3)', cursor: 'default' }}
              >
                {fmtRelative(comment.created_at)}
              </span>
              {comment.edited_at && (
                <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>(redigeret)</span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {renderBody(comment.body, currentUser)}
            </p>
          </div>
        )}

        {canAct && !editing && (
          <div style={{ display: 'flex', gap: 10, marginTop: 3, paddingLeft: 2 }}>
            {isOwner && (
              <button onClick={() => setEditing(true)} style={actionLinkStyle}>Rediger</button>
            )}
            <button onClick={handleDelete} style={{ ...actionLinkStyle, color: 'var(--red)' }}>Slet</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Kommentar-input ─────────────────────────────────────────────────────────

function CommentInput({ postId, onAdded }: { postId: string; onAdded: (c: BoardComment) => void }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      const c = await api.createBoardComment(postId, body.trim());
      onAdded(c);
      setBody('');
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <AutoTextarea
        value={body}
        onChange={setBody}
        placeholder="@navn eller skriv en kommentar…"
        onSubmit={handleSubmit}
      />
      <button
        onClick={handleSubmit}
        disabled={saving || !body.trim()}
        style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--accent)', color: '#fff', minHeight: 40,
          opacity: saving || !body.trim() ? 0.6 : 1,
          cursor: saving || !body.trim() ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        {saving ? '…' : 'Send'}
      </button>
    </div>
  );
}

// ─── Redigér opslag modal ────────────────────────────────────────────────────

function EditPostModal({
  post,
  onClose,
  onSaved,
}: {
  post: BoardPost;
  onClose: () => void;
  onSaved: (p: BoardPost) => void;
}) {
  const [title, setTitle] = useState(post.title ?? '');
  const [body, setBody] = useState(post.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setError('Tekst er påkrævet'); return; }
    setSaving(true); setError('');
    try {
      const updated = await api.updateBoardPost(post.id, {
        title: title.trim() || undefined,
        body: body.trim(),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Noget gik galt');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 15,
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
          width: '100%', maxWidth: 540,
          maxHeight: '90dvh', overflowY: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>
          Rediger opslag
        </h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            placeholder="Overskrift (valgfri)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ ...inputStyle, minHeight: 44 }}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            autoFocus
            style={{ ...inputStyle, resize: 'vertical', minHeight: 140 }}
          />
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
              background: 'var(--bg-input)', color: 'var(--text)', minHeight: 44,
            }}>
              Annuller
            </button>
            <button type="submit" disabled={saving || !body.trim()} style={{
              padding: '9px 22px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              background: 'var(--accent)', color: '#fff', minHeight: 44,
              opacity: saving || !body.trim() ? 0.6 : 1,
              cursor: saving || !body.trim() ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Gemmer…' : 'Gem ændringer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Handlingsknap ────────────────────────────────────────────────────────────

function ActionBtn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: danger ? 'var(--red)' : 'var(--text3)',
        fontSize: 15, padding: '4px 6px', borderRadius: 6,
        display: 'flex', alignItems: 'center',
        transition: 'color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ─── Hoved-komponent ─────────────────────────────────────────────────────────

export interface BoardPostCardProps {
  post: BoardPost;
  currentUser: AuthUser;
  teamId: string;
  currentTeamRole: 'guest' | 'trainer' | 'team_manager' | 'admin' | null;
  onUpdate: () => void;
}

export default function BoardPostCard({
  post,
  currentUser,
  teamId,
  currentTeamRole,
  onUpdate,
}: BoardPostCardProps) {
  const qc = useQueryClient();
  const isManager = hasRole(currentUser, 'team_manager', currentTeamRole);
  const isOwner = post.user_id === currentUser.id;
  const canEdit = isOwner;
  const canDelete = isOwner || isManager;

  const [editing, setEditing] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(post.comments.length === 0);
  const [localComments, setLocalComments] = useState<BoardComment[]>(post.comments);
  const [pinning, setPinning] = useState(false);
  const [archiving, setArchiving] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['board', teamId] });
    onUpdate();
  }

  async function handlePin() {
    setPinning(true);
    try {
      await api.pinBoardPost(post.id);
      invalidate();
    } catch { /* ignore */ } finally {
      setPinning(false);
    }
  }

  async function handleArchive() {
    setArchiving(true);
    try {
      await api.archiveBoardPost(post.id);
      invalidate();
    } catch { /* ignore */ } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Slet dette opslag?')) return;
    try {
      await api.deleteBoardPost(post.id);
      invalidate();
    } catch { /* ignore */ }
  }

  function handleCommentAdded(c: BoardComment) {
    setLocalComments(prev => [...prev, c]);
  }

  function handleCommentUpdated(c: BoardComment) {
    setLocalComments(prev => prev.map(x => x.id === c.id ? c : x));
  }

  function handleCommentDeleted(id: string) {
    setLocalComments(prev => prev.filter(x => x.id !== id));
  }

  return (
    <>
      {editing && (
        <EditPostModal
          post={post}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); invalidate(); }}
        />
      )}

      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        borderTop: post.pinned ? '2px solid #f59e0b' : '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Fastgjort-badge */}
        {post.pinned && (
          <div style={{
            padding: '4px 16px', fontSize: 12, fontWeight: 600,
            color: '#92400e', background: '#fef3c7',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            📌 Fastgjort
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '14px 16px 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Avatar name={post.user_name} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{post.user_name}</span>
              <span
                title={fmtDateFull(post.created_at)}
                style={{ fontSize: 12, color: 'var(--text2)', cursor: 'default' }}
              >
                {fmtRelative(post.created_at)}
              </span>
              {post.edited_at && (
                <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
                  (redigeret)
                </span>
              )}
            </div>

            {post.title && (
              <div style={{ fontWeight: 600, fontSize: 15, marginTop: 3, lineHeight: 1.3 }}>
                {post.title}
              </div>
            )}
          </div>

          {/* Handlingsknapper */}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {canEdit && (
              <ActionBtn onClick={() => setEditing(true)} title="Rediger opslag">✎</ActionBtn>
            )}
            {isManager && (
              <ActionBtn
                onClick={handlePin}
                title={post.pinned ? 'Fjern fastgøring' : 'Fastgør'}
              >
                {pinning ? '…' : (post.pinned ? '📌' : '📍')}
              </ActionBtn>
            )}
            {isManager && (
              <ActionBtn
                onClick={handleArchive}
                title={post.archived ? 'Fjern fra arkiv' : 'Arkivér'}
              >
                {archiving ? '…' : '📦'}
              </ActionBtn>
            )}
            {canDelete && (
              <ActionBtn onClick={handleDelete} title="Slet opslag" danger>🗑</ActionBtn>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '10px 16px 0' }}>
          <p style={{
            margin: 0, fontSize: 14, lineHeight: 1.65,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)',
          }}>
            {renderBody(post.body, currentUser)}
          </p>
        </div>

        {/* Vedhæftninger */}
        {post.attachments.length > 0 && (
          <div style={{ padding: '0 16px' }}>
            <AttachmentList attachments={post.attachments} />
          </div>
        )}

        {/* Kommentar-toggle */}
        <div style={{
          padding: '10px 16px 12px', marginTop: 10,
          borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={() => setCommentsOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text2)', fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 5, padding: 0,
            }}
          >
            💬{' '}
            {localComments.length > 0
              ? `${localComments.length} kommentar${localComments.length !== 1 ? 'er' : ''} ${commentsOpen ? '▴' : '▾'}`
              : 'Skriv kommentar'}
          </button>
        </div>

        {/* Kommentarer */}
        {commentsOpen && (
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 16px 14px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {localComments.map(c => (
              <CommentRow
                key={c.id}
                comment={c}
                postId={post.id}
                currentUser={currentUser}
                isManager={isManager}
                onUpdate={handleCommentUpdated}
                onDelete={handleCommentDeleted}
              />
            ))}
            <CommentInput postId={post.id} onAdded={handleCommentAdded} />
          </div>
        )}
      </div>
    </>
  );
}

// ─── Style-konstanter ─────────────────────────────────────────────────────────

const smallBtnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  background: 'var(--bg-input)', color: 'var(--text)', minHeight: 36,
  cursor: 'pointer', flexShrink: 0,
};

const actionLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text3)', fontSize: 12, padding: 0, fontWeight: 500,
};
