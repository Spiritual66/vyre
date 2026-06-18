import { useState, useEffect } from 'react';
import { Message } from '../../types';
import { format } from 'date-fns';
import api from '../../api/axios';

interface Props {
  onClose: () => void;
}

export default function StarredMessagesPanel({ onClose }: Props) {
  const [messages, setMessages] = useState<(Message & { chat_name: string | null; is_group: number })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/chats/starred').then(r => { setMessages(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleUnstar = async (msgId: string, chatId: string) => {
    await api.post(`/chats/${chatId}/messages/${msgId}/star`);
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  const renderPreview = (msg: Message) => {
    if (msg.type === 'image') return '📷 Photo';
    if (msg.type === 'audio') return '🎵 Voice message';
    if (msg.type === 'video') return '🎥 Video';
    if (msg.type === 'file') return `📎 ${msg.file_name || 'File'}`;
    if (msg.type === 'location') return '📍 Location';
    if (msg.type === 'contact') { try { return `👤 ${JSON.parse(msg.content || '{}').name || 'Contact'}`; } catch { return '👤 Contact'; } }
    if (msg.type === 'deleted') return '🚫 Deleted';
    return msg.content || '';
  };

  return (
    <div className="fixed inset-y-0 left-[380px] w-[380px] z-30 flex flex-col shadow-2xl"
      style={{ background: 'var(--panel)', borderRight: '1px solid var(--separator)' }}>
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-4 border-b" style={{ borderColor: 'var(--separator)', background: 'var(--header)' }}>
        <button onClick={onClose} style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <div>
          <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>Starred messages</h2>
          {!loading && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{messages.length} starred</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <svg className="animate-spin w-6 h-6 text-wa-green" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3">
            <svg viewBox="0 0 24 24" className="w-12 h-12 fill-current opacity-20" style={{ color: 'var(--text-secondary)' }}>
              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No starred messages yet</p>
            <p className="text-xs px-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
              Star messages to find them here later
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--separator)' }}>
            {messages.map(msg => (
              <div key={msg.id} className="px-4 py-3 hover:opacity-90 transition-opacity"
                style={{ background: 'var(--panel)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Chat label */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0" style={{ color: 'var(--icon)' }}>
                        {msg.is_group ? <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/> : <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>}
                      </svg>
                      <span className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
                        {msg.is_group ? msg.chat_name : msg.sender_name}
                      </span>
                    </div>
                    {/* Message content */}
                    <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {renderPreview(msg)}
                    </p>
                    {/* Timestamp */}
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {format(new Date(msg.created_at), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                  {/* Unstar button */}
                  <button onClick={() => handleUnstar(msg.id, msg.chat_id)}
                    title="Remove star"
                    className="p-1.5 rounded-full hover:opacity-80 transition-opacity shrink-0 mt-0.5">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#f5a623">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
