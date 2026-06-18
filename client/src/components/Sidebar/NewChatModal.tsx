import { useState, useEffect, useCallback } from 'react';
import { User, Chat } from '../../types';
import api from '../../api/axios';
import Avatar from '../common/Avatar';

interface Props {
  onClose: () => void;
  onSelectChat: (chat: Chat) => void;
}

export default function NewChatModal({ onClose, onSelectChat }: Props) {
  const [tab, setTab] = useState<'direct' | 'group'>('direct');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);

  const searchUsers = useCallback(async (q: string) => {
    if (!q.trim()) { setUsers([]); return; }
    const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
    setUsers(data);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchUsers(search), 300);
    return () => clearTimeout(t);
  }, [search, searchUsers]);

  const handleDirectChat = async (user: User) => {
    setLoading(true);
    try {
      const { data } = await api.post('/chats/direct', { userId: user.id });
      const { data: chatData } = await api.get(`/chats/${data.id}`);
      onSelectChat({ ...chatData, other_user: user });
      onClose();
    } finally { setLoading(false); }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selected.length < 1) return;
    setLoading(true);
    try {
      const { data } = await api.post('/chats/group', { name: groupName, memberIds: selected.map(u => u.id) });
      const { data: chatData } = await api.get(`/chats/${data.id}`);
      onSelectChat(chatData);
      onClose();
    } finally { setLoading(false); }
  };

  const toggleSelect = (user: User) => {
    setSelected(prev => prev.find(u => u.id === user.id) ? prev.filter(u => u.id !== user.id) : [...prev, user]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden fade-in"
        style={{ background: 'var(--panel)' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-wa-teal text-white">
          <button onClick={onClose} className="hover:opacity-80">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <h2 className="font-medium text-lg">{tab === 'direct' ? 'New chat' : 'New group'}</h2>
        </div>

        {/* Tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--separator)' }}>
          {(['direct', 'group'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setSelected([]); }}
              className={`flex-1 py-3 text-sm font-medium transition-colors capitalize ${tab === t ? 'border-b-2 border-wa-green text-wa-green' : ''}`}
              style={tab !== t ? { color: 'var(--text-secondary)' } : {}}>
              {t === 'direct' ? 'Direct' : 'Group'}
            </button>
          ))}
        </div>

        {/* Selected chips (group) */}
        {tab === 'group' && selected.length > 0 && (
          <div className="px-4 py-2 flex flex-wrap gap-2">
            {selected.map(u => (
              <span key={u.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                style={{ background: 'var(--hover)', color: 'var(--text-primary)' }}>
                <Avatar src={u.avatar} name={u.username} size={16} />
                {u.username}
                <button onClick={() => toggleSelect(u)} className="ml-1 text-red-400 hover:text-red-500">×</button>
              </span>
            ))}
          </div>
        )}

        {/* Group name input */}
        {tab === 'group' && (
          <div className="px-4 pt-3">
            <input type="text" placeholder="Group name" value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="w-full pb-2 text-sm outline-none border-b border-wa-green bg-transparent"
              style={{ color: 'var(--text-primary)' }} />
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-3">
          <div className="flex items-center rounded-full px-4 py-2 gap-2" style={{ background: 'var(--input-bg)' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current" style={{ color: 'var(--icon)' }}>
              <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"/>
            </svg>
            <input type="text" placeholder="Search users..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-sm flex-1 outline-none"
              style={{ color: 'var(--text-primary)' }} />
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-64">
          {users.map(u => (
            <button key={u.id}
              onClick={() => tab === 'direct' ? handleDirectChat(u) : toggleSelect(u)}
              className="w-full flex items-center gap-3 px-4 py-3 transition-opacity hover:opacity-80">
              <Avatar src={u.avatar} name={u.username} size={44} />
              <div className="flex-1 text-left">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.username}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{u.about}</div>
              </div>
              {tab === 'group' && selected.find(s => s.id === u.id) && (
                <div className="w-5 h-5 rounded-full bg-wa-green flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                </div>
              )}
            </button>
          ))}
          {search && users.length === 0 && (
            <p className="text-center text-sm py-6" style={{ color: 'var(--text-secondary)' }}>No users found</p>
          )}
          {!search && (
            <p className="text-center text-xs py-4" style={{ color: 'var(--text-tertiary)' }}>Search for users to add</p>
          )}
        </div>

        {/* Create group button */}
        {tab === 'group' && (
          <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--separator)' }}>
            <button onClick={handleCreateGroup}
              disabled={!groupName.trim() || selected.length < 1 || loading}
              className="w-full bg-wa-green hover:bg-wa-green-dark text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50">
              {loading ? 'Creating...' : `Create group${selected.length > 0 ? ` (${selected.length})` : ''}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
