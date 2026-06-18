import { useState, useRef, useEffect } from 'react';
import { Message, Reaction } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import Avatar from '../common/Avatar';
import ImageLightbox from './ImageLightbox';
import AudioPlayer from './AudioPlayer';
import LocationMessage from './LocationMessage';
import ContactCard from './ContactCard';
import { format, isToday, isYesterday } from 'date-fns';

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

interface Props {
  message: Message;
  prevMessage?: Message;
  isGroup?: boolean;
  onReply?: (msg: Message) => void;
  onDelete?: (msgId: string) => void;
  onForward?: (msg: Message) => void;
  onStar?: (msgId: string) => void;
  onInfo?: (msg: Message) => void;
  onEdit?: (msgId: string, content: string) => void;
  onPin?: (msgId: string) => void;
  onUnpin?: (msgId: string) => void;
  isPinned?: boolean;
  searchTerm?: string;
}

const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🙏'];

function highlight(text: string, term: string) {
  if (!term) return text;
  const idx = text.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + term.length)}</mark>
      {text.slice(idx + term.length)}
    </>
  );
}

function linkify(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">{part}</a>
      : part
  );
}

function CheckMarks({ message, userId }: { message: Message; userId: string }) {
  if (message.sender_id !== userId) return null;
  const allRead = message.statuses.length > 0 && message.statuses.every(s => s.status === 'read');
  const allDelivered = message.statuses.length > 0 && message.statuses.every(s => s.status === 'delivered' || s.status === 'read');
  const color = allRead ? '#53bdeb' : '#8696a0';
  if (allRead || allDelivered) {
    return (
      <svg viewBox="0 0 16 15" width="16" height="15" fill={color}>
        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"/>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 12 11" width="14" height="14" fill="#8696a0">
      <path d="M11.1 0L3.9 7.2 1 4.2 0 5.2l3.9 3.9L12 1z"/>
    </svg>
  );
}

function DateDivider({ ts }: { ts: number }) {
  const d = new Date(ts);
  let label = format(d, 'MMMM d, yyyy');
  if (isToday(d)) label = 'Today';
  else if (isYesterday(d)) label = 'Yesterday';
  return (
    <div className="flex items-center justify-center my-4">
      <span className="text-xs px-4 py-1 rounded-full shadow-sm"
        style={{ background: 'var(--panel)', color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </div>
  );
}

function ReactionBubble({ reactions, onReactionClick }: { reactions: Reaction[]; onReactionClick: (emoji: string) => void }) {
  if (!reactions.length) return null;

  const grouped: Record<string, { count: number; users: string[] }> = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, users: [] };
    grouped[r.emoji].count++;
    grouped[r.emoji].users.push(r.username);
  }

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, { count, users }]) => (
        <button
          key={emoji}
          onClick={() => onReactionClick(emoji)}
          title={users.join(', ')}
          className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full reaction-pop border"
          style={{ background: 'var(--reaction-bg)', borderColor: 'var(--reaction-border)', color: 'var(--text-primary)' }}
        >
          {emoji} {count > 1 && <span>{count}</span>}
        </button>
      ))}
    </div>
  );
}

