import { Chat } from '../../types';
import Avatar from '../common/Avatar';
import { formatDistanceToNow } from 'date-fns';

interface Props {
  chat: Chat;
  online?: boolean;
  typingUsernames?: string[];
  onBack?: () => void;
  onInfoClick?: () => void;
  onSearchClick?: () => void;
  onVoiceCall?: () => void;
  onVideoCall?: () => void;
}

export default function ChatHeader({ chat, online, typingUsernames = [], onBack, onInfoClick, onSearchClick, onVoiceCall, onVideoCall }: Props) {
  const name = chat.is_group ? chat.name : chat.other_user?.username;
  const avatar = chat.is_group ? (chat.group_avatar ?? chat.avatar) : chat.other_user?.avatar;

  const subtitle = () => {
    if (typingUsernames.length > 0) {
      return chat.is_group
        ? `${typingUsernames.slice(0, 2).join(', ')} ${typingUsernames.length === 1 ? 'is' : 'are'} typing...`
        : 'typing...';
    }
    if (!chat.is_group) {
      if (online) return 'online';
      const ls = chat.other_user?.last_seen;
      if (ls) return `last seen ${formatDistanceToNow(new Date(ls), { addSuffix: true })}`;
    }
    if (chat.is_group) {
      const count = chat.members?.length || 0;
      return `${count} participant${count !== 1 ? 's' : ''}`;
    }
    return '';
  };

  const isTyping = typingUsernames.length > 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b" style={{ background: 'var(--header)', borderColor: 'var(--separator)' }}>
      {onBack && (
        <button onClick={onBack} className="p-1 -ml-1 transition-colors" style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
      )}

      <button className="flex items-center gap-3 flex-1 min-w-0" onClick={onInfoClick}>
        <Avatar src={avatar} name={name ?? undefined} size={40} online={!chat.is_group ? online : undefined} />
        <div className="flex-1 text-left min-w-0">
          <div className="text-[15px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{name}</div>
          <div className={`text-xs truncate ${isTyping ? 'text-wa-green font-medium' : ''}`}
            style={!isTyping ? { color: 'var(--text-secondary)' } : {}}>
            {subtitle()}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1">
        {/* Voice call — only for direct chats */}
        {!chat.is_group && onVoiceCall && (
          <button onClick={onVoiceCall} title="Voice call"
            className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
        )}
        {/* Video call — only for direct chats */}
        {!chat.is_group && onVideoCall && (
          <button onClick={onVideoCall} title="Video call"
            className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z"/>
            </svg>
          </button>
        )}
        <button onClick={onSearchClick} title="Search messages"
          className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"/>
          </svg>
        </button>
        <button onClick={onInfoClick} title="Chat info"
          className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
