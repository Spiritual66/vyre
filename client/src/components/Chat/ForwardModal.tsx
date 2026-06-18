import { useState, useEffect } from 'react';
import { Chat, Message } from '../../types';
import api from '../../api/axios';
import Avatar from '../common/Avatar';

interface Props {
  message: Message;
  onClose: () => void;
}

export default function ForwardModal({ message, onClose }: Props) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/chats').then(r => setChats(r.data)).catch(() => {});
  }, []);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const forward = async () => {
    if (!selected.size) return;
    setLoading(true);
    try {
      await api.post(`/messages/${message.id}/forward`, { chatIds: Array.from(selected) });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const filtered = chats.filter(c => {
    const name = c.is_group ? c.name : c.other_user?.username;
    return name?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden slide-in-right"
        style={{ background: 'var(--panel)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--separator)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Forward message</h2>
          <button onClick={onClose} style={{ color: 'var(--icon)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* Message preview */}
        <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--separator)', background: 'var(--hover)' }}>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Forwarding:</p>
          <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
            {message.type === 'image' ? '📷 Photo' :
             message.type === 'video' ? '🎥 Video' :
             message.type === 'audio' ? '🎵 Voice message' :
             message.type === 'file' ? `📎 ${message.file_name}` :
             message.type === 'location' ? '📍 Location' :
             message.type === 'contact' ? (() => { try { return `👤 ${JSON.parse(message.content || '{}').name}`; } catch { return '👤 Contact'; } })() :
             message.content}
          </p>
        </div>

        {/* Search */}
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--separator)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search chats..."
            className="w-full text-sm px-3 py-1.5 rounded-lg outline-none"
            style={{ background: 'var(--input-bg)', color: 'var(--text-primary)' }} />
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map(chat => {
            const name = chat.is_group ? chat.name : chat.other_user?.username;
            const avatar = chat.is_group ? chat.avatar : chat.other_user?.avatar;
            const isSelected = selected.has(chat.id);
            return (
              <button key={chat.id} onClick={() => toggle(chat.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:opacity-80 transition-opacity"
                style={{ background: isSelected ? 'rgba(0,168,132,0.1)' : 'transparent' }}>
                <Avatar src={avatar} name={name || '?'} size={40} />
                <span className="flex-1 text-left text-sm" style={{ color: 'var(--text-primary)' }}>{name}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-wa-green border-wa-green' : 'border-[color:var(--separator)]'}`}>
                  {isSelected && <svg viewBox="0 0 24 24" className="w-3 h-3 fill-white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Send button */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--separator)' }}>
          <button onClick={forward} disabled={!selected.size || loading}
            className="w-full bg-wa-green hover:bg-wa-green-dark text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-40">
            {loading ? 'Forwarding...' : `Forward${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
