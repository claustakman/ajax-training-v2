import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, hasRole } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import NewPostModal from '../components/NewPostModal';
import type { BoardPost, BoardComment } from '../lib/types';

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
  return new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(iso));
}

// ─── Auto-link renderer ───────────────────────────────────────────────────────

const TEXT_TOKEN_RE = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

function renderText(text: string): React.ReactNode[] {
  return text.split(TEXT_TOKEN_RE).map((part, i) => {
    if (part.startsWith('http://') || part.startsWith('https://') || part.startsWith('www.')) {
      const href = part.startsWith('www.') ? `https://${part}` : part;
      const label = part.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {label}
        </a>
      );
    }
    return part;
  });
}

// ─── Sub-komponenter ─────────────────────────────────────────────────────────

function SkeletonPost() {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 12,
      padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="skeleton" style={{ height: 14, width: '40%' }} />
          <div className="skeleton" style={{ height: 12, width: '25%' }} />
        </div>
      </div>
      <div className="skeleton" style={{ height: 13, width: '90%' }} />
      <div className="skeleton" style={{ height: 13, width: '70%' }} />
    </div>
  );
}

// ─── Opret/Rediger opslag modal ───────────────────────────────────────────────

function PostModal({
  post,
  teamId,
  onClose,
  onSaved,
}: {
  post?: BoardPost;
  teamId: string;
  onClose: () => void;
  onSaved: (p: BoardPost) => void;
}) {
  const [title, setTitle] = useState(post?.title ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setError('Tekst er påkrævet'); return; }
    setSaving(true);
    setError('');
    try {
      const result = post
        ? await api.updateBoardPost(post.id, { title: title.trim() || undefined, body: body.trim() })
        : await api.createBoardPost({ team_id: teamId, title: title.trim() || undefined, body: body.trim() });
      onSaved(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Noget gik galt');
    } finally {
      setSaving(false);
    }
  }

  // fontSize: 16 — undgår iOS auto-zoom ved fokus
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
          background: 'var(--bg-card)', borderRadius: 16,
          padding: 24, width: '100%', maxWidth: 540,
          maxHeight: '90dvh', overflowY: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>
          {post ? 'Rediger opslag' : 'Nyt opslag'}
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
            placeholder="Skriv dit opslag her…"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={5}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
            autoFocus
          />
          {error && (
            <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                background: 'var(--bg-input)', color: 'var(--text)', minHeight: 44,
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
              {saving ? 'Gemmer…' : (post ? 'Gem ændringer' : 'Opret opslag')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Kommentar-formular ───────────────────────────────────────────────────────

function CommentForm({
  postId,
  editComment,
  onSaved,
  onCancel,
}: {
  postId: string;
  editComment?: BoardComment;
  onSaved: (c: BoardComment) => void;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(editComment?.body ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      const result = editComment
        ? await api.updateBoardComment(postId, editComment.id, body.trim())
        : await api.createBoardComment(postId, body.trim());
      onSaved(result);
      if (!editComment) setBody('');
    } catch { /* ignore */ } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={editComment ? undefined : 'Skriv en kommentar…'}
        rows={editComment ? 3 : 2}
        style={{
          flex: 1, padding: '8px 10px', fontSize: 16, borderRadius: 8,
          background: 'var(--bg-input)', border: '1px solid var(--border2)',
          resize: 'none', fontFamily: 'inherit', color: 'var(--text)',
          minHeight: 44,
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }
        }}
        autoFocus={!!editComment}
      />
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: 'var(--bg-input)', color: 'var(--text2)', minHeight: 40,
          }}
        >
          Annuller
        </button>
      )}
      <button
        type="submit"
        disabled={saving || !body.trim()}
        style={{
          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'var(--accent)', color: '#fff', minHeight: 40,
          opacity: saving || !body.trim() ? 0.6 : 1,
          cursor: saving || !body.trim() ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      >
        {saving ? '…' : (editComment ? 'Gem' : 'Send')}
      </button>
    </form>
  );
}

// ─── Opslags-kort ─────────────────────────────────────────────────────────────

function PostCard({
  post,
  currentUserId,
  isManager,
  onUpdate,
  onDelete,
  onPin,
  onArchive,
}: {
  post: BoardPost;
  currentUserId: string;
  isManager: boolean;
  onUpdate: (p: BoardPost) => void;
  onDelete: (id: string) => void;
  onPin: (p: BoardPost) => void;
  onArchive: (p: BoardPost) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [localComments, setLocalComments] = useState<BoardComment[]>(post.comments);
  const [menuOpen, setMenuOpen] = useState(false);

  const isOwner = post.user_id === currentUserId;
  const canEdit = isOwner;                    // kun ejeren redigerer indhold
  const canDelete = isOwner || isManager;     // ejer eller team_manager+ sletter

  // Synk kommentarer hvis post opdateres udefra
  useState(() => { setLocalComments(post.comments); });

  const initials = post.user_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const bodyPreview = post.body.length > 200 ? post.body.slice(0, 200) + '…' : post.body;
  const needsExpand = post.body.length > 200;

  async function handleDeletePost() {
    setMenuOpen(false);
    if (!confirm('Slet dette opslag?')) return;
    try {
      await api.deleteBoardPost(post.id);
      onDelete(post.id);
    } catch { /* ignore */ }
  }

  async function handlePin() {
    setMenuOpen(false);
    try {
      const result = await api.pinBoardPost(post.id);
      onPin({ ...post, ...result });
    } catch { /* ignore */ }
  }

  async function handleArchive() {
    setMenuOpen(false);
    try {
      const result = await api.archiveBoardPost(post.id);
      onArchive({ ...post, ...result });
    } catch { /* ignore */ }
  }

  async function handleDeleteComment(commentId: string) {
    if (!confirm('Slet denne kommentar?')) return;
    try {
      await api.deleteBoardComment(post.id, commentId);
      setLocalComments(prev => prev.filter(c => c.id !== commentId));
    } catch { /* ignore */ }
  }

  function handleCommentSaved(c: BoardComment) {
    if (editingCommentId) {
      setLocalComments(prev => prev.map(x => x.id === c.id ? c : x));
      setEditingCommentId(null);
    } else {
      setLocalComments(prev => [...prev, c]);
      setShowComments(true);
    }
  }

  return (
    <>
      {editing && (
        <PostModal
          post={post}
          teamId={post.team_id}
          onClose={() => setEditing(false)}
          onSaved={p => { onUpdate(p); setEditing(false); }}
        />
      )}

      <div style={{
        background: 'var(--bg-card)', borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        border: post.pinned ? '2px solid var(--accent)' : '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {/* Fastgjort-banner */}
        {post.pinned && (
          <div style={{
            background: 'var(--accent-light)', padding: '5px 16px',
            fontSize: 12, fontWeight: 600, color: 'var(--accent)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            📌 Fastgjort
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '14px 16px 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent-light)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700,
          }}>
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{post.user_name}</span>
              <span
                title={fmtDateFull(post.created_at)}
                style={{ fontSize: 12, color: 'var(--text3)', cursor: 'default' }}
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
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 2, lineHeight: 1.3 }}>
                {post.title}
              </div>
            )}
          </div>

          {/* Menu-knap */}
          {(canEdit || canDelete || isManager) && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setMenuOpen(o => !o)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text3)', fontSize: 18, padding: '2px 6px',
                  lineHeight: 1, borderRadius: 6,
                }}
                aria-label="Handlinger"
              >
                ···
              </button>
              {menuOpen && (
                <>
                  <div
                    onClick={() => setMenuOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 50 }}
                  />
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, zIndex: 100,
                    background: 'var(--bg-card)', borderRadius: 10,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    minWidth: 160, overflow: 'hidden',
                  }}>
                    {isOwner && (
                      <MenuAction onClick={() => { setMenuOpen(false); setEditing(true); }}>
                        ✏️ Rediger
                      </MenuAction>
                    )}
                    {isManager && (
                      <MenuAction onClick={handlePin}>
                        {post.pinned ? '📌 Fjern fastgøring' : '📌 Fastgør'}
                      </MenuAction>
                    )}
                    {isManager && (
                      <MenuAction onClick={handleArchive}>
                        {post.archived ? '↩ Fjern fra arkiv' : '📦 Arkivér'}
                      </MenuAction>
                    )}
                    {canDelete && (
                      <MenuAction onClick={handleDeletePost} danger>
                        🗑 Slet
                      </MenuAction>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '10px 16px 0' }}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)' }}>
            {renderText(expanded || !needsExpand ? post.body : bodyPreview)}
          </p>
          {needsExpand && (
            <button
              onClick={() => setExpanded(o => !o)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--accent)', fontSize: 13, padding: '4px 0', fontWeight: 500,
              }}
            >
              {expanded ? 'Vis mindre' : 'Vis mere'}
            </button>
          )}
        </div>

        {/* Vedhæftninger */}
        {post.attachments.length > 0 && (
          <div style={{ padding: '8px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {post.attachments.map(a => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 20, fontSize: 13,
                  background: 'var(--bg-input)', color: 'var(--text2)',
                  border: '1px solid var(--border2)', textDecoration: 'none',
                }}
              >
                {a.type === 'image' ? '🖼' : '📄'} {a.filename}
              </a>
            ))}
          </div>
        )}

        {/* Footer: kommentarer-knap */}
        <div style={{
          padding: '10px 16px 12px',
          display: 'flex', alignItems: 'center', gap: 12,
          borderTop: '1px solid var(--border)', marginTop: 10,
        }}>
          <button
            onClick={() => setShowComments(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text2)', fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 5, padding: 0,
            }}
          >
            💬{' '}
            {localComments.length > 0
              ? `${localComments.length} kommentar${localComments.length !== 1 ? 'er' : ''}`
              : 'Skriv kommentar'}
          </button>
        </div>

        {/* Kommentarer */}
        {showComments && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {localComments.map(c => (
              <div key={c.id}>
                {editingCommentId === c.id ? (
                  <CommentForm
                    postId={post.id}
                    editComment={c}
                    onSaved={handleCommentSaved}
                    onCancel={() => setEditingCommentId(null)}
                  />
                ) : (
                  <CommentRow
                    comment={c}
                    isOwner={c.user_id === currentUserId}
                    isManager={isManager}
                    onEdit={() => setEditingCommentId(c.id)}
                    onDelete={() => handleDeleteComment(c.id)}
                  />
                )}
              </div>
            ))}

            {editingCommentId === null && (
              <CommentForm
                postId={post.id}
                onSaved={handleCommentSaved}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

function CommentRow({
  comment,
  isOwner,
  isManager,
  onEdit,
  onDelete,
}: {
  comment: BoardComment;
  isOwner: boolean;
  isManager: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const initials = comment.user_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const canAct = isOwner || isManager;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: 'var(--bg-input)', color: 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: 'var(--bg-input)', borderRadius: '0 10px 10px 10px',
          padding: '8px 12px', fontSize: 14,
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
          <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
            {renderText(comment.body)}
          </p>
        </div>
        {canAct && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {isOwner && (
              <button onClick={onEdit} style={actionBtnStyle}>Rediger</button>
            )}
            <button onClick={onDelete} style={{ ...actionBtnStyle, color: 'var(--red)' }}>Slet</button>
          </div>
        )}
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text3)', fontSize: 12, padding: 0, fontWeight: 500,
};

function MenuAction({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 14px', background: 'none', border: 'none',
        fontSize: 14, cursor: 'pointer',
        color: danger ? 'var(--red)' : 'var(--text)',
      }}
    >
      {children}
    </button>
  );
}

