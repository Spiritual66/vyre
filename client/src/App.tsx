import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext';
import { enablePush } from './api/push';
import { SocketProvider, useSocket } from './contexts/SocketContext';
import { Chat, Message } from './types';
import AuthScreen from './components/Auth/AuthScreen';
import Sidebar from './components/Sidebar/Sidebar';
import ChatWindow from './components/Chat/ChatWindow';
import WelcomeScreen from './components/Chat/WelcomeScreen';
import ToastNotification, { ToastItem } from './components/Toast/ToastNotification';
// WebRTC call UI is heavy and only needed during a call — load on demand.
const CallModal = lazy(() => import('./components/Call/CallModal'));
import api from './api/axios';

// Apply persisted appearance settings before first render
(function applyStartupSettings() {
  const fontSize = localStorage.getItem('fontSize');
  if (fontSize) document.documentElement.style.fontSize = `${fontSize}px`;
  const textColor = localStorage.getItem('textColor');
  if (textColor) document.documentElement.style.setProperty('--text-primary', textColor);
  const accentColor = localStorage.getItem('accentColor');
  if (accentColor) {
    document.documentElement.style.setProperty('--accent', accentColor);
    const accentDark = localStorage.getItem('accentColorDark');
    const accentLight = localStorage.getItem('accentColorLight');
    if (accentDark) document.documentElement.style.setProperty('--accent-dark', accentDark);
    if (accentLight) document.documentElement.style.setProperty('--accent-light', accentLight);
  }
  const wallpaper = localStorage.getItem('chatWallpaper');
  const wallpaperType = localStorage.getItem('chatWallpaperType') || 'color';
  if (wallpaper) {
    if (wallpaperType === 'image') {
      document.documentElement.style.setProperty('--chat-bg-image', `url("${wallpaper}")`);
    } else if (wallpaperType === 'gradient') {
      document.documentElement.style.setProperty('--chat-bg-image', wallpaper);
    } else {
      document.documentElement.style.setProperty('--chat-bg-override', wallpaper);
      document.documentElement.style.setProperty('--chat-pattern-override', 'none');
    }
  }
})();

interface IncomingCall {
  callId: string;
  caller: { id: string; username: string; avatar: string | null };
  type: 'audio' | 'video';
  offer: RTCSessionDescriptionInit;
}

