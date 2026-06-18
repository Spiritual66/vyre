import { useEffect, useState } from 'react';
import { Message } from '../../types';
import api from '../../api/axios';
import Avatar from '../common/Avatar';
import { format } from 'date-fns';

interface StatusRow {
  user_id: string;
  username: string;
  avatar: string | null;
  status: 'sent' | 'delivered' | 'read';
  updated_at: number | null;
}

interface Props {
  message: Message;
  chatId: string;
  onClose: () => void;
}

export default function MessageInfoPanel({ message, chatId, onClose }: Props) {
  const [statuses, setStatuses] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/chats/${chatId}/messages/${message.id}/info`)
      .then(r => setStatuses(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chatId, message.id]);

  const readList = statuses.filter(s => s.status === 'read');
  const deliveredList = statuses.filter(s => s.status === 'delivered');

  const UserRow = ({ s }: { s: StatusRow }) => (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Avatar src={s.avatar} name={s.username} size={36} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.username}</div>
        {s.updated_at && (
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {format(new Date(s.updated_at), 'MMM d, HH:mm')}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ background: 'var(--header)', borderColor: 'var(--separator)' }}>
        <button onClick={onClose} className="p-1 -ml-1" style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Message info</span>
      </div>

      {/* Message preview */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--separator)' }}>
        <div className="rounded-xl p-3 text-sm max-w-xs ml-auto"
          style={{ background: 'var(--msg-out)', color: 'var(--text-primary)' }}>
          {message.type === 'image' ? '📷 Photo' :
           message.type === 'video' ? '🎥 Video' :
           message.type === 'audio' ? '🎵 Voice message' :
           message.type === 'file' ? `📎 ${message.file_name}` :
           message.type === 'location' ? '📍 Location' :
           message.type === 'contact' ? (() => { try { return `👤 ${JSON.parse(message.content || '{}').name}`; } catch { return '👤 Contact'; } })() :
           message.content}
        </div>
        <div className="text-xs mt-1 text-right" style={{ color: 'var(--text-secondary)' }}>
          {format(new Date(message.created_at), 'MMM d, HH:mm')}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <svg className="animate-spin w-6 h-6 text-wa-green" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {readList.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                <svg viewBox="0 0 16 11" className="w-4 h-4 fill-[#53bdeb]">
                  <path d="M11.071.653a.75.75 0 0 1 1.061 1.061l-7.25 7.25a.75.75 0 0 1-1.061 0l-3.5-3.5A.75.75 0 1 1 1.382 4.4L4.35 7.37 11.071.653z"/>
                  <path d="M6.25 7.371L4.6 5.722l-.707.707L5.72 8.253a.75.75 0 0 0 1.06 0L14.25.782 13.543.075 6.25 7.371z" transform="translate(1 0)"/>
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#53bdeb' }}>
                  Read · {readList.length}
                </span>
              </div>
              {readList.map(s => <UserRow key={s.user_id} s={s} />)}
            </div>
          )}

          {deliveredList.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                <svg viewBox="0 0 16 11" className="w-4 h-4" style={{ fill: 'var(--text-secondary)' }}>
                  <path d="M11.071.653a.75.75 0 0 1 1.061 1.061l-7.25 7.25a.75.75 0 0 1-1.061 0l-3.5-3.5A.75.75 0 1 1 1.382 4.4L4.35 7.37 11.071.653z"/>
                  <path d="M6.25 7.371L4.6 5.722l-.707.707L5.72 8.253a.75.75 0 0 0 1.06 0L14.25.782 13.543.075 6.25 7.371z" transform="translate(1 0)"/>
                </svg>
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                  Delivered · {deliveredList.length}
                </span>
              </div>
              {deliveredList.map(s => <UserRow key={s.user_id} s={s} />)}
            </div>
          )}

          {!readList.length && !deliveredList.length && (
            <div className="flex-1 flex items-center justify-center py-12">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No delivery info yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
