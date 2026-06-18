import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '../api/socket';
import { Message, Reaction, TypingState, OnlineUsers } from '../types';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  onlineUsers: OnlineUsers;
  typingUsers: TypingState;
  sendMessage: (data: {
    chatId: string; content?: string; type?: string; fileUrl?: string;
    fileName?: string; fileSize?: number; replyTo?: string;
  }, cb?: (res: { success?: boolean; message?: Message; error?: string }) => void) => void;
  sendTyping: (chatId: string, isTyping: boolean) => void;
  markRead: (chatId: string) => void;
  toggleReaction: (messageId: string, emoji: string, cb?: (res: any) => void) => void;
  sendEdit: (messageId: string, content: string, cb?: (res: any) => void) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const SocketProvider = ({
  children,
  onNewMessage,
  onStatusUpdate,
  onReactionUpdate,
  onGroupUpdate,
  onCallIncoming,
}: {
  children: ReactNode;
  onNewMessage?: (msg: Message) => void;
  onStatusUpdate?: (data: { chatId: string; userId: string; messageIds: string[]; status: string }) => void;
  onReactionUpdate?: (data: { messageId: string; chatId: string; reactions: Reaction[] }) => void;
  onGroupUpdate?: (data: any) => void;
  onCallIncoming?: (data: any) => void;
}) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUsers>({});
  const [typingUsers, setTypingUsers] = useState<TypingState>({});

  // Use refs so socket listeners always call the latest callbacks without needing re-registration
  const onNewMessageRef = useRef(onNewMessage);
  const onStatusUpdateRef = useRef(onStatusUpdate);
  const onReactionUpdateRef = useRef(onReactionUpdate);
  const onGroupUpdateRef = useRef(onGroupUpdate);
  const onCallIncomingRef = useRef(onCallIncoming);
  onNewMessageRef.current = onNewMessage;
  onStatusUpdateRef.current = onStatusUpdate;
  onReactionUpdateRef.current = onReactionUpdate;
  onGroupUpdateRef.current = onGroupUpdate;
  onCallIncomingRef.current = onCallIncoming;

  useEffect(() => {
    if (!token) return;
    const s = getSocket(token);
    setSocket(s as Socket);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onUserOnline = ({ userId }: { userId: string }) => setOnlineUsers(prev => ({ ...prev, [userId]: true }));
    const onUserOffline = ({ userId }: { userId: string }) => setOnlineUsers(prev => ({ ...prev, [userId]: false }));
    const onMsgNew = (msg: Message) => onNewMessageRef.current?.(msg);
    const onStatusUpdate_ = (data: any) => onStatusUpdateRef.current?.(data);
    const onReaction = (data: { messageId: string; chatId: string; reactions: Reaction[] }) => onReactionUpdateRef.current?.(data);
    const onGroupUpdated = (data: any) => onGroupUpdateRef.current?.(data);
    const onMemberAdded = (data: any) => onGroupUpdateRef.current?.({ type: 'member_added', ...data });
    const onMemberRemoved = (data: any) => onGroupUpdateRef.current?.({ type: 'member_removed', ...data });
    const onCallIncomingEvt = (data: any) => onCallIncomingRef.current?.(data);
    const onStatusNew = () => window.dispatchEvent(new CustomEvent('status:new'));
    const onStatusDeleted = () => window.dispatchEvent(new CustomEvent('status:new'));
    const onStatusViewed = (data: { statusId: string; viewCount: number }) =>
      window.dispatchEvent(new CustomEvent('status:viewed', { detail: data }));
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const clearTyping = (chatId: string, uid: string) => {
      setTypingUsers(prev => ({ ...prev, [chatId]: (prev[chatId] || []).filter(id => id !== uid) }));
    };
    const onTypingStart = ({ chatId, userId: uid }: { chatId: string; userId: string }) => {
      if (uid === user?.id) return;
      setTypingUsers(prev => ({ ...prev, [chatId]: [...(prev[chatId] || []).filter(id => id !== uid), uid] }));
      const key = `${chatId}:${uid}`;
      if (typingTimers.has(key)) clearTimeout(typingTimers.get(key)!);
      typingTimers.set(key, setTimeout(() => { clearTyping(chatId, uid); typingTimers.delete(key); }, 10000));
    };
    const onTypingStop = ({ chatId, userId: uid }: { chatId: string; userId: string }) => {
      const key = `${chatId}:${uid}`;
      if (typingTimers.has(key)) { clearTimeout(typingTimers.get(key)!); typingTimers.delete(key); }
      clearTyping(chatId, uid);
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('user:online', onUserOnline);
    s.on('user:offline', onUserOffline);
    s.on('message:new', onMsgNew);
    s.on('message:status_update', onStatusUpdate_);
    s.on('reaction:updated', onReaction);
    s.on('group:updated', onGroupUpdated);
    s.on('group:member_added', onMemberAdded);
    s.on('group:member_removed', onMemberRemoved);
    s.on('typing:start', onTypingStart);
    s.on('typing:stop', onTypingStop);
    s.on('call:incoming', onCallIncomingEvt);
    s.on('status:new', onStatusNew);
    s.on('status:deleted', onStatusDeleted);
    s.on('status:viewed', onStatusViewed);

    const onAdminBroadcast = (data: { id: string; subject: string; message: string; created_at: number }) => {
      window.dispatchEvent(new CustomEvent('admin:broadcast', { detail: data }));
    };
    s.on('admin:broadcast', onAdminBroadcast);

    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('user:online', onUserOnline);
      s.off('user:offline', onUserOffline);
      s.off('message:new', onMsgNew);
      s.off('message:status_update', onStatusUpdate_);
      s.off('reaction:updated', onReaction);
      s.off('group:updated', onGroupUpdated);
      s.off('group:member_added', onMemberAdded);
      s.off('group:member_removed', onMemberRemoved);
      s.off('typing:start', onTypingStart);
      s.off('typing:stop', onTypingStop);
      s.off('call:incoming', onCallIncomingEvt);
      s.off('status:new', onStatusNew);
      s.off('status:deleted', onStatusDeleted);
      s.off('status:viewed', onStatusViewed);
      s.off('admin:broadcast', onAdminBroadcast);
      typingTimers.forEach(t => clearTimeout(t));
      typingTimers.clear();
    };
  }, [token, user?.id]);

  const sendMessage = useCallback((data: any, cb?: any) => {
    socket?.emit('message:send', data, cb);
  }, [socket]);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    socket?.emit(isTyping ? 'typing:start' : 'typing:stop', { chatId });
  }, [socket]);

  const markRead = useCallback((chatId: string) => {
    socket?.emit('message:read', { chatId });
  }, [socket]);

  const toggleReaction = useCallback((messageId: string, emoji: string, cb?: any) => {
    socket?.emit('reaction:toggle', { messageId, emoji }, cb);
  }, [socket]);

  const sendEdit = useCallback((messageId: string, content: string, cb?: any) => {
    socket?.emit('message:edit', { messageId, content }, cb);
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, connected, onlineUsers, typingUsers, sendMessage, sendTyping, markRead, toggleReaction, sendEdit }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
};