// Inner component — lives inside SocketProvider so it can call useSocket()
function AppInner({
  chats, setChats,
  activeChat, setActiveChat,
  unreadCounts, setUnreadCounts,
  mobileView, setMobileView,
  darkMode, setDarkMode,
  activeCall, setActiveCall,
  onCallAccepted,
  toasts, setToasts,
  loadChats,
}: {
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  activeChat: Chat | null;
  setActiveChat: React.Dispatch<React.SetStateAction<Chat | null>>;
  unreadCounts: Record<string, number>;
  setUnreadCounts: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  mobileView: 'sidebar' | 'chat';
  setMobileView: React.Dispatch<React.SetStateAction<'sidebar' | 'chat'>>;
  darkMode: boolean;
  setDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
  activeCall: { callId: string; type: 'audio' | 'video'; mode: 'outgoing' | 'incoming'; remoteUser: { id: string; username: string; avatar: string | null }; offer?: RTCSessionDescriptionInit } | null;
  setActiveCall: React.Dispatch<React.SetStateAction<typeof activeCall>>;
  onCallAccepted: () => void;
  toasts: ToastItem[];
  setToasts: React.Dispatch<React.SetStateAction<ToastItem[]>>;
  loadChats: () => void;
}) {
  const { onlineUsers } = useSocket();
  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;

  const handleSelectChat = useCallback((chat: Chat) => {
    setActiveChat(chat);
    setUnreadCounts(prev => ({ ...prev, [chat.id]: 0 }));
    setChats(prev => prev.map(c => c.id === chat.id ? { ...c, unread_count: 0 } : c));
    setMobileView('chat');
  }, [setActiveChat, setUnreadCounts, setChats, setMobileView]);

  const handleChatUpdate = useCallback((updated: Chat) => {
    setChats(prev => {
      const next = prev.map(c => c.id === updated.id ? updated : c);
      return [...next].sort((a, b) => {
        if (b.is_pinned !== a.is_pinned) return (b.is_pinned || 0) - (a.is_pinned || 0);
        return (b.last_message_at || 0) - (a.last_message_at || 0);
      });
    });
    setActiveChat(prev => prev?.id === updated.id ? updated : prev);
  }, [setChats, setActiveChat]);

  const handleLeaveChat = useCallback(() => {
    const id = activeChatRef.current?.id;
    if (id) setChats(prev => prev.filter(c => c.id !== id));
    setActiveChat(null);
    setMobileView('sidebar');
  }, [setChats, setActiveChat, setMobileView]);

  const startCall = useCallback((remoteUser: { id: string; username: string; avatar: string | null }, type: 'audio' | 'video') => {
    setActiveCall({ callId: '', type, mode: 'outgoing', remoteUser });
  }, [setActiveCall]);

  const handleDismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, [setToasts]);

  const handleClickToast = useCallback((chatId: string, toastId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      handleSelectChat(chat);
    }
    setToasts(prev => prev.filter(t => t.id !== toastId));
  }, [chats, handleSelectChat, setToasts]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { subject, message } = (e as CustomEvent<{ id: string; subject: string; message: string; created_at: number }>).detail;
      const id = `broadcast-${Date.now()}`;
      setToasts(prev => [...prev, {
        id,
        chatId: '',
        senderName: `📢 ${subject}`,
        senderAvatar: null,
        body: message,
        isGroup: false,
        duration: 15000,
      }]);
    };
    window.addEventListener('admin:broadcast', handler);
    return () => window.removeEventListener('admin:broadcast', handler);
  }, [setToasts]);

  return (
    <div className="flex w-full h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <div className={`${mobileView === 'chat' ? 'hidden md:flex' : 'flex'} flex-col`}>
        <Sidebar
          chats={chats}
          activeChat={activeChat}
          onSelectChat={handleSelectChat}
          onlineUsers={onlineUsers}
          unreadCounts={unreadCounts}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(d => !d)}
          onChatsUpdate={setChats}
          onStartCall={startCall}
        />
      </div>

      <div className={`${mobileView === 'sidebar' ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 relative`}>
        {activeChat ? (
          <ChatWindow
            key={activeChat.id}
            chat={activeChat}
            onlineUsers={onlineUsers}
            onBack={() => setMobileView('sidebar')}
            onChatUpdate={handleChatUpdate}
            onStartCall={startCall}
            onLeaveChat={handleLeaveChat}
          />
        ) : (
          <WelcomeScreen />
        )}
      </div>

      {activeCall && (
        <Suspense fallback={null}>
          <CallModal
            callId={activeCall.callId}
            type={activeCall.type}
            mode={activeCall.mode}
            remoteUser={activeCall.remoteUser}
            offer={activeCall.offer}
            onClose={() => setActiveCall(null)}
            onAccepted={onCallAccepted}
          />
        </Suspense>
      )}

      <ToastNotification
        toasts={toasts}
        onDismiss={handleDismissToast}
        onClickToast={handleClickToast}
      />
    </div>
  );
}

function isInQuietHours(): boolean {
  if (localStorage.getItem('notif_quiet') !== 'true') return false;
  const from = localStorage.getItem('notif_quiet_from') || '22:00';
  const to = localStorage.getItem('notif_quiet_to') || '08:00';
  const now = new Date();
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const nowM = now.getHours() * 60 + now.getMinutes();
  const fromM = fh * 60 + fm;
  const toM = th * 60 + tm;
  // spans midnight when from > to
  return fromM <= toM ? (nowM >= fromM && nowM < toM) : (nowM >= fromM || nowM < toM);
}

async function playNotificationPing() {
  try {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const freqs = [880, 1100];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t); osc.stop(t + 0.2);
    });
    setTimeout(() => { try { ctx.close(); } catch {} }, 500);
  } catch {}
}

