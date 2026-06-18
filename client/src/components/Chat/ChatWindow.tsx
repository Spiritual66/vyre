import { useState, useEffect, useRef, useCallback } from 'react';
import { Chat, Message } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import ChatHeader from './ChatHeader';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ChatInfoPanel from './ChatInfoPanel';
import ForwardModal from './ForwardModal';
import MessageInfoPanel from './MessageInfoPanel';
import api from '../../api/axios';

interface Props {
  chat: Chat;
  onlineUsers: Record<string, boolean>;
  onBack?: () => void;
  onChatUpdate?: (chat: Chat) => void;
  onStartCall?: (remoteUser: { id: string; username: string; avatar: string | null }, type: 'audio' | 'video') => void;
  onLeaveChat?: () => void;
}

function TypingIndicator({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <div className="px-4 py-1">
      <div className="inline-flex items-center gap-2 rounded-xl px-3 py-2 shadow-sm"
        style={{ background: 'var(--msg-in)' }}>
        <span className="flex gap-1 items-center">
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-tertiary)', animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-tertiary)', animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: 'var(--text-tertiary)', animationDelay: '300ms' }} />
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {names.length === 1 ? `${names[0]} is typing` : 'Several people are typing'}
        </span>
      </div>
    </div>
  );
}

export default function ChatWindow({ chat, onlineUsers, onBack, onChatUpdate, onStartCall, onLeaveChat }: Props) {
  const { user } = useAuth();
  const { socket, sendMessage, sendTyping, markRead, typingUsers, sendEdit } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [infoMsg, setInfoMsg] = useState<Message | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [currentChat, setCurrentChat] = useState(chat);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedMsgIds, setPinnedMsgIds] = useState<Set<string>>(new Set());
  const [showPinnedList, setShowPinnedList] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);

  const playSound = useCallback(() => {
    if (localStorage.getItem('notif_sound') === 'false') return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }, []);

  // Update local chat when prop changes
  useEffect(() => { setCurrentChat(chat); }, [chat]);

  // Load messages
  const loadMessages = useCallback(async (before?: number) => {
    try {
      const params = before ? `?before=${before}&limit=50` : '?limit=50';
      const { data } = await api.get(`/chats/${currentChat.id}/messages${params}`);
      if (before) {
        setMessages(prev => [...data, ...prev]);
        setHasMore(data.length === 50);
      } else {
        setMessages(data);
        setHasMore(data.length === 50);
        setTimeout(() => messagesEndRef.current?.scrollIntoView(), 50);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentChat.id]);

  // Load pinned messages
  const loadPinned = useCallback(async () => {
    try {
      const { data } = await api.get(`/chats/${currentChat.id}/pinned`);
      setPinnedMessages(data);
      setPinnedMsgIds(new Set(data.map((m: Message) => m.id)));
    } catch {}
  }, [currentChat.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setHasMore(true);
    setSearchMode(false);
    setSearchTerm('');
    setPinnedMessages([]);
    setPinnedMsgIds(new Set());
    loadMessages();
    loadPinned();
    markRead(currentChat.id);
  }, [currentChat.id]);

  // Scroll-to-bottom tracking
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    setShowScrollBtn(!atBottom);
    if (!atBottom || loadingMore || !hasMore) return;
    if (el.scrollTop < 100) {
      setLoadingMore(true);
      prevScrollHeight.current = el.scrollHeight;
      const oldest = messages[0]?.created_at;
      if (oldest) loadMessages(oldest);
    }
  }, [loadingMore, hasMore, messages, loadMessages]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !loadingMore) return;
    el.scrollTop = el.scrollHeight - prevScrollHeight.current;
  }, [messages, loadingMore]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // In-chat search
  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const { data } = await api.get(`/messages/search?q=${encodeURIComponent(q)}&chatId=${currentChat.id}`);
      setSearchResults(data);
    } catch {}
  }, [currentChat.id]);

  useEffect(() => {
    const t = setTimeout(() => handleSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm, handleSearch]);

  // Send message
  const handleSend = useCallback((content: string, type = 'text', fileUrl?: string, replyToId?: string, fileName?: string, fileSize?: number) => {
    sendMessage({ chatId: currentChat.id, content, type, fileUrl, replyTo: replyToId, fileName, fileSize }, res => {
      if (res.success && res.message) {
        setMessages(prev => prev.find(m => m.id === res.message!.id) ? prev : [...prev, res.message!]);
        setTimeout(scrollToBottom, 50);
      }
    });
    setReplyTo(null);
  }, [currentChat.id, sendMessage]);

  // Delete message
  const handleDelete = useCallback(async (msgId: string) => {
    try {
      await api.delete(`/messages/${msgId}`);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, type: 'deleted' as const, content: null } : m));
    } catch {}
  }, []);

  // Edit message
  const handleEdit = useCallback((msgId: string, content: string) => {
    sendEdit(msgId, content);
  }, [sendEdit]);

  // Star message
  const handleStar = useCallback(async (msgId: string) => {
    try {
      await api.post(`/chats/${currentChat.id}/messages/${msgId}/star`);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_starred: !m.is_starred } : m));
    } catch {}
  }, [currentChat.id]);

  // Pin / unpin message
  const handlePin = useCallback((msgId: string) => {
    socket?.emit('message:pin', { chatId: currentChat.id, messageId: msgId });
  }, [socket, currentChat.id]);

  const handleUnpin = useCallback((msgId: string) => {
    socket?.emit('message:unpin', { chatId: currentChat.id, messageId: msgId });
  }, [socket, currentChat.id]);

  // Scroll to a specific message by id
  const scrollToMessage = useCallback((msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Subscribe to pin/unpin events
  useEffect(() => {
    if (!socket) return;
    const onPinned = ({ chatId, messageId, msg }: { chatId: string; messageId: string; msg: Message }) => {
      if (chatId !== currentChat.id) return;
      const full = messages.find(m => m.id === messageId) || msg;
      setPinnedMessages(prev => [full, ...prev.filter(m => m.id !== messageId)]);
      setPinnedMsgIds(prev => new Set([...prev, messageId]));
    };
    const onUnpinned = ({ chatId, messageId }: { chatId: string; messageId: string }) => {
      if (chatId !== currentChat.id) return;
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
      setPinnedMsgIds(prev => { const n = new Set(prev); n.delete(messageId); return n; });
    };
    socket.on('message:pinned', onPinned);
    socket.on('message:unpinned', onUnpinned);
    return () => {
      socket.off('message:pinned', onPinned);
      socket.off('message:unpinned', onUnpinned);
    };
  }, [socket, currentChat.id, messages]);

  // Subscribe to reaction updates for this chat
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { messageId: string; chatId: string; reactions: any[] }) => {
      if (data.chatId !== currentChat.id) return;
      setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, reactions: data.reactions } : m));
    };
    socket.on('reaction:updated', handler);
    return () => { socket.off('reaction:updated', handler); };
  }, [socket, currentChat.id]);

  // Subscribe to new messages for this chat
  useEffect(() => {
    if (!socket) return;
    const handler = (msg: Message) => {
      if (msg.chat_id !== currentChat.id) return;
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      setTimeout(scrollToBottom, 50);
      if (msg.sender_id !== user?.id) {
        markRead(currentChat.id);
        const effectivelyMuted = currentChat.is_muted && (!currentChat.mute_until || currentChat.mute_until > Date.now());
        if (!effectivelyMuted) playSound();
      }
    };
    socket.on('message:new', handler);
    return () => { socket.off('message:new', handler); };
  }, [socket, currentChat.id, user?.id, markRead, playSound]);

  // Subscribe to read-receipt status updates
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { chatId: string; userId: string; messageIds: string[]; status: string }) => {
      if (data.chatId !== currentChat.id) return;
      const idSet = new Set(data.messageIds);
      setMessages(prev => prev.map(m => {
        if (!idSet.has(m.id)) return m;
        const updated = m.statuses.map(s => s.user_id === data.userId ? { ...s, status: data.status as any } : s);
        const hadUser = m.statuses.some(s => s.user_id === data.userId);
        return { ...m, statuses: hadUser ? updated : [...m.statuses, { user_id: data.userId, status: data.status as any }] };
      }));
    };
    socket.on('message:status_update', handler);
    return () => { socket.off('message:status_update', handler); };
  }, [socket, currentChat.id]);

  // Subscribe to message edits
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { messageId: string; chatId: string; content: string; editedAt: number }) => {
      if (data.chatId !== currentChat.id) return;
      setMessages(prev => prev.map(m => m.id === data.messageId
        ? { ...m, content: data.content, edited_at: data.editedAt }
        : m));
    };
    socket.on('message:edited', handler);
    return () => { socket.off('message:edited', handler); };
  }, [socket, currentChat.id]);

  // Subscribe to message deletes from other users
  useEffect(() => {
    if (!socket) return;
    const handler = (data: { messageId: string; chatId: string }) => {
      if (data.chatId !== currentChat.id) return;
      setMessages(prev => prev.map(m => m.id === data.messageId
        ? { ...m, type: 'deleted' as const, content: null, file_url: null, file_name: null, edited_at: null }
        : m));
    };
    socket.on('message:deleted', handler);
    return () => { socket.off('message:deleted', handler); };
  }, [socket, currentChat.id]);

  const typingInChat = typingUsers[currentChat.id] || [];
  const typingNames = typingInChat.map(uid => {
    // For group chats check members list; for DMs use the other_user
    if (currentChat.is_group) {
      const member = currentChat.members?.find(m => m.id === uid);
      return member?.username || 'Someone';
    }
    return currentChat.other_user?.username || 'Someone';
  });

  const isOnline = !currentChat.is_group && currentChat.other_user ? onlineUsers[currentChat.other_user.id] : false;
  const displayMessages = searchMode && searchTerm ? searchResults : messages;

  if (loading) return (
    <div className="flex-1 flex flex-col">
      <ChatHeader chat={currentChat} online={isOnline} onBack={onBack}
        onInfoClick={() => setShowInfo(true)} onSearchClick={() => setSearchMode(true)} />
      <div className="flex-1 flex items-center justify-center chat-bg">
        <svg className="animate-spin w-8 h-8 text-wa-green" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <ChatHeader
          chat={currentChat}
          online={isOnline}
          typingUsernames={typingNames}
          onBack={onBack}
          onInfoClick={() => setShowInfo(s => !s)}
          onSearchClick={() => { setSearchMode(s => !s); setSearchTerm(''); }}
          onVoiceCall={onStartCall && !currentChat.is_group && currentChat.other_user
            ? () => onStartCall({ id: currentChat.other_user!.id, username: currentChat.other_user!.username, avatar: currentChat.other_user!.avatar ?? null }, 'audio')
            : undefined}
          onVideoCall={onStartCall && !currentChat.is_group && currentChat.other_user
            ? () => onStartCall({ id: currentChat.other_user!.id, username: currentChat.other_user!.username, avatar: currentChat.other_user!.avatar ?? null }, 'video')
            : undefined}
        />

        {/* In-chat search bar */}
        {searchMode && (
          <div className="px-4 py-2 border-b flex items-center gap-2"
            style={{ background: 'var(--header)', borderColor: 'var(--separator)' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current" style={{ color: 'var(--icon)' }}>
              <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"/>
            </svg>
            <input
              autoFocus
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search messages..."
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            {searchTerm && (
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </span>
            )}
            <button onClick={() => { setSearchMode(false); setSearchTerm(''); setSearchResults([]); }}
              style={{ color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        )}

        {/* Pinned messages banner */}
        {pinnedMessages.length > 0 && !searchMode && (
          <div
            className="flex items-center gap-3 px-4 py-2 border-b cursor-pointer hover:opacity-80 transition-opacity"
            style={{ background: 'var(--header)', borderColor: 'var(--separator)' }}
            onClick={() => pinnedMessages.length === 1 ? scrollToMessage(pinnedMessages[0].id) : setShowPinnedList(true)}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" style={{ fill: 'var(--accent)' }}>
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/>
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                {pinnedMessages.length === 1 ? 'Pinned message' : `${pinnedMessages.length} pinned messages`}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {pinnedMessages[0].type === 'image' ? '📷 Photo' :
                 pinnedMessages[0].type === 'audio' ? '🎵 Voice' :
                 pinnedMessages[0].type === 'video' ? '🎥 Video' :
                 pinnedMessages[0].type === 'location' ? '📍 Location' :
                 pinnedMessages[0].type === 'contact' ? '👤 Contact' :
                 pinnedMessages[0].type === 'file' ? `📎 ${pinnedMessages[0].file_name}` :
                 pinnedMessages[0].content || ''}
              </p>
            </div>
            {pinnedMessages.length > 1 && (
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" style={{ fill: 'var(--icon)' }}>
                <path d="M7 10l5 5 5-5z"/>
              </svg>
            )}
          </div>
        )}

        {/* Pinned messages list modal */}
        {showPinnedList && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}
            onClick={() => setShowPinnedList(false)}>
            <div className="w-80 max-h-[70vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
              style={{ background: 'var(--panel)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--separator)', background: 'var(--header)' }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" style={{ fill: 'var(--accent)' }}><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/></svg>
                <span className="font-semibold text-sm flex-1" style={{ color: 'var(--text-primary)' }}>
                  Pinned Messages ({pinnedMessages.length})
                </span>
                <button onClick={() => setShowPinnedList(false)} style={{ color: 'var(--icon)' }}>
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {pinnedMessages.map(pm => (
                  <div key={pm.id}
                    className="flex items-start gap-3 px-4 py-3 border-b hover:opacity-80 transition-opacity cursor-pointer"
                    style={{ borderColor: 'var(--separator)' }}
                    onClick={() => { setShowPinnedList(false); scrollToMessage(pm.id); }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 mt-0.5" style={{ fill: 'var(--accent)' }}><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/></svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {pm.sender_name}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                        {pm.type === 'image' ? '📷 Photo' :
                         pm.type === 'audio' ? '🎵 Voice' :
                         pm.type === 'video' ? '🎥 Video' :
                         pm.type === 'location' ? '📍 Location' :
                         pm.type === 'contact' ? '👤 Contact' :
                         pm.type === 'file' ? `📎 ${pm.file_name}` :
                         pm.content || ''}
                      </p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleUnpin(pm.id); }}
                      className="shrink-0 p-1 rounded hover:opacity-60 transition-opacity"
                      style={{ color: 'var(--icon)' }}
                      title="Unpin">
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto chat-bg py-2 relative">
          {loadingMore && (
            <div className="flex justify-center py-2">
              <svg className="animate-spin w-5 h-5 text-wa-green" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          )}

          {displayMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm px-6 py-3 rounded-full opacity-80"
                style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }}>
                {searchMode && searchTerm
                  ? 'No messages found'
                  : currentChat.is_group
                    ? `You created "${currentChat.name}". Say hi!`
                    : `Send a message to ${currentChat.other_user?.username}`}
              </div>
            </div>
          )}

          {displayMessages.map((msg, i) => (
            <div key={msg.id} id={`msg-${msg.id}`}>
              <MessageBubble
                message={msg}
                prevMessage={displayMessages[i - 1]}
                isGroup={!!currentChat.is_group}
                onReply={setReplyTo}
                onDelete={handleDelete}
                onForward={setForwardMsg}
                onStar={handleStar}
                onInfo={setInfoMsg}
                onEdit={handleEdit}
                onPin={handlePin}
                onUnpin={handleUnpin}
                isPinned={pinnedMsgIds.has(msg.id)}
                searchTerm={searchMode ? searchTerm : ''}
              />
            </div>
          ))}

          {!searchMode && <TypingIndicator names={typingNames} />}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && !searchMode && (
          <button onClick={scrollToBottom}
            className="absolute bottom-24 right-6 z-10 w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
            style={{ background: 'var(--panel)', color: 'var(--icon)', border: '1px solid var(--separator)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M7 10l5 5 5-5z"/></svg>
          </button>
        )}

        {!searchMode && (
          <MessageInput
            chatId={currentChat.id}
            onSend={handleSend}
            onTyping={t => sendTyping(currentChat.id, t)}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
          />
        )}
      </div>

      {/* Chat info panel */}
      {showInfo && !infoMsg && (
        <ChatInfoPanel
          chat={currentChat}
          onClose={() => setShowInfo(false)}
          onUpdate={updated => {
            setCurrentChat(updated);
            onChatUpdate?.(updated);
          }}
          onLeaveGroup={onLeaveChat}
        />
      )}

      {/* Message info panel */}
      {infoMsg && (
        <div className="w-80 flex-shrink-0 border-l" style={{ borderColor: 'var(--separator)', background: 'var(--bg)' }}>
          <MessageInfoPanel
            message={infoMsg}
            chatId={currentChat.id}
            onClose={() => setInfoMsg(null)}
          />
        </div>
      )}

      {/* Forward modal */}
      {forwardMsg && <ForwardModal message={forwardMsg} onClose={() => setForwardMsg(null)} />}
    </div>
  );
}
