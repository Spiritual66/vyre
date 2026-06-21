import { useState, useEffect, useCallback } from 'react';
import { StatusGroup, StatusItem } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../common/Avatar';
import api from '../../api/axios';
import StatusViewer from './StatusViewer';
import StatusCreator from './StatusCreator';

function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return 'yesterday';
}

export default function StatusBar() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [viewState, setViewState] = useState<{ groups: StatusGroup[]; index: number } | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/statuses');
      setGroups(data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  // Real-time: reload when a contact posts or deletes a status
  useEffect(() => {
    window.addEventListener('status:new', load);
    return () => window.removeEventListener('status:new', load);
  }, [load]);

  // Real-time: update view_count when someone views our status
  useEffect(() => {
    const handler = (e: Event) => {
      const { statusId, viewCount } = (e as CustomEvent).detail as { statusId: string; viewCount: number };
      setGroups(prev => prev.map(g => ({
        ...g,
        statuses: g.statuses.map(s => s.id === statusId ? { ...s, view_count: viewCount } : s),
      })));
      // Also update the open viewer if it's showing this status
      setViewState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          groups: prev.groups.map(g => ({
            ...g,
            statuses: g.statuses.map(s => s.id === statusId ? { ...s, view_count: viewCount } : s),
          })),
        };
      });
    };
    window.addEventListener('status:viewed', handler);
    return () => window.removeEventListener('status:viewed', handler);
  }, []);

  const myGroup = groups.find(g => g.user_id === user?.id);
  const others = groups.filter(g => g.user_id !== user?.id);
  const unmuted = others.filter(g => !g.muted);
  const mutedGroups = others.filter(g => g.muted);
  const recent = unmuted.filter(g => g.statuses.some(s => s.viewed === 0));
  const viewed = unmuted.filter(g => g.statuses.every(s => s.viewed > 0));
  const allOthers = [...recent, ...viewed, ...mutedGroups];

  const toggleMute = useCallback(async (g: StatusGroup) => {
    const nowMuted = !g.muted;
    setGroups(prev => prev.map(grp => grp.user_id === g.user_id ? { ...grp, muted: nowMuted } : grp));
    try {
      if (nowMuted) await api.post(`/statuses/mute/${g.user_id}`);
      else await api.delete(`/statuses/mute/${g.user_id}`);
    } catch {
      setGroups(prev => prev.map(grp => grp.user_id === g.user_id ? { ...grp, muted: g.muted } : grp));
    }
  }, []);

  // Optimistically mark all statuses in a group as viewed in local state
  const markGroupViewed = useCallback((g: StatusGroup) => {
    setGroups(prev => prev.map(grp =>
      grp.user_id === g.user_id
        ? { ...grp, statuses: grp.statuses.map(s => ({ ...s, viewed: Math.max(s.viewed, 1) })) }
        : grp
    ));
  }, []);

  const openOther = (g: StatusGroup) => {
    const idx = allOthers.findIndex(x => x.user_id === g.user_id);
    // Build snapshot with current local state
    setViewState({ groups: allOthers, index: Math.max(0, idx) });
    markGroupViewed(g);
  };

  const openMine = () => {
    if (myGroup) setViewState({ groups: [myGroup], index: 0 });
    else setCreating(true);
  };

  const statusRing = (unviewed: boolean) =>
    unviewed
      ? 'p-0.5 bg-gradient-to-br from-green-400 to-teal-500'
      : 'p-0.5 border-2 border-[color:var(--separator)]';

  const renderRow = (g: StatusGroup, unviewed: boolean) => (
    <div key={g.user_id} className="w-full flex items-center gap-2 px-4 py-2.5 hover:opacity-90 transition-opacity">
      <button onClick={() => openOther(g)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div className={`rounded-full ${statusRing(unviewed)}`}>
          <Avatar src={g.avatar} name={g.username} size={46} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{g.username}</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {timeAgo(g.statuses[g.statuses.length - 1].created_at)}
            {unviewed && g.statuses.filter(s => s.viewed === 0).length > 1 && ` · ${g.statuses.filter(s => s.viewed === 0).length} new`}
          </p>
        </div>
      </button>
      {unviewed && <div className="w-2.5 h-2.5 rounded-full bg-wa-green shrink-0" />}
      <button onClick={() => toggleMute(g)} title={g.muted ? 'Unmute status updates' : 'Mute status updates'}
        className="p-1.5 rounded-full hover:opacity-70 shrink-0" style={{ color: 'var(--icon)' }}>
        {g.muted
          ? <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18z"/></svg>
          : <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>}
      </button>
    </div>
  );

  return (
    <>
      <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--separator)' }}>

        {/* My status row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={openMine} className="relative shrink-0">
            <div className={`rounded-full ${myGroup ? statusRing(false) : 'p-0.5 border-2 border-dashed border-[color:var(--text-tertiary)]'}`}>
              <Avatar src={user?.avatar} name={user?.username} size={46} />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-wa-green flex items-center justify-center border-2 border-[color:var(--panel)] shadow-sm">
              <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-white"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>My status</p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {myGroup
                ? `${myGroup.statuses.length} update${myGroup.statuses.length !== 1 ? 's' : ''} · ${timeAgo(myGroup.statuses[myGroup.statuses.length - 1].created_at)}`
                : 'Tap to add status update'}
            </p>
          </div>
          <button onClick={() => setCreating(true)} title="Add status"
            className="p-2 rounded-full hover:opacity-80 transition-opacity" style={{ color: 'var(--icon)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83zm-4.24 1.41L9 15.67V19h3.33l7.47-7.47-3.33-3.08z"/>
            </svg>
          </button>
        </div>

        {/* Recent updates */}
        {recent.length > 0 && (
          <>
            <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ background: 'var(--bg)', color: 'var(--text-tertiary)' }}>
              Recent updates
            </div>
            {recent.map(g => renderRow(g, true))}
          </>
        )}

        {/* Viewed updates */}
        {viewed.length > 0 && (
          <>
            <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ background: 'var(--bg)', color: 'var(--text-tertiary)' }}>
              Viewed updates
            </div>
            {viewed.map(g => renderRow(g, false))}
          </>
        )}

        {/* Muted updates */}
        {mutedGroups.length > 0 && (
          <>
            <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ background: 'var(--bg)', color: 'var(--text-tertiary)' }}>
              Muted updates
            </div>
            {mutedGroups.map(g => renderRow(g, false))}
          </>
        )}

        {others.length === 0 && (
          <p className="px-4 pb-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>No updates from contacts yet</p>
        )}
      </div>

      {viewState && (
        <StatusViewer
          allGroups={viewState.groups}
          startIndex={viewState.index}
          onClose={() => { setViewState(null); load(); }}
        />
      )}
      {creating && (
        <StatusCreator onClose={() => { setCreating(false); load(); }} />
      )}
    </>
  );
}