// Outer shell — holds all state and SocketProvider
function AppContent() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [mobileView, setMobileView] = useState<'sidebar' | 'chat'>('sidebar');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [activeCall, setActiveCall] = useState<{
    callId: string;
    type: 'audio' | 'video';
    mode: 'outgoing' | 'incoming';
    remoteUser: { id: string; username: string; avatar: string | null };
    offer?: RTCSessionDescriptionInit;
  } | null>(null);

  // Refs for values used in stable callbacks (avoids stale closures)
  const activeChatIdRef = useRef<string | null>(null);
  const chatsRef = useRef<Chat[]>([]);
  activeChatIdRef.current = activeChat?.id ?? null;
  chatsRef.current = chats;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  // Update browser tab title with total unread count
  useEffect(() => {
    const total = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
    document.title = total > 0 ? `(${total}) VYRE` : 'VYRE';
  }, [unreadCounts]);

  // Once logged in, register for web-push (requests permission if needed, then
  // subscribes this device so offline messages arrive as notifications).
  useEffect(() => {
    if (user) enablePush();
  }, [user?.id]);

  const loadChats = useCallback(async () => {
    try {
      const { data } = await api.get('/chats');
      setChats(data);
    } catch {}
  }, []);

  useEffect(() => { if (user) loadChats(); }, [user, loadChats]);

  // Stable handler — uses refs so deps don't cause recreation on every chat change
  const handleNewMessage = useCallback((msg: Message) => {
    setChats(prev => {
      const idx = prev.findIndex(c => c.id === msg.chat_id);
      if (idx === -1) { loadChats(); return prev; }
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        last_message: msg.content,
        last_message_type: msg.type,
        last_message_at: msg.created_at,
        last_message_sender: msg.sender_id,
        unread_count: msg.sender_id !== user?.id && msg.chat_id !== activeChatIdRef.current
          ? (updated[idx].unread_count || 0) + 1
          : updated[idx].unread_count,
      };
      return updated.sort((a, b) => (b.last_message_at || 0) - (a.last_message_at || 0));
    });

    if (msg.sender_id !== user?.id && msg.chat_id !== activeChatIdRef.current) {
      setUnreadCounts(prev => ({ ...prev, [msg.chat_id]: (prev[msg.chat_id] || 0) + 1 }));
      const chat = chatsRef.current.find(c => c.id === msg.chat_id);
      const effectivelyMuted = chat?.is_muted && (!chat.mute_until || chat.mute_until > Date.now());
      if (!effectivelyMuted && !isInQuietHours()) {
        const from = chat?.is_group ? `${msg.sender_name} in ${chat.name}` : (msg.sender_name || 'New message');
        const body = msg.type === 'image' ? '📷 Photo' :
                     msg.type === 'audio' ? '🎵 Voice message' :
                     msg.type === 'video' ? '🎥 Video' :
                     msg.type === 'file' ? `📎 ${msg.file_name || 'File'}` :
                     msg.type === 'location' ? '📍 Location' :
                     msg.type === 'contact' ? '👤 Contact' :
                     msg.content || '';

        // Desktop notification (respect notif_preview)
        if ('Notification' in window && Notification.permission === 'granted') {
          const showPreview = localStorage.getItem('notif_preview') !== 'false';
          new Notification(from, {
            body: showPreview ? body : 'New message',
            icon: '/icon-192.png',
            tag: `chat-${msg.chat_id}`,
          } as NotificationOptions);
        }

        // Notification sound
        if (localStorage.getItem('notif_sound') !== 'false') {
          playNotificationPing();
        }

        // In-app toast
        if (localStorage.getItem('notif_messages') !== 'false') {
          const toastId = `${msg.chat_id}-${Date.now()}`;
          setToasts(prev => [
            ...prev.slice(-4),
            {
              id: toastId,
              chatId: msg.chat_id,
              senderName: msg.sender_name || 'Unknown',
              senderAvatar: null,
              body: localStorage.getItem('notif_preview') !== 'false' ? body : 'New message',
              isGroup: !!chat?.is_group,
              chatName: chat?.name ?? undefined,
            },
          ]);
        }
      }
    }
  }, [user?.id, loadChats]);

  const handleGroupUpdate = useCallback(() => { loadChats(); }, [loadChats]);

  const ringtoneRef = useRef<{ ctx: AudioContext; stop: () => void } | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      try { ringtoneRef.current.stop(); ringtoneRef.current.ctx.close(); } catch {}
      ringtoneRef.current = null;
    }
  }, []);

  const playRingtone = useCallback(() => {
    stopRingtone();
    try {
      const ctx = new AudioContext();
      let playing = true;
      const playChime = () => {
        if (!playing) return;
        const freqs = [523, 659, 784, 659];
        freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine'; osc.frequency.value = freq;
          const t = ctx.currentTime + i * 0.18;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.25, t + 0.04);
          gain.gain.linearRampToValueAtTime(0, t + 0.16);
          osc.start(t); osc.stop(t + 0.18);
        });
        setTimeout(() => { if (playing) playChime(); }, 1200);
      };
      playChime();
      ringtoneRef.current = { ctx, stop: () => { playing = false; } };
    } catch {}
  }, [stopRingtone]);

  // Stop ringtone when call is answered/rejected/closed
  const hasCall = !!activeCall;
  const callMode = activeCall?.mode;
  useEffect(() => {
    if (!hasCall) stopRingtone();
    else if (callMode === 'incoming') playRingtone();
    else stopRingtone(); // outgoing — no ring
  }, [hasCall, callMode, playRingtone, stopRingtone]);

  // Global keyboard shortcuts — dispatch custom events that Sidebar listens for
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:openSearch'));
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:newChat'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Open a DM from a ContactCard "Message" button
  useEffect(() => {
    const handler = async (e: Event) => {
      const { userId } = (e as CustomEvent<{ userId: string }>).detail;
      if (!userId) return;
      try {
        const { data: chat } = await api.post('/chats/direct', { userId });
        setChats(prev => {
          const exists = prev.find(c => c.id === chat.id);
          if (!exists) return [chat, ...prev];
          return prev.map(c => c.id === chat.id ? chat : c);
        });
        setActiveChat(chat);
        setMobileView('chat');
      } catch {}
    };
    window.addEventListener('vyre:open-dm', handler);
    return () => window.removeEventListener('vyre:open-dm', handler);
  }, []);

  const handleCallIncoming = useCallback((data: IncomingCall) => {
    setActiveCall(prev => prev ? prev : {
      callId: data.callId, type: data.type, mode: 'incoming',
      remoteUser: data.caller, offer: data.offer,
    });
    // Desktop notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Incoming ${data.type} call`, {
        body: `${data.caller.username} is calling you`,
        icon: data.caller.avatar || '/icon-192.png',
        tag: 'incoming-call',
      });
    }
  }, []);

  const handleCallAccepted = useCallback(() => {
    stopRingtone();
  }, [stopRingtone]);

  return (
    <SocketProvider
      onNewMessage={handleNewMessage}
      onStatusUpdate={() => {}}
      onReactionUpdate={() => {}}
      onGroupUpdate={handleGroupUpdate}
      onCallIncoming={handleCallIncoming}
    >
      <AppInner
        chats={chats} setChats={setChats}
        activeChat={activeChat} setActiveChat={setActiveChat}
        unreadCounts={unreadCounts} setUnreadCounts={setUnreadCounts}
        mobileView={mobileView} setMobileView={setMobileView}
        darkMode={darkMode} setDarkMode={setDarkMode}
        activeCall={activeCall} setActiveCall={setActiveCall as any}
        onCallAccepted={handleCallAccepted}
        toasts={toasts} setToasts={setToasts}
        loadChats={loadChats}
      />
    </SocketProvider>
  );
}

export default function App() {
  const { user } = useAuth();
  if (!user) return <AuthScreen />;
  return <AppContent />;
}