export default function MessageBubble({ message, prevMessage, isGroup, onReply, onDelete, onForward, onStar, onInfo, onEdit, onPin, onUnpin, isPinned, searchTerm = '' }: Props) {
  const { user } = useAuth();
  const { toggleReaction } = useSocket();
  const [showMenu, setShowMenu] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [editing]);

  const isOwn = message.sender_id === user?.id;
  const isDeleted = message.type === 'deleted';
  const showDate = !prevMessage || new Date(message.created_at).toDateString() !== new Date(prevMessage.created_at).toDateString();
  const showAvatar = isGroup && !isOwn && (!prevMessage || prevMessage.sender_id !== message.sender_id);
  const showName = isGroup && !isOwn && (!prevMessage || prevMessage.sender_id !== message.sender_id);

  const handleCopy = () => {
    if (message.content) navigator.clipboard.writeText(message.content);
    setShowMenu(false);
  };

  const startEdit = () => {
    setEditText(message.content || '');
    setEditing(true);
    setShowMenu(false);
  };

  const commitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== message.content) {
      onEdit?.(message.id, trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditText('');
  };

  const handleReaction = (emoji: string) => {
    toggleReaction(message.id, emoji);
    setShowReactionPicker(false);
    setShowMenu(false);
  };

  const renderContent = () => {
    if (isDeleted) return (
      <span className="italic flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
        This message was deleted
      </span>
    );

    if (message.type === 'image') return (
      <div>
        <img src={message.file_url || ''} alt="Photo"
          className="rounded-lg max-w-[280px] max-h-[300px] object-cover cursor-pointer hover:opacity-95 transition-opacity"
          onClick={() => setLightboxSrc(message.file_url || '')} />
        {message.content && <p className="mt-1 text-sm" style={{ color: 'var(--text-primary)' }}>{linkify(message.content)}</p>}
      </div>
    );

    if (message.type === 'audio') {
      // content stores duration in seconds (set at recording time as fallback for WebM Infinity)
      const knownDuration = message.content ? (parseInt(message.content) || undefined) : undefined;
      return <AudioPlayer src={message.file_url || ''} isOwn={isOwn} knownDuration={knownDuration} />;
    }

    if (message.type === 'video') return (
      <video controls src={message.file_url || ''} className="rounded-lg max-w-[280px] max-h-[280px]" />
    );

    if (message.type === 'location') {
      return <LocationMessage content={message.content || ''} isOwn={isOwn} />;
    }

    if (message.type === 'contact') {
      return <ContactCard content={message.content || ''} isOwn={isOwn} />;
    }

    if (message.type === 'sticker') {
      return (
        <span style={{ fontSize: 72, lineHeight: 1, display: 'block', userSelect: 'none' }}>
          {message.content}
        </span>
      );
    }

    if (message.type === 'file') return (
      <a href={message.file_url || ''} target="_blank" rel="noreferrer"
        className="flex items-center gap-2 p-2 rounded-lg hover:opacity-80 transition-opacity"
        style={{ background: 'rgba(0,0,0,0.08)' }}>
        <svg viewBox="0 0 24 24" className="w-8 h-8 shrink-0" style={{ fill: 'var(--icon)' }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
        </svg>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate max-w-[180px]" style={{ color: 'var(--text-primary)' }}>
            {message.file_name || message.file_url?.split('/').pop()}
          </p>
          {message.file_size && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {formatBytes(message.file_size)}
            </p>
          )}
        </div>
      </a>
    );

    if (editing) {
      return (
        <div className="flex flex-col gap-1">
          <textarea
            ref={editInputRef}
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
              if (e.key === 'Escape') cancelEdit();
            }}
            rows={1}
            className="w-full resize-none text-sm bg-transparent outline-none whitespace-pre-wrap break-words min-w-[150px]"
            style={{ color: 'var(--text-primary)', maxHeight: 120, overflowY: 'auto' }}
          />
          <div className="flex gap-2 justify-end text-xs">
            <button onClick={cancelEdit} style={{ color: 'var(--text-secondary)' }}>Cancel</button>
            <button onClick={commitEdit} className="font-medium text-wa-green">Save</button>
          </div>
        </div>
      );
    }

    return (
      <p className="text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--text-primary)' }}>
        {searchTerm ? highlight(message.content || '', searchTerm) : linkify(message.content || '')}
      </p>
    );
  };

  return (
    <>
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      {showDate && <DateDivider ts={message.created_at} />}

      {message.forwarded_from && (
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} px-4 -mb-1`}>
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
            <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M14 8l-4 4 4 4V8z"/><path d="M8 8l-4 4 4 4V8z"/></svg>
            Forwarded
          </span>
        </div>
      )}

      <div className={`flex items-end gap-1.5 mb-0.5 px-4 group ${isOwn ? 'justify-end' : 'justify-start'}`}>
        {/* Avatar for groups */}
        {!isOwn && isGroup && (
          <div style={{ width: 28, minWidth: 28 }}>
            {showAvatar && <Avatar src={message.sender_avatar} name={message.sender_name} size={28} />}
          </div>
        )}

        <div className="relative max-w-[65%]">
          {/* Quick action bar on hover */}
          {!isDeleted && (
            <div className={`absolute z-20 -top-8 ${isOwn ? 'right-0' : 'left-0'} hidden group-hover:flex items-center gap-1`}>
              {/* Quick reactions */}
              {QUICK_REACTIONS.map(e => (
                <button key={e} onClick={() => handleReaction(e)}
                  className="w-7 h-7 rounded-full text-sm hover:scale-125 transition-transform flex items-center justify-center shadow-sm"
                  style={{ background: 'var(--panel)', border: '1px solid var(--separator)' }}>
                  {e}
                </button>
              ))}
              {/* More options */}
              <button onClick={() => setShowMenu(!showMenu)}
                className="w-7 h-7 rounded-full flex items-center justify-center shadow-sm"
                style={{ background: 'var(--panel)', border: '1px solid var(--separator)', color: 'var(--icon)' }}>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M7 10l5 5 5-5z"/></svg>
              </button>
            </div>
          )}

          {/* Context menu */}
          {showMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
              <div ref={menuRef}
                className={`absolute z-40 rounded-xl shadow-xl py-1 w-44 fade-in ${isOwn ? 'right-0' : 'left-0'} top-0`}
                style={{ background: 'var(--panel)', border: '1px solid var(--separator)' }}>
                <button onClick={() => { onReply?.(message); setShowMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                  Reply
                </button>
                {!isDeleted && message.content && message.type === 'text' && (
                  <button onClick={handleCopy}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                    Copy
                  </button>
                )}
                {isOwn && !isDeleted && (message.type === 'text') && (
                  <button onClick={startEdit}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                    Edit
                  </button>
                )}
                <button onClick={() => { onForward?.(message); setShowMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M14 8l4 4-4 4v-3H6v-2h8V8zm-5-6H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-4h-2v4H5V4h4V2z"/></svg>
                  Forward
                </button>
                <button onClick={() => { onStar?.(message.id); setShowMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ fill: message.is_starred ? '#f5a623' : 'var(--icon)' }}><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  {message.is_starred ? 'Unstar' : 'Star'}
                </button>
                {!isDeleted && (
                  <button onClick={() => { isPinned ? onUnpin?.(message.id) : onPin?.(message.id); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: isPinned ? 'var(--accent)' : 'var(--icon)' }}>
                      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/>
                    </svg>
                    {isPinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
                {isOwn && (
                  <button onClick={() => { onInfo?.(message); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                    Info
                  </button>
                )}
                {isOwn && !isDeleted && (
                  <button onClick={() => { onDelete?.(message.id); setShowMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:opacity-80">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                    Delete
                  </button>
                )}
              </div>
            </>
          )}

          {/* Bubble */}
          <div
            className={message.type === 'sticker'
              ? 'relative'
              : `relative rounded-lg px-3 py-2 shadow-sm ${isOwn ? 'rounded-tr-none msg-out' : 'rounded-tl-none msg-in'}`}
            style={message.type === 'sticker' ? {} : { background: isOwn ? 'var(--msg-out)' : 'var(--msg-in)' }}
          >

            {showName && (
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--accent)' }}>{message.sender_name}</div>
            )}

            {/* Reply preview */}
            {message.reply_to_message && (
              <div className="border-l-4 border-wa-green pl-2 mb-2 py-1 rounded-sm opacity-90"
                style={{ background: 'rgba(0,0,0,0.06)' }}>
                <div className="text-xs font-medium text-wa-green truncate">
                  {message.reply_to_message.sender_id === user?.id ? 'You' : message.sender_name}
                </div>
                <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  {message.reply_to_message.type === 'image' ? '📷 Photo' :
                   message.reply_to_message.type === 'audio' ? '🎵 Voice message' :
                   message.reply_to_message.type === 'video' ? '🎥 Video' :
                   message.reply_to_message.type === 'file' ? `📎 ${message.reply_to_message.file_name}` :
                   message.reply_to_message.type === 'location' ? '📍 Location' :
                   message.reply_to_message.type === 'contact' ? (() => { try { return `👤 ${JSON.parse(message.reply_to_message.content || '{}').name}`; } catch { return '👤 Contact'; } })() :
                   message.reply_to_message.type === 'sticker' ? '🎭 Sticker' :
                   message.reply_to_message.content}
                </div>
              </div>
            )}

            {renderContent()}

            <div className="flex items-center gap-1 justify-end mt-0.5">
              {message.is_starred && (
                <svg viewBox="0 0 24 24" width="11" height="11" fill="#f5a623"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              )}
              {message.edited_at && !isDeleted && (
                <span className="text-[10px] italic" style={{ color: 'var(--text-tertiary)' }}>edited</span>
              )}
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                {format(new Date(message.created_at), 'HH:mm')}
              </span>
              <CheckMarks message={message} userId={user?.id || ''} />
            </div>
          </div>

          {/* Reactions */}
          <ReactionBubble reactions={message.reactions} onReactionClick={handleReaction} />
        </div>
      </div>
    </>
  );
}
