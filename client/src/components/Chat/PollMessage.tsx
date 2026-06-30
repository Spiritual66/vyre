import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useSocket } from '../../contexts/SocketContext';

interface PollData { question: string; options: string[]; }
interface State { counts: number[]; total: number; myVote: number | null; }

export default function PollMessage({ messageId, content }: { messageId: string; content: string }) {
  const { socket } = useSocket();
  let poll: PollData;
  try { poll = JSON.parse(content); } catch { poll = { question: '', options: [] }; }
  if (!Array.isArray(poll.options)) poll.options = [];

  const [state, setState] = useState<State>({ counts: poll.options.map(() => 0), total: 0, myVote: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/messages/${messageId}/poll`).then(({ data }) => setState(data)).catch(() => {});
  }, [messageId]);

  // Live results: other people's votes
  useEffect(() => {
    if (!socket) return;
    const onUpdate = (d: { messageId: string; counts: number[]; total: number }) => {
      if (d.messageId === messageId) setState(s => ({ ...s, counts: d.counts, total: d.total }));
    };
    socket.on('poll:updated', onUpdate);
    return () => { socket.off('poll:updated', onUpdate); };
  }, [socket, messageId]);

  const vote = async (i: number) => {
    if (busy) return;
    setBusy(true);
    try { const { data } = await api.post(`/messages/${messageId}/vote`, { option: i }); setState(data); }
    catch { /* ignore */ }
    finally { setBusy(false); }
  };

  const total = state.total || 0;
  return (
    <div className="min-w-[220px] max-w-[300px]">
      <p className="text-sm font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
        <span>📊</span>{poll.question}
      </p>
      <div className="space-y-1.5">
        {poll.options.map((opt, i) => {
          const c = state.counts[i] || 0;
          const pct = total ? Math.round((c / total) * 100) : 0;
          const mine = state.myVote === i;
          return (
            <button key={i} type="button" onClick={() => vote(i)} disabled={busy}
              className="relative w-full text-left rounded-lg overflow-hidden border px-2.5 py-1.5 transition-colors"
              style={{ borderColor: mine ? 'var(--accent)' : 'var(--separator)' }}>
              <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: mine ? 'rgba(0,168,132,0.25)' : 'var(--hover)', transition: 'width .3s ease' }} />
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>{mine ? '✓ ' : ''}{opt}</span>
                <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>{pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
        {total} vote{total !== 1 ? 's' : ''} · tap to {state.myVote !== null ? 'change' : 'vote'}
      </p>
    </div>
  );
}
