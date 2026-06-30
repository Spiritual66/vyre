import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Same-origin in production; honors VITE_API_URL for mobile/dev builds (like src/api/axios.ts).
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api';
const API = `${API_BASE}/admin`;
// Host for serving uploaded media ('' = same origin in prod).
const MEDIA_BASE = API_BASE.replace(/\/api\/?$/, '');

function adminAxios() {
  const token = localStorage.getItem('admin_token');
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string, cfg?: object) => axios.get(API + url, { headers, ...cfg }),
    post: (url: string, data?: object) => axios.post(API + url, data, { headers }),
    patch: (url: string, data?: object) => axios.patch(API + url, data, { headers }),
    delete: (url: string) => axios.delete(API + url, { headers }),
  };
}

// ── Types ──────────────────────────────────────────────────
interface Toast { id: string; message: string; type: 'success' | 'error' | 'info' }
interface Stats { totalUsers: number; totalMessages: number; totalChats: number; groupChats: number; activeToday: number; onlineNow: number; newThisWeek: number; msgsToday: number; bannedUsers: number; totalMedia: number }
interface User { id: string; username: string; email: string; avatar: string | null; last_seen: number; created_at: number; is_banned: number; is_online: number; message_count: number; chat_count: number; admin_note: string | null }
interface Message { id: string; content: string; type: string; created_at: number; sender_name: string; sender_avatar: string | null; chat_name: string; is_group: number; file_url?: string; file_name?: string }
interface Chat { id: string; name: string; is_group: number; created_at: number; member_count: number; message_count: number; created_by_name: string | null }
interface MediaItem { id: string; file_url: string; file_name: string; file_size: number | null; type: string; created_at: number; sender_name: string; chat_name: string }
interface AuditEntry { id: string; admin_email: string; action: string; target_type: string | null; target_id: string | null; target_name: string | null; details: string | null; created_at: number }
interface Settings { registrationEnabled: boolean; maintenanceMode: boolean; maxFileSizeMB: number; maxMessageLength: number; allowStickers: boolean; allowLocation: boolean; allowVoiceMessages: boolean; allowFileUploads: boolean }
interface AiConfig {
  provider: string;
  openaiKey: string | null;    hasOpenai: boolean;    openaiModel: string;    openaiDefaultModel: string;
  geminiKey: string | null;    hasGemini: boolean;    geminiModel: string;    geminiDefaultModel: string;
  groqKey: string | null;      hasGroq: boolean;      groqModel: string;      groqDefaultModel: string;
  anthropicKey: string | null; hasAnthropic: boolean; anthropicModel: string; anthropicDefaultModel: string;
  mistralKey: string | null;   hasMistral: boolean;   mistralModel: string;   mistralDefaultModel: string;
  togetherKey: string | null;  hasTogether: boolean;  togetherModel: string;  togetherDefaultModel: string;
}
interface Member { id: string; username: string; email: string; avatar: string | null; last_seen: number; is_banned: number; role: string; joined_at: number; msg_count: number }
interface ChartItem { label: string; count: number }

// ── Helpers ────────────────────────────────────────────────
function UserAvatar({ name, avatar, size = 32 }: { name: string; avatar: string | null; size?: number }) {
  const colors = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d'];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  return avatar
    ? <img src={`${MEDIA_BASE}${avatar}`} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.4, flexShrink: 0 }}>{name.charAt(0).toUpperCase()}</div>;
}

