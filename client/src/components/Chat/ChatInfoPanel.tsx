import { useState, useEffect, useRef } from 'react';
import { Chat } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../common/Avatar';
import api from '../../api/axios';

interface Props {
  chat: Chat;
  onClose: () => void;
  onUpdate: (chat: Chat) => void;
  onLeaveGroup?: () => void;
}

interface MediaItem { id: string; file_url: string; type: string; file_name: string | null; }

export default function ChatInfoPanel({ chat, onClose, onUpdate, onLeaveGroup }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'media' | 'docs'>('media');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(chat.name || '');
  const [newDesc, setNewDesc] = useState(chat.description || '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [pinned, setPinned] = useState(!!chat.is_pinned);
  const [muted, setMuted] = useState(!!chat.is_muted);
  const [muteUntil, setMuteUntil] = useState<number | null>(chat.mute_until ?? null);
  const [showMutePicker, setShowMutePicker] = useState(false);
  const [archived, setArchived] = useState(!!chat.is_archived);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const isAdmin = chat.is_group ? chat.members?.some(m => m.id === user?.id && m.role === 'admin') : false;
  const otherUser = !chat.is_group ? chat.other_user : null;
  const mutePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get(`/chats/${chat.id}/media`).then(r => setMedia(r.data)).catch(() => {});
    if (!chat.is_group && otherUser) {
      api.get(`/users/${otherUser.id}`).then(r => setIsBlocked(!!r.data.isBlocked)).catch(() => {});
    }
  }, [chat.id, chat.is_group, otherUser]);

  useEffect(() => {
    if (!showMutePicker) return;
    const handler = (e: MouseEvent) => {
      if (mutePickerRef.current && !mutePickerRef.current.contains(e.target as Node)) {
        setShowMutePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMutePicker]);

  const updateSettings = async (key: string, val: boolean) => {
    await api.put(`/chats/${chat.id}/settings`, { [key]: val });
    onUpdate({ ...chat, [key]: val ? 1 : 0 });
  };

  const handlePinToggle = async () => { const n = !pinned; setPinned(n); await updateSettings('is_pinned', n); };
  const handleArchiveToggle = async () => { const n = !archived; setArchived(n); await updateSettings('is_archived', n); };

  const handleMuteSelect = async (durationMs: number | null) => {
    setShowMutePicker(false);
    const until = durationMs ? Date.now() + durationMs : null;
    setMuted(true);
    setMuteUntil(until);
    await api.put(`/chats/${chat.id}/settings`, { is_muted: true, mute_until: until });
    onUpdate({ ...chat, is_muted: 1, mute_until: until });
  };

  const handleUnmute = async () => {
    setMuted(false);
    setMuteUntil(null);
    await api.put(`/chats/${chat.id}/settings`, { is_muted: false, mute_until: null });
    onUpdate({ ...chat, is_muted: 0, mute_until: null });
  };

  const muteLabel = () => {
    if (!muted) return 'Mute notifications';
    if (!muteUntil) return 'Muted (always)';
    const diff = muteUntil - Date.now();
    if (diff <= 0) return 'Muted (expired)';
    if (diff < 3600000) return `Muted (${Math.ceil(diff / 60000)}m left)`;
    if (diff < 86400000) return `Muted (${Math.ceil(diff / 3600000)}h left)`;
    return `Muted (${Math.ceil(diff / 86400000)}d left)`;
  };

  const handleNameSave = async () => {
    if (!newName.trim()) return;
    await api.put(`/chats/${chat.id}`, { name: newName.trim() });
    onUpdate({ ...chat, name: newName.trim() });
    setEditingName(false);
  };

  const handleDescSave = async () => {
    await api.put(`/chats/${chat.id}`, { description: newDesc.trim() });
    onUpdate({ ...chat, description: newDesc.trim() });
    setEditingDesc(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this member?')) return;
    await api.delete(`/chats/${chat.id}/members/${memberId}`);
    onUpdate({ ...chat, members: chat.members?.filter(m => m.id !== memberId) });
  };

  const handlePromote = async (memberId: string, newRole: 'admin' | 'member') => {
    await api.put(`/chats/${chat.id}/members/${memberId}/role`, { role: newRole });
    onUpdate({
      ...chat,
      members: chat.members?.map(m => m.id === memberId ? { ...m, role: newRole } : m),
    });
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Leave this group? You won\'t receive new messages.')) return;
    try {
      await api.post(`/chats/${chat.id}/leave`);
      onLeaveGroup?.();
      onClose();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to leave group');
    }
  };

  const handleBlockToggle = async () => {
    if (!otherUser) return;
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await api.delete(`/users/block/${otherUser.id}`);
        setIsBlocked(false);
      } else {
        if (!confirm(`Block ${otherUser.username}? They won't be able to send you messages.`)) { setBlockLoading(false); return; }
        await api.post(`/users/block/${otherUser.id}`);
        setIsBlocked(true);
      }
    } catch {} finally {
      setBlockLoading(false);
    }
  };

  const images = media.filter(m => m.type === 'image');
  const docs = media.filter(m => m.type === 'file');

  const Toggle = ({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between py-2.5 hover:opacity-80 transition-opacity">
      <div className="flex items-center gap-3">
        <span style={{ color: 'var(--icon)' }}>{icon}</span>
        <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
      </div>
      <div className="w-10 h-6 rounded-full relative transition-colors"
        style={{ background: on ? 'var(--accent)' : 'var(--separator)' }}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-1'}`} />
      </div>
    </button>
  );

  return (
    <div className="flex flex-col h-full w-80 border-l shadow-lg" style={{ background: 'var(--panel)', borderColor: 'var(--separator)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'var(--separator)', background: 'var(--header)' }}>
        <button onClick={onClose} style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
        <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
          {chat.is_group ? 'Group info' : 'Contact info'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar + name */}
        <div className="flex flex-col items-center py-6 px-4" style={{ background: 'var(--panel)' }}>
          <Avatar src={otherUser?.avatar || chat.avatar || chat.group_avatar} name={otherUser?.username || chat.name || '?'} size={80} />
          <div className="mt-3 text-center w-full">
            {editingName && isAdmin ? (
              <div className="flex items-center justify-center gap-2">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  className="text-lg font-semibold px-2 py-1 rounded border outline-none"
                  style={{ color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--separator)' }}
                  onKeyDown={e => e.key === 'Enter' && handleNameSave()}
                  autoFocus />
                <button onClick={handleNameSave} className="text-wa-green text-sm font-medium">Save</button>
                <button onClick={() => setEditingName(false)} className="text-sm" style={{ color: 'var(--text-secondary)' }}>✕</button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {otherUser?.username || chat.name}
                </h3>
                {isAdmin && (
                  <button onClick={() => setEditingName(true)} style={{ color: 'var(--icon)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  </button>
                )}
              </div>
            )}
            {chat.is_group && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {chat.members?.length || 0} members
              </p>
            )}
            {otherUser && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {otherUser.about || 'Hey there! I am using VYRE.'}
              </p>
            )}
          </div>
        </div>

        {/* Group description */}
        {chat.is_group && (
          <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--separator)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--icon)' }}>Description</p>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  className="w-full text-sm px-2 py-1 rounded border outline-none resize-none"
                  style={{ color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--separator)' }}
                  rows={3} autoFocus />
                <div className="flex gap-2">
                  <button onClick={handleDescSave} className="text-sm text-wa-green font-medium">Save</button>
                  <button onClick={() => setEditingDesc(false)} className="text-sm" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1" style={{ color: chat.description ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {chat.description || (isAdmin ? 'Add group description' : 'No description')}
                </p>
                {isAdmin && (
                  <button onClick={() => setEditingDesc(true)} style={{ color: 'var(--icon)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Settings toggles */}
        <div className="px-4 py-2 border-t" style={{ borderColor: 'var(--separator)' }}>
          <Toggle on={pinned} onClick={handlePinToggle} label="Pin chat"
            icon={<svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>} />
          {/* Mute with duration picker */}
          <div className="relative" ref={mutePickerRef}>
            <div className="flex items-center gap-3 py-2 cursor-pointer" onClick={muted ? handleUnmute : () => setShowMutePicker(p => !p)}>
              <span style={{ color: 'var(--icon)' }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
              </span>
              <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{muteLabel()}</span>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${muted ? 'bg-wa-green' : ''}`}
                style={!muted ? { background: 'var(--separator)' } : {}}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${muted ? 'translate-x-4' : ''}`} />
              </div>
            </div>
            {showMutePicker && (
              <div className="absolute left-8 right-0 z-10 rounded-lg shadow-xl overflow-hidden"
                style={{ background: 'var(--panel)', border: '1px solid var(--separator)', top: '100%' }}>
                {[
                  { label: '8 hours', ms: 8 * 3600000 },
                  { label: '1 week', ms: 7 * 86400000 },
                  { label: 'Always', ms: null },
                ].map(opt => (
                  <button key={opt.label} onClick={() => handleMuteSelect(opt.ms)}
                    className="w-full text-left px-4 py-2 text-sm hover:opacity-80 transition-opacity"
                    style={{ color: 'var(--text-primary)' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Toggle on={archived} onClick={handleArchiveToggle} label="Archive chat"
            icon={<svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5z"/></svg>} />
        </div>

        {/* Shared media */}
        <div className="border-t" style={{ borderColor: 'var(--separator)' }}>
          <div className="flex border-b" style={{ borderColor: 'var(--separator)' }}>
            {(['media', 'docs'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-xs font-medium capitalize transition-colors ${tab === t ? 'border-b-2 border-wa-green text-wa-green' : ''}`}
                style={tab !== t ? { color: 'var(--text-secondary)' } : {}}>
                {t === 'media' ? 'Media' : 'Docs'}
              </button>
            ))}
          </div>
          <div className="p-3">
            {tab === 'media' && (
              images.length > 0
                ? <div className="grid grid-cols-3 gap-1">
                    {images.slice(0, 9).map(m => (
                      <img key={m.id} src={m.file_url} alt="" onClick={() => window.open(m.file_url, '_blank')}
                        className="w-full aspect-square object-cover rounded cursor-pointer hover:opacity-80 transition-opacity" />
                    ))}
                  </div>
                : <p className="text-sm text-center py-4" style={{ color: 'var(--text-tertiary)' }}>No shared media</p>
            )}
            {tab === 'docs' && (
              docs.length > 0
                ? <div className="space-y-2">
                    {docs.map(m => (
                      <a key={m.id} href={m.file_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg hover:opacity-80"
                        style={{ background: 'var(--hover)' }}>
                        <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0 fill-current" style={{ color: 'var(--icon)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
                        <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{m.file_name}</span>
                      </a>
                    ))}
                  </div>
                : <p className="text-sm text-center py-4" style={{ color: 'var(--text-tertiary)' }}>No shared docs</p>
            )}
          </div>
        </div>

        {/* Members (groups) */}
        {chat.is_group && chat.members && (
          <div className="border-t" style={{ borderColor: 'var(--separator)' }}>
            <div className="px-4 py-3">
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--icon)' }}>
                {chat.members.length} members
              </p>
              {chat.members.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2">
                  <Avatar src={m.avatar} name={m.username} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {m.id === user?.id ? 'You' : m.username}
                      </span>
                      {m.role === 'admin' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full text-wa-green border border-wa-green shrink-0">admin</span>
                      )}
                    </div>
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {m.about || 'Hey there!'}
                    </p>
                  </div>
                  {isAdmin && m.id !== user?.id && (
                    <div className="flex gap-1">
                      <button onClick={() => handlePromote(m.id, m.role === 'admin' ? 'member' : 'admin')}
                        title={m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                        className="p-1 rounded hover:opacity-80" style={{ color: 'var(--icon)' }}>
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                      </button>
                      <button onClick={() => handleRemoveMember(m.id)} title="Remove"
                        className="p-1 rounded hover:opacity-80 text-red-500">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div className="border-t px-4 py-3 space-y-1" style={{ borderColor: 'var(--separator)' }}>
          {/* Block/unblock (direct chats) */}
          {!chat.is_group && otherUser && (
            <button onClick={handleBlockToggle} disabled={blockLoading}
              className={`w-full flex items-center gap-3 py-2.5 text-sm text-left transition-opacity hover:opacity-80 ${isBlocked ? 'text-wa-green' : 'text-red-500'}`}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/>
              </svg>
              {isBlocked ? `Unblock ${otherUser.username}` : `Block ${otherUser.username}`}
            </button>
          )}

          {/* Leave group */}
          {chat.is_group && (
            <button onClick={handleLeaveGroup}
              className="w-full flex items-center gap-3 py-2.5 text-sm text-left text-red-500 transition-opacity hover:opacity-80">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
              </svg>
              Leave group
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
