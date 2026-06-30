import { useEffect, useState } from 'react';
import api from '../../api/axios';

interface Scheduled { id: string; content: string | null; type: string; send_at: number; }

const fmt = (ts: number) => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const inputStyle = { color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--separator)' } as const;

export default function ScheduleModal({ chatId, text, onClose, onScheduled }: {
  chatId: string; text: string; onClose: () => void; onScheduled: () => void;
}) {
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 3600000)));
  const [pending, setPending] = useState<Scheduled[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get(`/messages/scheduled?chatId=${chatId}`).then(({ data }) => setPending(data)).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [chatId]);

  const presets: { label: string; at: () => Date }[] = [
    { label: 'In 1 hour', at: () => new Date(Date.now() + 3600000) },
    { label: 'In 3 hours', at: () => new Date(Date.now() + 3 * 3600000) },
    { label: 'Tonight 8 PM', at: () => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); return d; } },
    { label: 'Tomorrow 9 AM', at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
  ];

  const schedule = async () => {
    setErr('');
    if (!text.trim()) { setErr('Type a message in the box first, then schedule it.'); return; }
    const ts = new Date(when).getTime();
    if (!Number.isFinite(ts) || ts < Date.now() + 30000) { setErr('Pick a time at least a minute from now.'); return; }
    setBusy(true);
    try { await api.post('/messages/schedule', { chatId, content: text.trim(), type: 'text', sendAt: ts }); onScheduled(); load(); }
    catch (e: any) { setErr(e?.response?.data?.error || 'Could not schedule'); }
    finally { setBusy(false); }
  };
  const cancel = async (id: string) => { await api.delete(`/messages/scheduled/${id}`).catch(() => {}); load(); };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5 mx-4" style={{ background: 'var(--panel)' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Schedule message</h3>
        {text.trim()
          ? <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>“{text.trim()}”</p>
          : <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>Type a message in the box first to schedule it.</p>}

        <div className="flex flex-wrap gap-1.5 mb-3">
          {presets.map(p => (
            <button key={p.label} type="button" onClick={() => setWhen(toLocalInput(p.at()))}
              className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--separator)', color: 'var(--text-secondary)' }}>{p.label}</button>
          ))}
        </div>
        <input type="datetime-local" value={when} min={toLocalInput(new Date())} onChange={e => setWhen(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm mb-2 outline-none border" style={inputStyle} />
        {err && <p className="text-xs mb-2" style={{ color: '#ef4444' }}>{err}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg" style={{ color: 'var(--text-secondary)' }}>Close</button>
          <button type="button" onClick={schedule} disabled={busy || !text.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-wa-green text-white font-medium disabled:opacity-50">Schedule</button>
        </div>

        {pending.length > 0 && (
          <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--separator)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Scheduled ({pending.length})</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {pending.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate" style={{ color: 'var(--text-primary)' }}>{s.type === 'text' ? s.content : '📎 Attachment'}</p>
                    <p style={{ color: 'var(--text-tertiary)' }}>🕒 {fmt(s.send_at)}</p>
                  </div>
                  <button type="button" onClick={() => cancel(s.id)} className="shrink-0 px-2 py-1 rounded" style={{ color: '#ef4444' }}>Cancel</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