function BarChart({ data, color = '#7c3aed' }: { data: ChartItem[]; color?: string }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: '100%', background: color, borderRadius: 3, height: Math.max((d.count / max) * 70, d.count > 0 ? 4 : 1), opacity: 0.85 }} title={`${d.label}: ${d.count}`} />
          <span style={{ fontSize: 9, color: '#9ca3af', whiteSpace: 'nowrap' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, color = '#7c3aed' }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{ background: '#1e1e2e', borderRadius: 12, padding: '16px 20px', border: '1px solid #2d2d3a' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return <span style={{ background: color + '22', color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>{text}</span>;
}

function msgPreview(msg: { type: string; content?: string | null; file_name?: string | null }) {
  switch (msg.type) {
    case 'image':    return '📷 Photo';
    case 'video':    return '🎥 Video';
    case 'audio':    return '🎤 Voice';
    case 'file':     return `📎 ${msg.file_name || 'File'}`;
    case 'sticker':  return '🎭 Sticker';
    case 'location': return '📍 Location';
    case 'deleted':  return '🚫 Deleted';
    default: return msg.content || '—';
  }
}

function fmtDate(ts: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtBytes(n: number) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

function exportCSV(rows: User[]) {
  const h = ['username','email','messages','chats','joined','last_seen','banned'];
  const lines = rows.map(u => [u.username, u.email, u.message_count, u.chat_count, new Date(u.created_at).toISOString(), new Date(u.last_seen).toISOString(), u.is_banned ? 'yes' : 'no'].join(','));
  const blob = new Blob([h.join(',') + '\n' + lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'users.csv'; a.click();
}

// ── Main AdminApp ──────────────────────────────────────────
export default function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'dashboard'|'users'|'messages'|'chats'|'media'|'audit'|'settings'>('dashboard');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Date.now().toString();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const TABS = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'users',     label: '👥 Users' },
    { id: 'messages',  label: '💬 Messages' },
    { id: 'chats',     label: '🗂 Chats' },
    { id: 'media',     label: '🖼 Media' },
    { id: 'audit',     label: '📋 Audit Log' },
    { id: 'settings',  label: '⚙️ Settings' },
  ] as const;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f0f1a', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Toast layer */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.type === 'success' ? '#065f46' : t.type === 'error' ? '#7f1d1d' : '#1e3a5f', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.5)', maxWidth: 320, pointerEvents: 'auto' }}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Header — fixed, never scrolls */}
      <div style={{ background: '#13131f', borderBottom: '1px solid #2d2d3a', padding: '0 24px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#7c3aed', marginRight: 32, padding: '14px 0', whiteSpace: 'nowrap' }}>VYRE Admin</div>
        <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as typeof tab)} style={{ padding: '14px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: 'transparent', color: tab === t.id ? '#7c3aed' : '#9ca3af', borderBottom: tab === t.id ? '2px solid #7c3aed' : '2px solid transparent', whiteSpace: 'nowrap' }}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={onLogout} style={{ marginLeft: 16, padding: '8px 16px', background: '#2d1b69', border: 'none', borderRadius: 8, color: '#c4b5fd', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>Logout</button>
      </div>

      {/* Content — scrollable area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
          {tab === 'dashboard' && <DashboardTab toast={toast} />}
          {tab === 'users'     && <UsersTab     toast={toast} />}
          {tab === 'messages'  && <MessagesTab  toast={toast} />}
          {tab === 'chats'     && <ChatsTab     toast={toast} />}
          {tab === 'media'     && <MediaTab     toast={toast} />}
          {tab === 'audit'     && <AuditTab     toast={toast} />}
          {tab === 'settings'  && <SettingsTab  toast={toast} />}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────
function DashboardTab({ toast }: { toast: (m: string, t?: Toast['type']) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<{
    msgsByDay: ChartItem[];
    usersByDay: ChartItem[];
    topUsers: { id: string; username: string; avatar: string | null; msg_count: number }[];
    msgTypeDist: { type: string; count: number }[];
  } | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [bSubject, setBSubject] = useState('');
  const [bMessage, setBMessage] = useState('');

  useEffect(() => {
    const ax = adminAxios();
    ax.get('/stats').then(r => setStats(r.data)).catch(() => toast('Failed to load stats', 'error'));
    ax.get('/analytics').then(r => setAnalytics(r.data)).catch(() => {});
  }, []);

  async function sendBroadcast() {
    if (!bSubject.trim() || !bMessage.trim()) return toast('Subject and message required', 'error');
    try {
      await adminAxios().post('/broadcast', { subject: bSubject, message: bMessage });
      toast('Broadcast saved'); setBroadcastOpen(false); setBSubject(''); setBMessage('');
    } catch { toast('Failed to send broadcast', 'error'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Dashboard</h2>
        <button onClick={() => setBroadcastOpen(true)} style={{ padding: '8px 16px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>📢 Broadcast</button>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard label="Total Users"    value={stats.totalUsers}    color="#7c3aed" />
          <StatCard label="Online Now"     value={stats.onlineNow}     color="#10b981" sub="last 5 min" />
          <StatCard label="Active Today"   value={stats.activeToday}   color="#3b82f6" />
          <StatCard label="New This Week"  value={stats.newThisWeek}   color="#8b5cf6" />
          <StatCard label="Total Messages" value={stats.totalMessages} color="#f59e0b" />
          <StatCard label="Msgs Today"     value={stats.msgsToday}     color="#f97316" />
          <StatCard label="Total Chats"    value={stats.totalChats}    color="#06b6d4" />
          <StatCard label="Group Chats"    value={stats.groupChats}    color="#14b8a6" />
          <StatCard label="Banned Users"   value={stats.bannedUsers}   color="#ef4444" />
          <StatCard label="Media Files"    value={stats.totalMedia}    color="#ec4899" />
        </div>
      )}

      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: '#1e1e2e', borderRadius: 12, padding: 20, border: '1px solid #2d2d3a' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#a78bfa' }}>Messages — last 7 days</div>
            <BarChart data={analytics.msgsByDay} color="#7c3aed" />
          </div>
          <div style={{ background: '#1e1e2e', borderRadius: 12, padding: 20, border: '1px solid #2d2d3a' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#34d399' }}>New Users — last 7 days</div>
            <BarChart data={analytics.usersByDay} color="#10b981" />
          </div>
        </div>
      )}

      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: '#1e1e2e', borderRadius: 12, padding: 20, border: '1px solid #2d2d3a' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: '#fbbf24' }}>Top Senders</div>
            {analytics.topUsers.map((u, i) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ color: '#6b7280', fontSize: 12, width: 16 }}>#{i+1}</span>
                <UserAvatar name={u.username} avatar={u.avatar} size={28} />
                <span style={{ flex: 1, fontSize: 13 }}>{u.username}</span>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>{u.msg_count.toLocaleString()} msgs</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#1e1e2e', borderRadius: 12, padding: 20, border: '1px solid #2d2d3a' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: '#f472b6' }}>Message Types</div>
            {analytics.msgTypeDist.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, flex: 1, textTransform: 'capitalize' }}>{d.type}</span>
                <div style={{ width: 80, height: 8, background: '#2d2d3a', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${(d.count / (analytics.msgTypeDist[0]?.count || 1)) * 100}%`, height: '100%', background: '#7c3aed', borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, color: '#9ca3af', width: 40, textAlign: 'right' }}>{d.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {broadcastOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e1e2e', borderRadius: 16, padding: 28, width: 480, border: '1px solid #3d3d4e' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>📢 Broadcast Announcement</h3>
            <input value={bSubject} onChange={e => setBSubject(e.target.value)} placeholder="Subject" style={{ width: '100%', background: '#13131f', border: '1px solid #3d3d4e', borderRadius: 8, padding: '10px 14px', color: '#e5e7eb', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }} />
            <textarea value={bMessage} onChange={e => setBMessage(e.target.value)} placeholder="Message body…" rows={5} style={{ width: '100%', background: '#13131f', border: '1px solid #3d3d4e', borderRadius: 8, padding: '10px 14px', color: '#e5e7eb', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setBroadcastOpen(false)} style={{ padding: '8px 18px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={sendBroadcast} style={{ padding: '8px 18px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Users Tab ──────────────────────────────────────────────
function UsersTab({ toast }: { toast: (m: string, t?: Toast['type']) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<'all'|'online'|'banned'>('all');
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<'created_at'|'message_count'|'last_seen'>('created_at');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<{
    user: User;
    chats: { id: string; name: string; is_group: number; role: string; sent_in_chat: number }[];
    recentMessages: { content: string; type: string; file_name?: string; created_at: number; chat_name: string }[];
    msgTypeBreakdown: { type: string; count: number }[];
  } | null>(null);
  const [noteUserId, setNoteUserId] = useState<string | null>(null);
  const [noteEdit, setNoteEdit] = useState('');

  const load = useCallback(async () => {
    try { const r = await adminAxios().get('/users'); setUsers(r.data); } catch { toast('Failed to load users', 'error'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openDetail(id: string) {
    setDetail(id); setDetailData(null);
    try { const r = await adminAxios().get(`/users/${id}/details`); setDetailData(r.data); setNoteEdit(r.data.user.admin_note || ''); } catch { toast('Failed to load details', 'error'); }
  }

  async function toggleBan(u: User) {
    try { await adminAxios().patch(`/users/${u.id}/ban`); toast(`${u.is_banned ? 'Unbanned' : 'Banned'} ${u.username}`); load(); } catch { toast('Action failed', 'error'); }
  }

  async function deleteUser(u: User) {
    if (!confirm(`Delete ${u.username}? This cannot be undone.`)) return;
    try { await adminAxios().delete(`/users/${u.id}`); toast(`Deleted ${u.username}`); load(); if (detail === u.id) setDetail(null); } catch (e: any) { toast(e?.response?.data?.error || 'Delete failed', 'error'); }
  }

  async function saveNote() {
    if (!noteUserId) return;
    try {
      await adminAxios().patch(`/users/${noteUserId}/note`, { note: noteEdit });
      toast('Note saved'); setNoteUserId(null); load();
      if (detailData) setDetailData({ ...detailData, user: { ...detailData.user, admin_note: noteEdit } });
    } catch { toast('Failed to save note', 'error'); }
  }

  async function bulkBan(ban: boolean) {
    if (!selected.size) return;
    try { await adminAxios().post('/users/bulk-ban', { ids: [...selected], ban }); toast(`${ban ? 'Banned' : 'Unbanned'} ${selected.size} users`); setSelected(new Set()); load(); } catch { toast('Bulk action failed', 'error'); }
  }

  async function bulkDelete() {
    if (!selected.size || !confirm(`Delete ${selected.size} users? Cannot be undone.`)) return;
    try { const r = await adminAxios().post('/users/bulk-delete', { ids: [...selected] }); toast(`Deleted ${r.data.deleted} users`); setSelected(new Set()); load(); } catch { toast('Bulk delete failed', 'error'); }
  }

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll(ids: string[]) {
    if (ids.every(id => selected.has(id))) setSelected(new Set());
    else setSelected(new Set(ids));
  }

  const filtered = users
    .filter(u => filter === 'online' ? !!u.is_online : filter === 'banned' ? !!u.is_banned : true)
    .filter(u => !search || u.username.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => { const d = sortDir === 'asc' ? 1 : -1; return (a[sortCol] - b[sortCol]) * d; });

  const sortIcon = (col: typeof sortCol) => sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, flex: '0 0 auto' }}>Users</h2>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email…" style={{ flex: '1 1 200px', background: '#1e1e2e', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 14px', color: '#e5e7eb', fontSize: 13 }} />
        {(['all','online','banned'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filter === f ? '#7c3aed' : '#2d2d3a', color: filter === f ? '#fff' : '#9ca3af', textTransform: 'capitalize' }}>{f}</button>
        ))}
        <button onClick={() => exportCSV(filtered)} style={{ padding: '6px 14px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}>Export CSV</button>
      </div>

      {selected.size > 0 && (
        <div style={{ background: '#2d1b69', borderRadius: 10, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#c4b5fd', fontWeight: 600, fontSize: 13 }}>{selected.size} selected</span>
          <button onClick={() => bulkBan(true)}  style={{ padding: '5px 12px', background: '#dc2626', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }}>Ban All</button>
          <button onClick={() => bulkBan(false)} style={{ padding: '5px 12px', background: '#065f46', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }}>Unban All</button>
          <button onClick={bulkDelete}           style={{ padding: '5px 12px', background: '#7f1d1d', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 }}>Delete All</button>
          <button onClick={() => setSelected(new Set())} style={{ padding: '5px 12px', background: '#2d2d3a', border: 'none', borderRadius: 6, color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}>Clear</button>
        </div>
      )}

      <div style={{ background: '#1e1e2e', borderRadius: 12, border: '1px solid #2d2d3a', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#13131f', borderBottom: '1px solid #2d2d3a' }}>
              <th style={{ padding: '10px 14px', width: 36 }}>
                <input type="checkbox" checked={filtered.length > 0 && filtered.every(u => selected.has(u.id))} onChange={() => toggleAll(filtered.map(u => u.id))} />
              </th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>User</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleSort('message_count')}>Messages{sortIcon('message_count')}</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleSort('last_seen')}>Last Seen{sortIcon('last_seen')}</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600, cursor: 'pointer' }} onClick={() => toggleSort('created_at')}>Joined{sortIcon('created_at')}</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Status</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #2d2d3a', opacity: u.is_banned ? 0.6 : 1 }}>
                <td style={{ padding: '10px 14px' }}>
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ position: 'relative' }}>
                      <UserAvatar name={u.username} avatar={u.avatar} size={32} />
                      {!!u.is_online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#10b981', border: '2px solid #1e1e2e' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{u.username}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{u.email}</div>
                      {u.admin_note && <div style={{ fontSize: 10, color: '#f59e0b', marginTop: 2 }}>📝 {u.admin_note.slice(0,40)}{u.admin_note.length > 40 ? '…' : ''}</div>}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>{u.message_count}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>{fmtDate(u.last_seen)}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>{fmtDate(u.created_at)}</td>
                <td style={{ padding: '10px 14px' }}>
                  {u.is_banned ? <Badge text="Banned" color="#ef4444" /> : u.is_online ? <Badge text="Online" color="#10b981" /> : <Badge text="Offline" color="#6b7280" />}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openDetail(u.id)} style={{ padding: '4px 10px', background: '#2d2d3a', border: 'none', borderRadius: 6, color: '#e5e7eb', cursor: 'pointer', fontSize: 11 }}>View</button>
                    <button onClick={() => { setNoteUserId(u.id); setNoteEdit(u.admin_note || ''); }} style={{ padding: '4px 10px', background: '#1e3a5f', border: 'none', borderRadius: 6, color: '#60a5fa', cursor: 'pointer', fontSize: 11 }}>📝</button>
                    <button onClick={() => toggleBan(u)} style={{ padding: '4px 10px', background: u.is_banned ? '#065f46' : '#7f1d1d', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 11 }}>{u.is_banned ? 'Unban' : 'Ban'}</button>
                    <button onClick={() => deleteUser(u)} style={{ padding: '4px 10px', background: '#3b0764', border: 'none', borderRadius: 6, color: '#e879f9', cursor: 'pointer', fontSize: 11 }}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No users found</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>{filtered.length} of {users.length} users</div>

      {/* Admin note modal */}
      {noteUserId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e1e2e', borderRadius: 16, padding: 24, width: 400, border: '1px solid #3d3d4e' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Admin Note</h3>
            <textarea value={noteEdit} onChange={e => setNoteEdit(e.target.value)} rows={4} placeholder="Internal note about this user…" style={{ width: '100%', background: '#13131f', border: '1px solid #3d3d4e', borderRadius: 8, padding: '10px', color: '#e5e7eb', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
              <button onClick={() => setNoteUserId(null)} style={{ padding: '7px 16px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
              <button onClick={saveNote} style={{ padding: '7px 16px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* User detail drawer */}
      {detail && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: '#1a1a2e', borderLeft: '1px solid #2d2d3a', zIndex: 200, overflowY: 'auto', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)' }}>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button onClick={() => { setDetail(null); setDetailData(null); }} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>User Details</h3>
            {!detailData ? (
              <div style={{ color: '#6b7280', textAlign: 'center', paddingTop: 40 }}>Loading…</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                  <UserAvatar name={detailData.user.username} avatar={detailData.user.avatar} size={52} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{detailData.user.username}</div>
                    <div style={{ color: '#9ca3af', fontSize: 13 }}>{detailData.user.email}</div>
                    <div style={{ marginTop: 4 }}>{detailData.user.is_banned ? <Badge text="Banned" color="#ef4444" /> : <Badge text="Active" color="#10b981" />}</div>
                  </div>
                </div>
                {detailData.user.admin_note && (
                  <div style={{ background: '#2d1b04', border: '1px solid #78350f', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#fcd34d' }}>
                    📝 {detailData.user.admin_note}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                  {detailData.msgTypeBreakdown.map(b => (
                    <div key={b.type} style={{ background: '#13131f', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{b.count}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'capitalize' }}>{b.type}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#a78bfa' }}>Active in Chats</div>
                {detailData.chats.map(c => (
                  <div key={c.id} style={{ background: '#13131f', borderRadius: 8, padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span>{c.is_group ? '👥' : '💬'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13 }}>{c.name || 'Direct'}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{c.sent_in_chat} messages · {c.role}</div>
                    </div>
                  </div>
                ))}
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, marginTop: 16, color: '#a78bfa' }}>Recent Messages</div>
                {detailData.recentMessages.map((m, i) => (
                  <div key={i} style={{ background: '#13131f', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msgPreview(m)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{m.chat_name} · {fmtDate(m.created_at)}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Messages Tab ───────────────────────────────────────────
function MessagesTab({ toast }: { toast: (m: string, t?: Toast['type']) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const LIMIT = 50;

  const load = useCallback(async (off = 0) => {
    try {
      const params: Record<string, string | number> = { limit: LIMIT, offset: off };
      if (filterType) params.type = filterType;
      if (dateFrom) params.from = new Date(dateFrom).getTime();
      if (dateTo)   params.to   = new Date(dateTo).getTime() + 86399999;
      const r = await adminAxios().get('/messages', { params });
      setMessages(r.data.messages); setTotal(r.data.total); setOffset(off);
    } catch { toast('Failed to load messages', 'error'); }
  }, [filterType, dateFrom, dateTo]);

  useEffect(() => { load(0); }, [load]);

  async function deleteMsg(id: string) {
    try { await adminAxios().delete(`/messages/${id}`); toast('Message deleted'); load(offset); } catch { toast('Delete failed', 'error'); }
  }

  const filtered = search ? messages.filter(m => (m.content || '').toLowerCase().includes(search.toLowerCase()) || m.sender_name.toLowerCase().includes(search.toLowerCase())) : messages;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, flex: '0 0 auto' }}>Messages</h2>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter content or sender…" style={{ flex: '1 1 160px', background: '#1e1e2e', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 14px', color: '#e5e7eb', fontSize: 13 }} />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ background: '#1e1e2e', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb', fontSize: 13 }}>
          <option value="">All types</option>
          {['text','image','video','audio','file','sticker','location'].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ background: '#1e1e2e', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb', fontSize: 13 }} />
        <span style={{ color: '#6b7280', fontSize: 13 }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ background: '#1e1e2e', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb', fontSize: 13 }} />
        <button onClick={() => load(0)} style={{ padding: '8px 16px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Apply</button>
      </div>

      <div style={{ background: '#1e1e2e', borderRadius: 12, border: '1px solid #2d2d3a', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#13131f', borderBottom: '1px solid #2d2d3a' }}>
              {['Sender','Content','Type','Chat','Date',''].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #2d2d3a' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UserAvatar name={m.sender_name} avatar={m.sender_avatar} size={26} />
                    <span style={{ fontSize: 13 }}>{m.sender_name}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 14px', maxWidth: 260 }}>
                  <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{msgPreview(m)}</div>
                </td>
                <td style={{ padding: '10px 14px' }}><Badge text={m.type} color="#7c3aed" /></td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#9ca3af' }}>{m.is_group ? '👥 ' : '💬 '}{m.chat_name}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(m.created_at)}</td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => deleteMsg(m.id)} style={{ padding: '4px 10px', background: '#7f1d1d', border: 'none', borderRadius: 6, color: '#fca5a5', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No messages found</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
        <button disabled={offset === 0} onClick={() => load(Math.max(0, offset - LIMIT))} style={{ padding: '6px 14px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: offset === 0 ? '#4b5563' : '#e5e7eb', cursor: offset === 0 ? 'default' : 'pointer', fontSize: 12 }}>← Prev</button>
        <button disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)} style={{ padding: '6px 14px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: offset + LIMIT >= total ? '#4b5563' : '#e5e7eb', cursor: offset + LIMIT >= total ? 'default' : 'pointer', fontSize: 12 }}>Next →</button>
      </div>
    </div>
  );
}

// ── Chats Tab ──────────────────────────────────────────────
function ChatsTab({ toast }: { toast: (m: string, t?: Toast['type']) => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [search, setSearch] = useState('');
  const [membersChat, setMembersChat] = useState<Chat | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [msgsChat, setMsgsChat] = useState<Chat | null>(null);
  const [chatMsgs, setChatMsgs] = useState<{ id: string; content: string; type: string; file_name?: string; created_at: number; sender_name: string; sender_avatar: string | null }[]>([]);
  const [chatMsgsTotal, setChatMsgsTotal] = useState(0);
  const [chatMsgsOffset, setChatMsgsOffset] = useState(0);

  const load = useCallback(async () => {
    try { const r = await adminAxios().get('/chats'); setChats(r.data); } catch { toast('Failed to load chats', 'error'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openMembers(c: Chat) {
    setMembersChat(c);
    try { const r = await adminAxios().get(`/chats/${c.id}/members`); setMembers(r.data); } catch { toast('Failed to load members', 'error'); }
  }

  async function openMessages(c: Chat, off = 0) {
    setMsgsChat(c); setChatMsgsOffset(off);
    try { const r = await adminAxios().get(`/chats/${c.id}/messages`, { params: { limit: 50, offset: off } }); setChatMsgs(r.data.messages); setChatMsgsTotal(r.data.total); } catch { toast('Failed to load messages', 'error'); }
  }

  async function deleteChat(c: Chat) {
    if (!confirm(`Delete "${c.name || 'this chat'}"? All messages will be lost.`)) return;
    try { await adminAxios().delete(`/chats/${c.id}`); toast('Chat deleted'); load(); } catch (e: any) { toast(e?.response?.data?.error || 'Delete failed', 'error'); }
  }

  const filtered = chats.filter(c => !search || (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.created_by_name || '').toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Chats</h2>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chats…" style={{ flex: 1, background: '#1e1e2e', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 14px', color: '#e5e7eb', fontSize: 13 }} />
      </div>

      <div style={{ background: '#1e1e2e', borderRadius: 12, border: '1px solid #2d2d3a', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#13131f', borderBottom: '1px solid #2d2d3a' }}>
              {['Name','Type','Members','Messages','Created By','Date','Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #2d2d3a' }}>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{c.name || <span style={{ color: '#6b7280', fontWeight: 400 }}>Direct</span>}</td>
                <td style={{ padding: '10px 14px' }}><Badge text={c.is_group ? 'Group' : 'DM'} color={c.is_group ? '#7c3aed' : '#2563eb'} /></td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>{c.member_count}</td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>{c.message_count}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#9ca3af' }}>{c.created_by_name || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280' }}>{fmtDate(c.created_at)}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openMessages(c, 0)} style={{ padding: '4px 10px', background: '#1e3a5f', border: 'none', borderRadius: 6, color: '#60a5fa', cursor: 'pointer', fontSize: 11 }}>Messages</button>
                    <button onClick={() => openMembers(c)}     style={{ padding: '4px 10px', background: '#2d2d3a', border: 'none', borderRadius: 6, color: '#e5e7eb', cursor: 'pointer', fontSize: 11 }}>Members</button>
                    <button onClick={() => deleteChat(c)}       style={{ padding: '4px 10px', background: '#7f1d1d', border: 'none', borderRadius: 6, color: '#fca5a5', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No chats found</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Members modal */}
      {membersChat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e1e2e', borderRadius: 16, padding: 24, width: 520, maxHeight: '80vh', overflow: 'auto', border: '1px solid #3d3d4e' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, flex: 1 }}>Members — {membersChat.name || 'Direct'}</h3>
              <button onClick={() => setMembersChat(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {members.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #2d2d3a' }}>
                <UserAvatar name={m.username} avatar={m.avatar} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{m.username}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{m.role} · {m.msg_count} msgs · joined {fmtDate(m.joined_at)}</div>
                </div>
                {!!m.is_banned && <Badge text="Banned" color="#ef4444" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat messages modal */}
      {msgsChat && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#1e1e2e', borderRadius: 16, padding: 24, width: 620, maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: '1px solid #3d3d4e' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15, flex: 1 }}>Messages — {msgsChat.name || 'Direct'}</h3>
              <span style={{ fontSize: 12, color: '#6b7280', marginRight: 16 }}>{chatMsgsTotal} total</span>
              <button onClick={() => setMsgsChat(null)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {chatMsgs.map(m => (
                <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid #2d2d3a', display: 'flex', gap: 10 }}>
                  <UserAvatar name={m.sender_name} avatar={m.sender_avatar} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{m.sender_name}</span>
                      <span style={{ fontSize: 11, color: '#6b7280' }}>{fmtDate(m.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#d1d5db', marginTop: 2 }}>{msgPreview(m)}</div>
                  </div>
                </div>
              ))}
              {chatMsgs.length === 0 && <div style={{ textAlign: 'center', color: '#6b7280', padding: 32 }}>No messages</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'center', alignItems: 'center' }}>
              <button disabled={chatMsgsOffset === 0} onClick={() => openMessages(msgsChat, Math.max(0, chatMsgsOffset - 50))} style={{ padding: '6px 14px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: chatMsgsOffset === 0 ? '#4b5563' : '#e5e7eb', cursor: chatMsgsOffset === 0 ? 'default' : 'pointer', fontSize: 12 }}>← Prev</button>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{chatMsgsOffset + 1}–{Math.min(chatMsgsOffset + 50, chatMsgsTotal)}</span>
              <button disabled={chatMsgsOffset + 50 >= chatMsgsTotal} onClick={() => openMessages(msgsChat, chatMsgsOffset + 50)} style={{ padding: '6px 14px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: chatMsgsOffset + 50 >= chatMsgsTotal ? '#4b5563' : '#e5e7eb', cursor: chatMsgsOffset + 50 >= chatMsgsTotal ? 'default' : 'pointer', fontSize: 12 }}>Next →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Media Tab ──────────────────────────────────────────────
function MediaTab({ toast }: { toast: (m: string, t?: Toast['type']) => void }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [filter, setFilter] = useState<'all'|'image'|'video'|'audio'|'file'>('all');

  useEffect(() => {
    adminAxios().get('/media').then(r => setMedia(r.data)).catch(() => toast('Failed to load media', 'error'));
  }, []);

  const filtered = filter === 'all' ? media : media.filter(m => m.type === filter);

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Media</h2>
        {(['all','image','video','audio','file'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: filter === f ? '#7c3aed' : '#2d2d3a', color: filter === f ? '#fff' : '#9ca3af', textTransform: 'capitalize' }}>{f}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{filtered.length} files</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {filtered.map(m => (
          <div key={m.id} style={{ background: '#1e1e2e', borderRadius: 10, overflow: 'hidden', border: '1px solid #2d2d3a' }}>
            {m.type === 'image' ? (
              <a href={`${MEDIA_BASE}${m.file_url}`} target="_blank" rel="noreferrer">
                <img src={`${MEDIA_BASE}${m.file_url}`} alt={m.file_name} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
              </a>
            ) : (
              <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, background: '#13131f' }}>
                {m.type === 'video' ? '🎥' : m.type === 'audio' ? '🎤' : '📎'}
              </div>
            )}
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.file_name || 'file'}</div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{m.sender_name}</div>
              {m.file_size && <div style={{ fontSize: 10, color: '#6b7280' }}>{fmtBytes(m.file_size)}</div>}
              <div style={{ fontSize: 10, color: '#4b5563' }}>{fmtDate(m.created_at)}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#6b7280', padding: 48 }}>No media found</div>}
      </div>
    </div>
  );
}

// ── Audit Log Tab ──────────────────────────────────────────
function AuditTab({ toast }: { toast: (m: string, t?: Toast['type']) => void }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 100;

  const load = useCallback(async (off = 0) => {
    try { const r = await adminAxios().get('/audit-log', { params: { limit: LIMIT, offset: off } }); setLogs(r.data.logs); setTotal(r.data.total); setOffset(off); } catch { toast('Failed to load audit log', 'error'); }
  }, []);

  useEffect(() => { load(0); }, [load]);

  function actionColor(action: string) {
    if (action.includes('DELETE')) return '#ef4444';
    if (action.includes('BAN'))    return '#f97316';
    if (action.includes('UNBAN'))  return '#10b981';
    if (action.includes('EDIT'))   return '#3b82f6';
    return '#7c3aed';
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Audit Log</h2>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{total} entries</span>
      </div>

      <div style={{ background: '#1e1e2e', borderRadius: 12, border: '1px solid #2d2d3a', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#13131f', borderBottom: '1px solid #2d2d3a' }}>
              {['Time','Admin','Action','Target','Details'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid #2d2d3a' }}>
                <td style={{ padding: '10px 14px', fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(l.created_at)}</td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>{l.admin_email}</td>
                <td style={{ padding: '10px 14px' }}><Badge text={l.action} color={actionColor(l.action)} /></td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#9ca3af' }}>
                  {l.target_type && <span style={{ fontSize: 10, color: '#6b7280', marginRight: 4 }}>[{l.target_type}]</span>}
                  {l.target_name || l.target_id || '—'}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{l.details || '—'}</div>
                </td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No audit entries yet — admin actions will appear here</td></tr>}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
        <button disabled={offset === 0} onClick={() => load(Math.max(0, offset - LIMIT))} style={{ padding: '6px 14px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: offset === 0 ? '#4b5563' : '#e5e7eb', cursor: offset === 0 ? 'default' : 'pointer', fontSize: 12 }}>← Prev</button>
        <button disabled={offset + LIMIT >= total} onClick={() => load(offset + LIMIT)} style={{ padding: '6px 14px', background: '#2d2d3a', border: 'none', borderRadius: 8, color: offset + LIMIT >= total ? '#4b5563' : '#e5e7eb', cursor: offset + LIMIT >= total ? 'default' : 'pointer', fontSize: 12 }}>Next →</button>
      </div>
    </div>
  );
}

// ── Settings Tab ───────────────────────────────────────────
function SettingsTab({ toast }: { toast: (m: string, t?: Toast['type']) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [systemInfo, setSystemInfo] = useState<{ dbSizeBytes: number; uploadCount: number; uploadSizeBytes: number; uptime: number; nodeVersion: string; platform: string; memRss: number; memHeap: number } | null>(null);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiEdit, setAiEdit] = useState({
    provider: 'auto',
    openaiKey: '', geminiKey: '', groqKey: '', anthropicKey: '', mistralKey: '', togetherKey: '',
    openaiModel: '', geminiModel: '', groqModel: '', anthropicModel: '', mistralModel: '', togetherModel: '',
  });
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; provider?: string; model?: string; response?: string; error?: string } | null>(null);
  const [aiTesting, setAiTesting] = useState<string | null>(null);
  const [aiSaving, setAiSaving] = useState(false);

  useEffect(() => {
    adminAxios().get('/settings').then(r => setSettings(r.data)).catch(() => toast('Failed to load settings', 'error'));
    adminAxios().get('/system').then(r => setSystemInfo(r.data)).catch(() => {});
    adminAxios().get('/ai-config').then(r => {
      setAiConfig(r.data);
      setAiEdit(e => ({ ...e, provider: r.data.provider || 'auto' }));
    }).catch(() => {});
  }, []);

  async function setSetting(key: string, value: boolean | number) {
    try { const r = await adminAxios().patch('/settings', { key, value }); setSettings(r.data.settings); toast('Setting updated'); } catch { toast('Failed to update', 'error'); }
  }

  async function cleanupOldMessages() {
    if (!confirm(`Mark messages older than ${cleanupDays} days as deleted?`)) return;
    try { const r = await adminAxios().delete(`/cleanup/old-messages?days=${cleanupDays}`); toast(`Cleaned up ${r.data.deleted} messages`); } catch { toast('Cleanup failed', 'error'); }
  }

  async function saveAiConfig() {
    setAiSaving(true);
    try {
      const payload: Record<string, string | null> = { provider: aiEdit.provider };
      if (aiEdit.openaiKey)    payload.openaiKey    = aiEdit.openaiKey;
      if (aiEdit.geminiKey)    payload.geminiKey    = aiEdit.geminiKey;
      if (aiEdit.groqKey)      payload.groqKey      = aiEdit.groqKey;
      if (aiEdit.anthropicKey) payload.anthropicKey = aiEdit.anthropicKey;
      if (aiEdit.mistralKey)   payload.mistralKey   = aiEdit.mistralKey;
      if (aiEdit.togetherKey)  payload.togetherKey  = aiEdit.togetherKey;
      if (aiEdit.openaiModel)    payload.openaiModel    = aiEdit.openaiModel;
      if (aiEdit.geminiModel)    payload.geminiModel    = aiEdit.geminiModel;
      if (aiEdit.groqModel)      payload.groqModel      = aiEdit.groqModel;
      if (aiEdit.anthropicModel) payload.anthropicModel = aiEdit.anthropicModel;
      if (aiEdit.mistralModel)   payload.mistralModel   = aiEdit.mistralModel;
      if (aiEdit.togetherModel)  payload.togetherModel  = aiEdit.togetherModel;

      await adminAxios().patch('/ai-config', payload);

      // Reload config to reflect saved state
      try {
        const r = await adminAxios().get('/ai-config');
        setAiConfig(r.data);
      } catch {}

      setAiEdit(e => ({ ...e, openaiKey: '', geminiKey: '', groqKey: '', anthropicKey: '', mistralKey: '', togetherKey: '' }));
      toast('AI config saved ✓');
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.message || 'Unknown error';
      if (status === 401) toast('Session expired — please log out and back in', 'error');
      else if (status === 404) toast('Server not updated — restart the server and try again', 'error');
      else if (!err?.response) toast(`Cannot reach server — is it running? (${msg})`, 'error');
      else toast(`Save failed (${status}): ${msg}`, 'error');
    }
    setAiSaving(false);
  }

  async function testAi(provider?: string) {
    setAiTesting(provider || 'auto');
    setAiTestResult(null);
    try {
      const r = await adminAxios().post('/ai-config/test', provider ? { provider } : {});
      setAiTestResult(r.data);
      toast(r.data.ok ? `✓ ${r.data.provider} responded: "${r.data.response}"` : `✗ ${r.data.error}`, r.data.ok ? 'success' : 'error');
    } catch (e: any) {
      setAiTestResult({ ok: false, error: e?.response?.data?.error || 'Request failed' });
    }
    setAiTesting(null);
  }

  if (!settings) return <div style={{ color: '#6b7280', padding: 32 }}>Loading…</div>;

  const toggles: { key: keyof Settings; label: string; desc: string; danger?: boolean }[] = [
    { key: 'registrationEnabled',  label: 'Registration Open',   desc: 'Allow new users to sign up' },
    { key: 'maintenanceMode',      label: 'Maintenance Mode',    desc: 'Block all non-admin access', danger: true },
    { key: 'allowFileUploads',     label: 'File Uploads',        desc: 'Allow users to send files' },
    { key: 'allowVoiceMessages',   label: 'Voice Messages',      desc: 'Allow voice recording' },
    { key: 'allowStickers',        label: 'Stickers',            desc: 'Allow sticker messages' },
    { key: 'allowLocation',        label: 'Location Sharing',    desc: 'Allow location messages' },
  ];

  return (
    <div>
      <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700 }}>Settings</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: '#1e1e2e', borderRadius: 12, padding: 20, border: '1px solid #2d2d3a' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#a78bfa' }}>Feature Controls</div>
          {toggles.map(t => (
            <div key={t.key} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #2d2d3a' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.danger ? '#ef4444' : '#e5e7eb' }}>{t.label}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{t.desc}</div>
              </div>
              <button onClick={() => setSetting(t.key, !settings[t.key])} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: settings[t.key] ? (t.danger ? '#ef4444' : '#7c3aed') : '#374151', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: settings[t.key] ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
              </button>
            </div>
          ))}
        </div>

        <div>
          <div style={{ background: '#1e1e2e', borderRadius: 12, padding: 20, border: '1px solid #2d2d3a', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#a78bfa' }}>Limits</div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Max file size (MB)</label>
              <input type="number" defaultValue={settings.maxFileSizeMB} min={1} max={100} style={{ width: '100%', background: '#13131f', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                onBlur={e => setSetting('maxFileSizeMB', parseInt(e.target.value) || 10)} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Max message length (chars)</label>
              <input type="number" defaultValue={settings.maxMessageLength} min={100} max={10000} style={{ width: '100%', background: '#13131f', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb', fontSize: 14, boxSizing: 'border-box' }}
                onBlur={e => setSetting('maxMessageLength', parseInt(e.target.value) || 4096)} />
            </div>
          </div>

          <div style={{ background: '#1a0a0a', borderRadius: 12, padding: 20, border: '1px solid #7f1d1d' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#ef4444' }}>⚠️ Danger Zone</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>Delete messages older than:</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="number" value={cleanupDays} min={1} onChange={e => setCleanupDays(parseInt(e.target.value) || 30)} style={{ width: 80, background: '#13131f', border: '1px solid #7f1d1d', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb', fontSize: 14 }} />
              <span style={{ color: '#6b7280', fontSize: 13 }}>days</span>
              <button onClick={cleanupOldMessages} style={{ padding: '8px 16px', background: '#7f1d1d', border: 'none', borderRadius: 8, color: '#fca5a5', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Run Cleanup</button>
            </div>
          </div>
        </div>
      </div>

      {systemInfo && (
        <div style={{ background: '#1e1e2e', borderRadius: 12, padding: 20, border: '1px solid #2d2d3a', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#a78bfa' }}>System Info</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            <StatCard label="DB Size"      value={fmtBytes(systemInfo.dbSizeBytes)}  color="#06b6d4" />
            <StatCard label="Upload Files" value={systemInfo.uploadCount}            color="#8b5cf6" sub={fmtBytes(systemInfo.uploadSizeBytes)} />
            <StatCard label="Uptime"       value={`${Math.floor(systemInfo.uptime / 3600)}h ${Math.floor((systemInfo.uptime % 3600) / 60)}m`} color="#10b981" />
            <StatCard label="Node.js"      value={systemInfo.nodeVersion}            color="#f59e0b" />
            <StatCard label="Memory RSS"   value={fmtBytes(systemInfo.memRss)}       color="#ec4899" />
            <StatCard label="Heap Used"    value={fmtBytes(systemInfo.memHeap)}      color="#f97316" />
          </div>
        </div>
      )}

      {/* ── AI Writing Tools Config ───────────────────────────── */}
      <div style={{ background: '#1e1e2e', borderRadius: 12, padding: 20, border: '1px solid #2d2d3a' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: '#a78bfa' }}>🤖 AI Writing Tools — Multi-Provider</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>Configure any combination of AI providers. Keys stored here override environment variables. Add 3 actions: translate, summarize, emojify now available.</div>

        {/* Provider status row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {([
            { id: 'openai',    label: 'OpenAI',    has: aiConfig?.hasOpenai,    color: '#10a37f', hint: 'platform.openai.com' },
            { id: 'gemini',    label: 'Gemini',    has: aiConfig?.hasGemini,    color: '#4285f4', hint: 'aistudio.google.com (free)' },
            { id: 'groq',      label: 'Groq',      has: aiConfig?.hasGroq,      color: '#f7931e', hint: 'console.groq.com (free, fastest)' },
            { id: 'anthropic', label: 'Anthropic', has: aiConfig?.hasAnthropic, color: '#cc785c', hint: 'console.anthropic.com' },
            { id: 'mistral',   label: 'Mistral',   has: aiConfig?.hasMistral,   color: '#ff7000', hint: 'console.mistral.ai' },
            { id: 'together',  label: 'Together',  has: aiConfig?.hasTogether,  color: '#8b5cf6', hint: 'api.together.xyz' },
          ] as const).map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#13131f', borderRadius: 8, padding: '6px 12px', border: `1px solid ${p.has ? p.color + '55' : '#3d3d4e'}`, minWidth: 0 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.has ? p.color : '#4b5563', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: p.has ? '#e5e7eb' : '#6b7280' }}>{p.label}</span>
              {p.has && aiConfig?.provider === p.id && <span style={{ fontSize: 10, color: p.color }}>▶ active</span>}
              {p.has && (
                <button onClick={() => testAi(p.id)} disabled={aiTesting === p.id} style={{ padding: '1px 6px', background: '#2d2d3a', border: 'none', borderRadius: 4, color: '#a78bfa', cursor: 'pointer', fontSize: 10, fontWeight: 600 }}>
                  {aiTesting === p.id ? '…' : 'Test'}
                </button>
              )}
            </div>
          ))}
        </div>

        {aiTestResult && (
          <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: aiTestResult.ok ? '#052e16' : '#300', border: `1px solid ${aiTestResult.ok ? '#166534' : '#7f1d1d'}`, fontSize: 13, color: aiTestResult.ok ? '#4ade80' : '#fca5a5' }}>
            {aiTestResult.ok
              ? `✓ ${aiTestResult.provider} (${aiTestResult.model}) OK — "${aiTestResult.response}"`
              : `✗ ${aiTestResult.error}`}
          </div>
        )}

        {/* Active provider + model selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>Active Provider</label>
            <select value={aiEdit.provider} onChange={e => setAiEdit(v => ({ ...v, provider: e.target.value }))}
              style={{ width: '100%', background: '#13131f', border: '1px solid #3d3d4e', borderRadius: 8, padding: '8px 12px', color: '#e5e7eb', fontSize: 14 }}>
              <option value="auto">Auto (OpenAI → Gemini → Groq → Anthropic → Mistral → Together)</option>
              <option value="openai">OpenAI (GPT)</option>
              <option value="gemini">Gemini (Google)</option>
              <option value="groq">Groq (Llama — fastest free)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="mistral">Mistral AI</option>
              <option value="together">Together AI (Llama)</option>
            </select>
          </div>
          <div />
        </div>

        {/* Per-provider key + model inputs — 2-column grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {([
            { id: 'openai',    label: 'OpenAI',    color: '#10a37f', keyField: 'openaiKey',    modelField: 'openaiModel',    hasKey: aiConfig?.hasOpenai,    maskedKey: aiConfig?.openaiKey,    defaultModel: aiConfig?.openaiDefaultModel,    placeholder: 'sk-…',                hint: 'platform.openai.com → API keys',
              models: ['gpt-4o-mini','gpt-4o','gpt-4-turbo','gpt-3.5-turbo'] },
            { id: 'gemini',    label: 'Gemini',    color: '#4285f4', keyField: 'geminiKey',    modelField: 'geminiModel',    hasKey: aiConfig?.hasGemini,    maskedKey: aiConfig?.geminiKey,    defaultModel: aiConfig?.geminiDefaultModel,    placeholder: 'AIza…',               hint: 'aistudio.google.com/apikey — free',
              models: ['gemini-1.5-flash','gemini-1.5-pro','gemini-2.0-flash-exp'] },
            { id: 'groq',      label: 'Groq',      color: '#f7931e', keyField: 'groqKey',      modelField: 'groqModel',      hasKey: aiConfig?.hasGroq,      maskedKey: aiConfig?.groqKey,      defaultModel: aiConfig?.groqDefaultModel,      placeholder: 'gsk_…',               hint: 'console.groq.com — free & fastest',
              models: ['llama-3.1-8b-instant','llama-3.3-70b-versatile','llama-3.1-70b-versatile','gemma2-9b-it','mixtral-8x7b-32768'] },
            { id: 'anthropic', label: 'Anthropic', color: '#cc785c', keyField: 'anthropicKey', modelField: 'anthropicModel', hasKey: aiConfig?.hasAnthropic, maskedKey: aiConfig?.anthropicKey, defaultModel: aiConfig?.anthropicDefaultModel, placeholder: 'sk-ant-…',            hint: 'console.anthropic.com',
              models: ['claude-haiku-4-5-20251001','claude-sonnet-4-6','claude-opus-4-8'] },
            { id: 'mistral',   label: 'Mistral',   color: '#ff7000', keyField: 'mistralKey',   modelField: 'mistralModel',   hasKey: aiConfig?.hasMistral,   maskedKey: aiConfig?.mistralKey,   defaultModel: aiConfig?.mistralDefaultModel,   placeholder: 'mist_…',              hint: 'console.mistral.ai',
              models: ['mistral-small-latest','mistral-medium-latest','mistral-large-latest','open-mistral-nemo'] },
            { id: 'together',  label: 'Together',  color: '#8b5cf6', keyField: 'togetherKey',  modelField: 'togetherModel',  hasKey: aiConfig?.hasTogether,  maskedKey: aiConfig?.togetherKey,  defaultModel: aiConfig?.togetherDefaultModel,  placeholder: 'together-…',           hint: 'api.together.xyz — many open models',
              models: ['meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo','meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo','mistralai/Mixtral-8x7B-Instruct-v0.1'] },
          ] as const).map(p => (
            <div key={p.id} style={{ background: '#13131f', borderRadius: 10, padding: 14, border: `1px solid ${p.hasKey ? p.color + '40' : '#2d2d3a'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.hasKey ? p.color : '#4b5563' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: p.hasKey ? '#e5e7eb' : '#9ca3af' }}>{p.label}</span>
                {p.hasKey && <span style={{ fontSize: 10, color: '#6b7280' }}>{p.maskedKey}</span>}
                {p.hasKey && (
                  <button onClick={() => testAi(p.id)} disabled={aiTesting === p.id}
                    style={{ marginLeft: 'auto', padding: '2px 8px', background: '#2d2d3a', border: 'none', borderRadius: 4, color: '#a78bfa', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    {aiTesting === p.id ? '…' : 'Test'}
                  </button>
                )}
              </div>
              <input type="password" placeholder={p.hasKey ? 'New key (blank = keep)' : p.placeholder}
                value={(aiEdit as any)[p.keyField]} onChange={e => setAiEdit(v => ({ ...v, [p.keyField]: e.target.value }))}
                style={{ width: '100%', background: '#0f0f1a', border: '1px solid #3d3d4e', borderRadius: 6, padding: '6px 10px', color: '#e5e7eb', fontSize: 13, boxSizing: 'border-box', marginBottom: 8 }} />
              <select value={(aiEdit as any)[p.modelField] || (p.hasKey ? (aiConfig as any)?.[p.modelField] : '') || ''}
                onChange={e => setAiEdit(v => ({ ...v, [p.modelField]: e.target.value }))}
                style={{ width: '100%', background: '#0f0f1a', border: '1px solid #3d3d4e', borderRadius: 6, padding: '6px 10px', color: '#e5e7eb', fontSize: 12 }}>
                <option value="">Default: {p.defaultModel}</option>
                {p.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 6 }}>{p.hint}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={saveAiConfig} disabled={aiSaving} style={{ padding: '10px 20px', background: '#7c3aed', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: aiSaving ? 0.6 : 1 }}>
            {aiSaving ? 'Saving…' : 'Save AI Config'}
          </button>
          <button onClick={() => testAi()} disabled={!!aiTesting} style={{ padding: '10px 20px', background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 8, color: '#60a5fa', cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: aiTesting ? 0.6 : 1 }}>
            {aiTesting ? 'Testing…' : 'Test Active Provider'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>11 writing actions available: proofread · rewrite · friendly · professional · concise · longer · list · improve · translate · summarize · emojify</span>
        </div>
      </div>
    </div>
  );
}
