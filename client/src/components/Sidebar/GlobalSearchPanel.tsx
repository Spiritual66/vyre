import { useState, useEffect, useRef } from 'react';
import { Chat } from '../../types';
import api from '../../api/axios';
import { format, isToday, isYesterday } from 'date-fns';

interface SearchResult {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  content: string | null;
  type: string;
  created_at: number;
  chat_name: string | null;
  is_group: number;
  other_username: string | null;
}

interface Props {
  chats: Chat[];
  onSelectChat: (chat: Chat) => void;
  onClose: () => void;
}

export default function GlobalSearchPanel({ chats, onSelectChat, onClose }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/messages/search?q=${encodeURIComponent(q)}`);
        setResults(data);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const handleClick = async (r: SearchResult) => {
    const existing = chats.find(c => c.id === r.chat_id);
    if (existing) {
      onSelectChat(existing);
    } else {
      try {
        const { data } = await api.get(`/chats/${r.chat_id}`);
        onSelectChat(data);
      } catch {}
    }
    onClose();
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'dd/MM/yy');
  };

  const chatLabel = (r: SearchResult) =>
    r.is_group ? (r.chat_name || 'Group') : (r.other_username || 'Direct message');

  const chatInitial = (r: SearchResult) =>
    (r.is_group ? r.chat_name : r.other_username)?.[0]?.toUpperCase() || '?';

  const COLORS = ['#128c7e','#25d366','#34b7f1','#8e44ad','#e74c3c','#f39c12','#2c3e50','#16a085'];
  const colorFor = (id: string) => COLORS[id.charCodeAt(0) % COLORS.length];

  const preview = (r: SearchResult) => {
    if (r.type === 'image') return '📷 Photo';
    if (r.type === 'audio') return '🎵 Voice message';
    if (r.type === 'video') return '🎥 Video';
    if (r.type === 'file') return '📎 File';
    if (r.type === 'location') return '📍 Location';
    if (r.type === 'contact') { try { return `👤 ${JSON.parse(r.content || '{}').name || 'Contact'}`; } catch { return '👤 Contact'; } }
    return r.content || '';
  };

  const highlight = (text: string, term: string) => {
    if (!term.trim()) return text;
    const idx = text.toLowerCase().indexOf(term.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(255,213,0,0.4)', borderRadius: 2 }}>
          {text.slice(idx, idx + term.length)}
        </mark>
        {text.slice(idx + term.length)}
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-14 px-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden fade-in"
        style={{ background: 'var(--panel)', maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: 'var(--header)', borderBottom: '1px solid var(--separator)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 fill-current" style={{ color: 'var(--icon)' }}>
            <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"/>
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search all messages…"
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {q && (
            <button onClick={() => setQ('')} className="shrink-0 transition-opacity hover:opacity-60" style={{ color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          )}
          <button onClick={onClose} className="shrink-0 transition-opacity hover:opacity-60" style={{ color: 'var(--icon)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-10">
              <svg className="animate-spin w-7 h-7 text-wa-green" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          )}

          {!loading && !q && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <svg viewBox="0 0 24 24" className="w-12 h-12 fill-current opacity-15" style={{ color: 'var(--text-secondary)' }}>
                <path d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"/>
              </svg>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Search all messages</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Find messages across all your chats</p>
            </div>
          )}

          {!loading && q && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <svg viewBox="0 0 24 24" className="w-12 h-12 fill-current opacity-15" style={{ color: 'var(--text-secondary)' }}>
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
              </svg>
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No results for "{q}"</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Try different keywords</p>
            </div>
          )}

          {!loading && results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => handleClick(r)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
              style={{ borderBottom: i < results.length - 1 ? '1px solid var(--separator)' : 'none' }}
            >
              <div
                className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-white font-semibold text-base"
                style={{ background: colorFor(r.chat_id) }}
              >
                {chatInitial(r)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {chatLabel(r)}
                  </span>
                  <span className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                    {formatTime(r.created_at)}
                  </span>
                </div>
                <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-medium" style={{ color: 'var(--text-tertiary)' }}>{r.sender_name}: </span>
                  {highlight(preview(r), q)}
                </p>
              </div>
            </button>
          ))}
        </div>

        {!loading && results.length > 0 && (
          <div className="px-4 py-2 text-center text-xs border-t" style={{ color: 'var(--text-tertiary)', borderColor: 'var(--separator)' }}>
            {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