// ─── Hoved-komponent ─────────────────────────────────────────────────────────

export default function Board() {
  const { user, currentTeamId, currentTeamRole } = useAuth();
  const isManager = hasRole(user, 'team_manager', currentTeamRole);
  const qc = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewPost, setShowNewPost] = useState(false);
  const [posts, setPosts] = useState<BoardPost[]>([]);

  const teamId = currentTeamId ?? '';
  const currentTeam = user?.teams.find(t => t.id === teamId);

  const { isLoading } = useQuery({
    queryKey: ['board', teamId, showArchived],
    queryFn: async () => {
      const data = await api.fetchBoardPosts(teamId, showArchived);
      setPosts(data);
      return data;
    },
    enabled: !!teamId,
  });

  const filtered = searchQuery
    ? posts.filter(p =>
        p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.comments.some(c => c.body.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : posts;

  function handleUpdatePost(p: BoardPost) {
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, ...p } : x));
  }

  function handleDeletePost(id: string) {
    setPosts(prev => prev.filter(x => x.id !== id));
  }

  function handlePin(p: BoardPost) {
    setPosts(prev => {
      const updated = prev.map(x => x.id === p.id ? { ...x, pinned: p.pinned } : x);
      // Sorter: fastgjorte øverst
      return [...updated].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    });
  }

  function handleArchive(p: BoardPost) {
    // Fjern fra liste (skifter tab)
    setPosts(prev => prev.filter(x => x.id !== p.id));
  }

  if (!teamId) {
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '40px 16px', color: 'var(--text2)' }}>
        Vælg et hold for at se opslagstavlen.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      {/* Overskrift */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-heading)', fontSize: 26, fontWeight: 900,
            margin: 0, letterSpacing: '0.02em', textTransform: 'uppercase',
          }}>
            Opslagstavle
          </h1>
          {currentTeam && (
            <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 2 }}>
              {currentTeam.name}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => { setShowSearch(o => !o); if (showSearch) setSearchQuery(''); }}
            style={{
              background: showSearch ? 'var(--accent-light)' : 'var(--bg-input)',
              border: showSearch ? '1px solid var(--accent)' : '1px solid var(--border2)',
              color: showSearch ? 'var(--accent)' : 'var(--text2)',
              borderRadius: 8, padding: '8px 10px', fontSize: 17,
              cursor: 'pointer', minHeight: 40,
            }}
            aria-label="Søg i opslag"
          >
            🔍
          </button>
          <button
            onClick={() => setShowNewPost(true)}
            style={{
              background: 'var(--accent)', color: '#fff', borderRadius: 8,
              padding: '8px 16px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', minHeight: 40, whiteSpace: 'nowrap',
            }}
          >
            + Nyt opslag
          </button>
        </div>
      </div>

      {/* Søgebar */}
      {showSearch && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="search"
            placeholder="Søg i opslag og kommentarer…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '9px 12px', fontSize: 16,
              background: 'var(--bg-card)', border: '1px solid var(--border2)',
              borderRadius: 8, color: 'var(--text)', boxSizing: 'border-box',
              minHeight: 44,
            }}
          />
        </div>
      )}

      {/* Arkiv-filter (kun team_manager+) */}
      {isManager && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['Aktive', 'Arkiverede'] as const).map((label, i) => {
            const isArchived = i === 1;
            const active = showArchived === isArchived;
            return (
              <button
                key={label}
                onClick={() => setShowArchived(isArchived)}
                style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: active ? 600 : 400,
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--text2)',
                  border: active ? 'none' : '1px solid var(--border2)',
                  cursor: 'pointer', minHeight: 34,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SkeletonPost />
          <SkeletonPost />
          <SkeletonPost />
        </div>
      )}

      {/* Tom state */}
      {!isLoading && filtered.length === 0 && (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12,
          padding: 40, textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          {searchQuery ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Ingen resultater</div>
              <div style={{ color: 'var(--text2)', fontSize: 14 }}>
                Prøv en anden søgning
              </div>
            </>
          ) : showArchived ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Intet arkiv</div>
              <div style={{ color: 'var(--text2)', fontSize: 14 }}>
                Arkiverede opslag vises her
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📌</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Ingen opslag endnu</div>
              <div style={{ color: 'var(--text2)', fontSize: 14 }}>
                Vær den første til at skrive noget
              </div>
              <button
                onClick={() => setShowNewPost(true)}
                style={{
                  marginTop: 16, padding: '9px 20px', borderRadius: 8,
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                }}
              >
                + Nyt opslag
              </button>
            </>
          )}
        </div>
      )}

      {/* Opslags-liste */}
      {!isLoading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(post => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={user?.id ?? ''}
              isManager={isManager}
              onUpdate={handleUpdatePost}
              onDelete={handleDeletePost}
              onPin={handlePin}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      {/* Nyt opslag modal — med @-mentions, visualViewport og filvedhæftning */}
      {showNewPost && (
        <NewPostModal
          teamId={teamId}
          onClose={() => setShowNewPost(false)}
          onSaved={() => {
            setShowNewPost(false);
            // Invalidér board for at hente det nye opslag inkl. vedhæftninger
            qc.invalidateQueries({ queryKey: ['board', teamId, showArchived] });
            qc.invalidateQueries({ queryKey: ['board-unread', teamId] });
          }}
        />
      )}
    </div>
  );
}
