import { useState, useEffect, useRef, useCallback } from 'react';
import { StatusGroup } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../common/Avatar';
import api from '../../api/axios';

interface Props {
  allGroups: StatusGroup[];
  startIndex: number;
  onClose: () => void;
}

const DURATION = 6000;
const QUICK_REACTIONS = ['❤️', '🔥', '😂', '😮', '😢', '👏', '🙏'];

interface Viewer {
  id: string;
  username: string;
  avatar: string | null;
  viewed_at: number;
}

export default function StatusViewer({ allGroups, startIndex, onClose }: Props) {
  const { user } = useAuth();
  const [groupIdx, setGroupIdx] = useState(startIndex);
  const [statusIdx, setStatusIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [replySent, setReplySent] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [muted, setMuted] = useState(true);
  const [deleting, setDeleting] = useState(false);
  // Local map of statusId -> view_count for real-time updates
  const [viewCounts, setViewCounts] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    allGroups.forEach(g => g.statuses.forEach(s => { init[s.id] = s.view_count ?? 0; }));
    return init;
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const startRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const replyInputRef = useRef<HTMLInputElement>(null);

  const group = allGroups[groupIdx];
  const current = group?.statuses[statusIdx];
  const isOwn = group?.user_id === user?.id;

  const goNextStatus = useCallback(() => {
    if (!group) return;
    if (statusIdx < group.statuses.length - 1) {
      setStatusIdx(i => i + 1);
    } else if (groupIdx < allGroups.length - 1) {
      setGroupIdx(g => g + 1);
      setStatusIdx(0);
    } else {
      onClose();
    }
  }, [statusIdx, groupIdx, group, allGroups.length, onClose]);

  const goPrevStatus = useCallback(() => {
    if (statusIdx > 0) {
      setStatusIdx(i => i - 1);
    } else if (groupIdx > 0) {
      setGroupIdx(g => g - 1);
      setStatusIdx(allGroups[groupIdx - 1].statuses.length - 1);
    }
  }, [statusIdx, groupIdx, allGroups]);

  // Timer effect
  useEffect(() => {
    if (!current || paused) return;
    setProgress(0);
    startRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min((elapsed / DURATION) * 100, 100);
      setProgress(pct);
      if (elapsed >= DURATION) {
        clearInterval(timerRef.current);
        goNextStatus();
      }
    }, 50);

    return () => clearInterval(timerRef.current);
  }, [current?.id, paused, goNextStatus]);

  // Mark as viewed — record server-side and update local state immediately
  useEffect(() => {
    if (!current || isOwn) return;
    api.post(`/statuses/${current.id}/view`).catch(() => {});
  }, [current?.id, isOwn]);

  // Listen for real-time view_count updates (for own statuses)
  useEffect(() => {
    const handler = (e: Event) => {
      const { statusId, viewCount } = (e as CustomEvent).detail as { statusId: string; viewCount: number };
      setViewCounts(prev => ({ ...prev, [statusId]: viewCount }));
    };
    window.addEventListener('status:viewed', handler);
    return () => window.removeEventListener('status:viewed', handler);
  }, []);

  // Reset reply state on status change
  useEffect(() => {
    setReply('');
    setReplySent(false);
    setShowViewers(false);
    setViewers([]);
  }, [current?.id]);

  // Load viewers for own statuses
  const loadViewers = async () => {
    if (!current || !isOwn) return;
    setViewersLoading(true);
    try {
      const { data } = await api.get(`/statuses/${current.id}/views`);
      setViewers(data);
    } catch {}
    finally { setViewersLoading(false); }
  };

  const toggleViewers = () => {
    if (!showViewers) {
      loadViewers();
      setPaused(true);
    } else {
      setPaused(false);
    }
    setShowViewers(v => !v);
  };

  const handleDelete = async () => {
    if (!current || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/statuses/${current.id}`);
      goNextStatus();
    } finally { setDeleting(false); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !current || replyLoading) return;
    setReplyLoading(true);
    try {
      await api.post(`/statuses/${current.id}/reply`, { content: reply.trim() });
      setReply('');
      setReplySent(true);
      setTimeout(() => setReplySent(false), 3000);
    } catch {}
    finally { setReplyLoading(false); }
  };

  const sendReaction = async (emoji: string) => {
    if (!current) return;
    try {
      await api.post(`/statuses/${current.id}/reply`, { content: emoji });
      setReplySent(true);
      setTimeout(() => setReplySent(false), 2000);
    } catch {}
  };

  const handlePauseStart = () => {
    if (paused) return;
    pausedAtRef.current = Date.now() - startRef.current;
    setPaused(true);
    clearInterval(timerRef.current);
  };

  const handlePauseEnd = () => {
    if (showViewers) return;
    startRef.current = Date.now() - pausedAtRef.current;
    setPaused(false);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowRight') goNextStatus();
    if (e.key === 'ArrowLeft') goPrevStatus();
  }, [onClose, goNextStatus, goPrevStatus]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!group || !current) return null;

  const bg = current.type === 'text' ? (current.background || '#075e54') : '#000';

  const formatViewedAt = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)' }}>

      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full max-w-sm h-full max-h-[760px] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: bg }}
        onMouseDown={handlePauseStart}
        onMouseUp={handlePauseEnd}
        onTouchStart={handlePauseStart}
        onTouchEnd={handlePauseEnd}>

        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
          {group.statuses.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white transition-none"
                style={{ width: i < statusIdx ? '100%' : i === statusIdx ? `${progress}%` : '0%' }} />
            </div>
          ))}
        </div>

        {/* Header gradient overlay */}
        <div className="absolute top-0 left-0 right-0 h-24 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }} />

        {/* Header */}
        <div className="absolute top-7 left-3 right-3 z-20 flex items-center gap-2.5">
          <Avatar src={group.avatar} name={group.username} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight truncate">{group.username}</p>
            <p className="text-white/60 text-xs">
              {new Date(current.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {paused && <span className="ml-2 font-medium text-white/80">· PAUSED</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isOwn && (
              <button onClick={e => { e.stopPropagation(); toggleViewers(); }}
                className="p-2 rounded-full text-white/80 hover:text-white transition-colors hover:bg-white/15"
                title="Who viewed">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
              </button>
            )}
            {isOwn && (
              <button onClick={e => { e.stopPropagation(); handleDelete(); }}
                disabled={deleting}
                className="p-2 rounded-full text-white/80 hover:text-white transition-colors hover:bg-white/15"
                title="Delete">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            )}
            {/* Mute/unmute for videos */}
            {current.type === 'video' && (
              <button onClick={e => { e.stopPropagation(); setMuted(m => !m); if (videoRef.current) videoRef.current.muted = !muted; }}
                className="p-2 rounded-full text-white/80 hover:text-white transition-colors hover:bg-white/15">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  {muted
                    ? <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                    : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  }
                </svg>
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); onClose(); }}
              className="p-2 rounded-full text-white/80 hover:text-white transition-colors hover:bg-white/15">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex items-center justify-center p-6 select-none">
          {current.type === 'text' ? (
            <p className="text-white font-semibold leading-relaxed text-center drop-shadow-lg"
              style={{ fontSize: current.font_size || 24 }}>
              {current.content}
            </p>
          ) : current.type === 'image' ? (
            <img src={current.file_url || ''} alt="Status"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" draggable={false} />
          ) : (
            <video ref={videoRef} src={current.file_url || ''} autoPlay muted={muted} loop
              className="max-w-full max-h-full rounded-lg shadow-2xl" />
          )}
          {/* Caption for media */}
          {current.type !== 'text' && current.content && (
            <div className="absolute bottom-24 left-0 right-0 px-6">
              <p className="text-white text-sm text-center font-medium drop-shadow-lg bg-black/30 rounded-xl px-4 py-2">
                {current.content}
              </p>
            </div>
          )}
        </div>

        {/* Tap zones (prev / next) */}
        <div className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-pointer"
          onClick={e => { e.stopPropagation(); goPrevStatus(); }} />
        <div className="absolute inset-y-0 right-0 w-1/3 z-10 cursor-pointer"
          onClick={e => { e.stopPropagation(); goNextStatus(); }} />

        {/* Bottom gradient overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)' }} />

        {/* Bottom: Reply + reactions (others' statuses only) */}
        {!isOwn && (
          <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-4">
            {/* Emoji reactions */}
            <div className="flex justify-center gap-2 mb-2">
              {QUICK_REACTIONS.map(emoji => (
                <button key={emoji}
                  onClick={e => { e.stopPropagation(); sendReaction(emoji); }}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-lg transition-transform hover:scale-125 shadow-lg"
                  style={{ background: 'rgba(0,0,0,0.4)' }}>
                  {emoji}
                </button>
              ))}
            </div>
            {/* Reply input */}
            <div className="flex items-center gap-2" onMouseDown={e => e.stopPropagation()}>
              <div className="flex-1 flex items-center rounded-full px-4 py-2 gap-2"
                style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)' }}>
                <input
                  ref={replyInputRef}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onFocus={() => setPaused(true)}
                  onBlur={() => setPaused(false)}
                  onKeyDown={e => { if (e.key === 'Enter') sendReply(); e.stopPropagation(); }}
                  placeholder={replySent ? '✓ Sent!' : 'Reply to status…'}
                  className="flex-1 bg-transparent text-sm outline-none text-white placeholder-white/60"
                />
              </div>
              <button
                onClick={e => { e.stopPropagation(); sendReply(); }}
                disabled={!reply.trim() || replyLoading}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-wa-green text-white disabled:opacity-40 transition-opacity">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Bottom: viewer count (own statuses) */}
        {isOwn && !showViewers && (
          <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-4">
            <button onClick={e => { e.stopPropagation(); toggleViewers(); }}
              className="flex items-center gap-2 text-white/80 hover:text-white text-sm">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
              {(() => {
                const cnt = viewCounts[current.id] ?? current.view_count ?? 0;
                return cnt > 0 ? `${cnt} view${cnt !== 1 ? 's' : ''}` : 'No views yet';
              })()}
            </button>
          </div>
        )}

        {/* Viewer list panel */}
        {isOwn && showViewers && (
          <div className="absolute bottom-0 left-0 right-0 z-30 rounded-t-2xl overflow-hidden"
            style={{ background: 'var(--panel)', maxHeight: '50%' }}
            onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--separator)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {viewersLoading ? 'Loading…' : `${viewers.length} viewer${viewers.length !== 1 ? 's' : ''}`}
              </p>
              <button onClick={e => { e.stopPropagation(); toggleViewers(); }} style={{ color: 'var(--icon)' }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M19 13H5v-2h14v2z"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
              {viewers.length === 0 && !viewersLoading && (
                <p className="px-4 py-6 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>No views yet</p>
              )}
              {viewers.map(v => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm text-white shrink-0"
                    style={{ background: 'var(--accent)' }}>
                    {v.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{v.username}</p>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    {formatViewedAt(v.viewed_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Group navigation dots */}
        {allGroups.length > 1 && (
          <div className="absolute top-[72px] left-0 right-0 z-20 flex justify-center gap-1.5 pointer-events-none">
            {allGroups.map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full transition-all"
                style={{ background: i === groupIdx ? 'white' : 'rgba(255,255,255,0.3)' }} />
            ))}
          </div>
        )}
      </div>

      {/* Prev / next group arrows */}
      {groupIdx > 0 && (
        <button onClick={e => { e.stopPropagation(); setGroupIdx(g => g - 1); setStatusIdx(0); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
        </button>
      )}
      {groupIdx < allGroups.length - 1 && (
        <button onClick={e => { e.stopPropagation(); setGroupIdx(g => g + 1); setStatusIdx(0); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
        </button>
      )}
    </div>
  );
}
