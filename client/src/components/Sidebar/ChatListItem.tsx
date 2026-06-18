import { Chat } from '../../types';
import Avatar from '../common/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { format, isToday, isYesterday } from 'date-fns';

interface Props {
  chat: Chat;
  active: boolean;
  onClick: () => void;
  online?: boolean;
  unread?: number | false;
  typing?: boolean;
}

export default function ChatListItem({ chat, active, onClick, online, unread, typing }: Props) {
  const { user } = useAuth();
  const name = chat.is_group ? chat.name : chat.other_user?.username;
  const avatar = chat.is_group ? (chat.group_avatar ?? chat.avatar) : chat.other_user?.avatar;
  const isMuted = !!chat.is_muted;
  const hasUnread = !!unread && unread > 0;

  const time = chat.last_message_at ? (() => {
    const d = new Date(chat.last_message_at);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'dd/MM/yy');
  })() : '';

  const previewText = () => {
    if (typing) return null; // handled separately
    if (!chat.last_message_type) return <span style={{ color: 'var(--text-tertiary)' }}>No messages yet</span>;
    if (chat.last_message_type === 'deleted') return <span style={{ color: 'var(--text-tertiary)' }}>🚫 Deleted</span>;
    if (chat.last_message_type === 'image') return '📷 Photo';
    if (chat.last_message_type === 'video') return '🎥 Video';
    if (chat.last_message_type === 'audio') return '🎵 Voice message';
    if (chat.last_message_type === 'file') return '📎 File';
    if (chat.last_message_type === 'location') return '📍 Location';
    if (chat.last_message_type === 'contact') return '👤 Contact';
    return chat.last_message || '';
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b ${active ? '' : 'hover:opacity-90'}`}
      style={{
        background: active ? 'var(--active-chat)' : 'var(--panel)',
        borderColor: 'var(--separator)',
      }}>
      <Avatar src={avatar} name={name ?? undefined} size={49} online={online} />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {chat.is_pinned && (
              <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0 fill-current" style={{ color: 'var(--text-tertiary)' }}>
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
              </svg>
            )}
            <span className="text-[15px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {isMuted && (
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" style={{ color: 'var(--text-tertiary)' }}>
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            )}
            <span className="text-xs"
              style={{ color: hasUnread && !isMuted ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: hasUnread && !isMuted ? 600 : 400 }}>
              {time}
            </span>
          </div>
        </div>
        <div className="flex justify-between items-center mt-0.5 gap-2">
          <span className="text-sm truncate" style={{ color: typing ? 'var(--accent)' : 'var(--text-secondary)', maxWidth: '85%' }}>
            {typing ? (
              <span className="flex items-center gap-1">
                <span>typing</span>
                <span className="flex gap-0.5 items-end" style={{ height: 12 }}>
                  <span className="typing-dot inline-block w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} />
                  <span className="typing-dot inline-block w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} />
                  <span className="typing-dot inline-block w-1 h-1 rounded-full" style={{ background: 'var(--accent)' }} />
                </span>
              </span>
            ) : (
              <>
                {chat.last_message_sender === user?.id && (
                  <span className="mr-0.5" style={{ color: 'var(--text-tertiary)' }}>You: </span>
                )}
                {previewText()}
              </>
            )}
          </span>
          {hasUnread && (
            <span className="ml-auto text-white text-xs rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shrink-0 font-medium"
              style={{ background: isMuted ? 'var(--text-tertiary)' : 'var(--accent)' }}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
