import { useState, useEffect, useCallback } from 'react';
import { Chat, User } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import Avatar from '../common/Avatar';
import ChatListItem from './ChatListItem';
import NewChatModal from './NewChatModal';
import ProfileSettings from '../Profile/ProfileSettings';
import StatusBar from '../Status/StatusBar';
import StarredMessagesPanel from '../Chat/StarredMessagesPanel';
import SettingsPanel from '../Settings/SettingsPanel';
import GlobalSearchPanel from './GlobalSearchPanel';
import CallsPanel from '../Call/CallsPanel';
import api from '../../api/axios';

interface Props {
  chats: Chat[];
  activeChat: Chat | null;
  onSelectChat: (chat: Chat) => void;
  onlineUsers: Record<string, boolean>;
  unreadCounts: Record<string, number>;
  darkMode: boolean;
  onToggleDark: () => void;
  onChatsUpdate: (chats: Chat[]) => void;
  onStartCall: (user: { id: string; username: string; avatar: string | null }, type: 'audio' | 'video') => void;
}

export default function Sidebar({ chats, activeChat, onSelectChat, onlineUsers, unreadCounts, darkMode, onToggleDark, onChatsUpdate, onStartCall }: Props) {
  const { user, logout } = useAuth();
  const { typingUsers, connected } = useSocket();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [showCalls, setShowCalls] = useState(false);

  // Listen for global keyboard shortcut events dispatched by App.tsx
  useEffect(() => {
    const onSearch = () => setShowGlobalSearch(true);
    const onNewChat = () => setShowNewChat(true);
    window.addEventListener('app:openSearch', onSearch);
    window.addEventListener('app:newChat', onNewChat);
    return () => {
      window.removeEventListener('app:openSearch', onSearch);
      window.removeEventListener('app:newChat', onNewChat);
    };
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
      setSearchResults(data);
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => handleSearch(search), 300);
    return () => clearTimeout(t);
  }, [search, handleSearch]);

  const startDirectChat = async (userId: string) => {
    try {
      const { data } = await api.post('/chats/direct', { userId });
      const [chatRes, userRes] = await Promise.all([
        api.get(`/chats/${data.id}`),
        api.get(`/users/${userId}`),
      ]);
      onSelectChat({ ...chatRes.data, other_user: userRes.data });
      setSearch('');
      setSearchResults([]);
    } catch (err) {
      console.error(err);
    }
  };

  const activeChatFilter = showArchived
    ? chats.filter(c => c.is_archived)
    : chats.filter(c => !c.is_archived);

  const filteredChats = activeChatFilter.filter(c => {
    const name = c.is_group ? c.name : c.other_user?.username;
    return !search || name?.toLowerCase().includes(search.toLowerCase());
  });

  const archivedCount = chats.filter(c => c.is_archived).length;

  return (
    <div className="w-[380px] min-w-[320px] flex flex-col border-r h-full"
      style={{ background: 'var(--panel)', borderColor: 'var(--separator)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--header)' }}>
        <button onClick={() => setShowSettings(true)} className="hover:opacity-80 transition-opacity" title="Settings">
          <Avatar src={user?.avatar} name={user?.username} size={40} />
        </button>
        <div className="flex items-center gap-1">
          {/* Dark mode toggle */}
          <button onClick={onToggleDark} title={darkMode ? 'Light mode' : 'Dark mode'}
            className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }}>
            {darkMode ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-12.37l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0zM7.05 18.36l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06c.39-.39.39-1.03 0-1.41s-1.03-.39-1.41 0z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
              </svg>
            )}
          </button>

          {/* Calls panel */}
          <button onClick={() => setShowCalls(true)}
            className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }} title="Calls">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>

          {/* Global message search */}
          <button onClick={() => setShowGlobalSearch(true)}
            className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }} title="Search messages">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"/>
            </svg>
          </button>

          {/* New chat */}
          <button onClick={() => setShowNewChat(true)}
            className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }} title="New chat">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
              <path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975v1.944zm3-4H7.041V7.1h9.975v1.944z"/>
            </svg>
          </button>

          {/* Menu */}
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-full transition-colors hover:opacity-80" style={{ color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M12 7a2 2 0 1 0-.001-4.001A2 2 0 0 0 12 7zm0 2a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 9zm0 6a2 2 0 1 0-.001 3.999A2 2 0 0 0 12 15z"/>
              </svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-10 rounded-xl shadow-xl py-1 w-52 z-50"
                  style={{ background: 'var(--panel)', border: '1px solid var(--separator)' }}>
                  <button onClick={() => { setShowSettings(true); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 text-sm hover:opacity-80 transition-opacity" style={{ color: 'var(--text-primary)' }}>
                    Settings
                  </button>
                  <button onClick={() => { setShowNewChat(true); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                    New group
                  </button>
                  <button onClick={() => { setShowArchived(a => !a); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                    {showArchived ? 'Show chats' : 'Archived chats'}
                  </button>
                  <button onClick={() => { setShowStarred(true); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                    Starred messages
                  </button>
                  <hr style={{ borderColor: 'var(--separator)' }} />
                  <button onClick={() => { onToggleDark(); setShowMenu(false); }}
                    className="w-full text-left px-4 py-3 text-sm hover:opacity-80" style={{ color: 'var(--text-primary)' }}>
                    {darkMode ? 'Light mode' : 'Dark mode'}
                  </button>
                  <hr style={{ borderColor: 'var(--separator)' }} />
                  <button onClick={logout}
                    className="w-full text-left px-4 py-3 text-sm text-red-500 hover:opacity-80">
                    Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Network status banner */}
      {!connected && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium"
          style={{ background: '#f59e0b', color: '#fff' }}>
          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          Reconnecting…
        </div>
      )}

      {/* Status bar */}
      {!showArchived && !search && <StatusBar />}

      {/* Search */}
      <div className="px-3 py-2" style={{ background: 'var(--panel)' }}>
        <div className="flex items-center rounded-full px-4 py-2 gap-2" style={{ background: 'var(--input-bg)' }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current" style={{ color: 'var(--icon)' }}>
            <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"/>
          </svg>
          <input type="text" placeholder={showArchived ? 'Search archived' : 'Search or start new chat'}
            value={search} onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm flex-1 outline-none"
            style={{ color: 'var(--text-primary)' }} />
          {search && (
            <button onClick={() => { setSearch(''); setSearchResults([]); }} style={{ color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Archived label */}
      {showArchived && (
        <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: 'var(--separator)', background: 'var(--hover)' }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27z"/></svg>
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Archived chats</span>
          <button onClick={() => setShowArchived(false)} className="ml-auto" style={{ color: 'var(--icon)' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      )}

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto">
        {/* User search results */}
        {search && searchResults.length > 0 && (
          <>
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide"
              style={{ background: 'var(--bg)', color: 'var(--text-tertiary)' }}>
              Contacts
            </div>
            {searchResults.map(u => (
              <button key={u.id} onClick={() => startDirectChat(u.id)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:opacity-80"
                style={{ background: 'var(--panel)' }}>
                <Avatar src={u.avatar} name={u.username} size={48} online={onlineUsers[u.id]} />
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{u.username}</div>
                  <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{u.about}</div>
                </div>
              </button>
            ))}
          </>
        )}

        {/* Chat items */}
        {(!search || searchResults.length === 0) && filteredChats.map(chat => (
          <ChatListItem
            key={chat.id}
            chat={chat}
            active={activeChat?.id === chat.id}
            onClick={() => onSelectChat(chat)}
            online={!chat.is_group && chat.other_user ? onlineUsers[chat.other_user.id] : false}
            unread={unreadCounts[chat.id] || chat.unread_count}
            typing={(typingUsers[chat.id]?.length ?? 0) > 0}
          />
        ))}

        {/* Archived chats shortcut */}
        {!showArchived && archivedCount > 0 && !search && (
          <button onClick={() => setShowArchived(true)}
            className="w-full flex items-center gap-3 px-4 py-3 border-t hover:opacity-80 transition-opacity"
            style={{ borderColor: 'var(--separator)', background: 'var(--panel)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--hover)' }}>
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" style={{ color: 'var(--icon)' }}><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27z"/></svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-wa-green">Archived</p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{archivedCount} chat{archivedCount > 1 ? 's' : ''}</p>
            </div>
          </button>
        )}

        {filteredChats.length === 0 && !search && (
          <div className="flex flex-col items-center justify-center h-48" style={{ color: 'var(--text-secondary)' }}>
            <svg viewBox="0 0 24 24" className="w-12 h-12 fill-current mb-3 opacity-30"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
            <p className="text-sm">No conversations yet</p>
            <p className="text-xs mt-1 opacity-70">Search for someone to start chatting</p>
          </div>
        )}
      </div>

      {showNewChat && <NewChatModal onClose={() => setShowNewChat(false)} onSelectChat={onSelectChat} />}
      {showProfile && <ProfileSettings onClose={() => setShowProfile(false)} />}
      {showStarred && <StarredMessagesPanel onClose={() => setShowStarred(false)} />}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          darkMode={darkMode}
          onToggleDark={onToggleDark}
        />
      )}
      {showGlobalSearch && (
        <GlobalSearchPanel
          chats={chats}
          onSelectChat={chat => { onSelectChat(chat); setShowGlobalSearch(false); }}
          onClose={() => setShowGlobalSearch(false)}
        />
      )}
      {showCalls && (
        <CallsPanel
          onClose={() => setShowCalls(false)}
          onStartCall={(callUser, type) => { onStartCall(callUser, type); setShowCalls(false); }}
        />
      )}
    </div>
  );
}
