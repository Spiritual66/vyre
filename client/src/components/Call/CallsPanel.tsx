import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/axios';
import { format, isToday, isYesterday } from 'date-fns';

interface CallRecord {
  id: string;
  caller_id: string;
  callee_id: string;
  caller_username: string;
  caller_avatar: string | null;
  callee_username: string;
  callee_avatar: string | null;
  type: 'audio' | 'video';
  status: 'ringing' | 'answered' | 'declined' | 'missed';
  duration: number;
  started_at: number;
  ended_at: number | null;
}

interface Props {
  onClose: () => void;
  onStartCall: (user: { id: string; username: string; avatar: string | null }, type: 'audio' | 'video') => void;
}

function fmtDuration(s: number) {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'dd/MM/yy');
}

export default function CallsPanel({ onClose, onStartCall }: Props) {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'missed'>('all');

  useEffect(() => {
    api.get('/calls').then(({ data }) => setCalls(data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'missed'
    ? calls.filter(c => c.status === 'missed' || (c.status === 'declined' && c.callee_id === user?.id))
    : calls;

  return (
    <div className="fixed inset-y-0 left-0 z-40 w-[380px] flex flex-col shadow-2xl fade-in"
      style={{ background: 'var(--panel)' }}>

      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-4 border-b"
        style={{ background: 'var(--header)', borderColor: 'var(--separator)' }}>
        <button onClick={onClose} style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Calls</h2>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--separator)' }}>
        {(['all', 'missed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className="flex-1 py-3 text-sm font-medium transition-colors capitalize"
            style={{
              color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: filter === f ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-12">
            <svg className="animate-spin w-7 h-7 text-wa-green" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-56 gap-3">
            <svg viewBox="0 0 24 24" className="w-14 h-14 fill-current opacity-20" style={{ color: 'var(--text-secondary)' }}>
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No {filter === 'missed' ? 'missed ' : ''}calls yet</p>
          </div>
        )}

        {!loading && filtered.map(call => {
          const isOutgoing = call.caller_id === user?.id;
          const other = isOutgoing
            ? { id: call.callee_id, username: call.callee_username, avatar: call.callee_avatar }
            : { id: call.caller_id, username: call.caller_username, avatar: call.caller_avatar };

          const isMissed = call.status === 'missed' || (call.status === 'declined' && !isOutgoing);
          const statusColor = isMissed ? '#ef4444' : 'var(--text-secondary)';
          const statusLabel =
            call.status === 'answered' ? (isOutgoing ? 'Outgoing' : 'Incoming') :
            call.status === 'declined' ? (isOutgoing ? 'Declined' : 'Declined') :
            call.status === 'missed' ? (isOutgoing ? 'No answer' : 'Missed') : 'Unknown';

          const initials = other.username[0]?.toUpperCase();

          return (
            <div key={call.id} className="flex items-center gap-3 px-4 py-3 border-b hover:opacity-90 transition-opacity"
              style={{ borderColor: 'var(--separator)' }}>

              {/* Avatar */}
              <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center font-semibold text-base text-white"
                style={{ background: 'var(--accent)' }}>
                {other.avatar
                  ? <img src={other.avatar} className="w-full h-full rounded-full object-cover" alt={other.username} />
                  : initials}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {other.username}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {/* Direction arrow */}
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current shrink-0" style={{ color: statusColor }}>
                    {isOutgoing
                      ? <path d="M4 4h6v2H6.83l7.58 7.59L13 15l-7.58-7.58V10H4z"/>
                      : <path d="M20 4h-6v2h3.17L9.59 13.59 11 15l7.58-7.58V10H20z"/>}
                  </svg>
                  <span className="text-xs" style={{ color: statusColor }}>{statusLabel}</span>
                  {call.type === 'video' && (
                    <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current ml-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      <path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z"/>
                    </svg>
                  )}
                  {call.status === 'answered' && call.duration > 0 && (
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>· {fmtDuration(call.duration)}</span>
                  )}
                </div>
              </div>

              {/* Time + call back buttons */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{fmtTime(call.started_at)}</span>
                <div className="flex gap-1">
                  <button onClick={() => onStartCall(other, 'audio')} title="Voice call"
                    className="p-1.5 rounded-full hover:opacity-70 transition-opacity" style={{ color: 'var(--icon)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                    </svg>
                  </button>
                  <button onClick={() => onStartCall(other, 'video')} title="Video call"
                    className="p-1.5 rounded-full hover:opacity-70 transition-opacity" style={{ color: 'var(--icon)' }}>
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                      <path d="M15 8v8H5V8h10m1-2H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4V7c0-.55-.45-1-1-1z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
