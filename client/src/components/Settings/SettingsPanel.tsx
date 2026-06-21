import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../common/Avatar';
import api from '../../api/axios';

interface Props {
  onClose: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

interface PrivacySettings {
  last_seen: 'everyone' | 'nobody';
  profile_photo: 'everyone' | 'nobody';
  about_visibility: 'everyone' | 'nobody';
  groups_visibility: 'everyone' | 'nobody';
  status_visibility: 'everyone' | 'nobody';
  read_receipts: boolean;
  disappearing_messages: number;
}

type Section = 'account' | 'privacy' | 'chats' | 'appearance' | 'notifications' | 'storage' | 'help';

const SECTIONS: { id: Section; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: 'account', label: 'Account', desc: 'Security, email, delete account',
    icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>,
  },
  {
    id: 'privacy', label: 'Privacy', desc: 'Who can see your info, block contacts',
    icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>,
  },
  {
    id: 'chats', label: 'Chats', desc: 'Wallpaper, history, input preferences',
    icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>,
  },
  {
    id: 'appearance', label: 'Appearance', desc: 'Theme, colors, font size, wallpaper',
    icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>,
  },
  {
    id: 'notifications', label: 'Notifications', desc: 'Message, group & call tones, quiet hours',
    icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>,
  },
  {
    id: 'storage', label: 'Storage and data', desc: 'Network usage, auto-download, export',
    icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>,
  },
  {
    id: 'help', label: 'Help', desc: 'FAQ, keyboard shortcuts, about',
    icon: <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>,
  },
];

function SectionHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-4 px-4 py-4 border-b sticky top-0 z-10"
      style={{ borderColor: 'var(--separator)', background: 'var(--header)' }}>
      <button onClick={onBack} style={{ color: 'var(--icon)' }}>
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>{title}</h3>
    </div>
  );
}

function SettingRow({ label, value, onClick, danger, badge }: { label: string; value?: string; onClick?: () => void; danger?: boolean; badge?: string }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:opacity-80 transition-opacity">
      <span className={`text-sm ${danger ? 'text-red-500' : ''}`} style={danger ? {} : { color: 'var(--text-primary)' }}>{label}</span>
      <div className="flex items-center gap-2">
        {badge && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent)', color: 'white' }}>{badge}</span>}
        {value && <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{value}</span>}
        {onClick && <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>}
      </div>
    </button>
  );
}

function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <div className="flex-1 pr-4">
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {desc && <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>}
      </div>
      <button onClick={() => onChange(!on)}
        className="w-11 h-6 rounded-full relative transition-colors shrink-0"
        style={{ background: on ? 'var(--accent)' : 'var(--separator)' }}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function RadioGroup({ options, value, onChange, label }: { options: {value: string; label: string}[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="px-5 py-3">
      <p className="text-xs font-medium mb-2" style={{ color: 'var(--icon)' }}>{label}</p>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)}
          className="w-full flex items-center gap-3 py-2.5 text-sm text-left hover:opacity-80 transition-opacity"
          style={{ color: 'var(--text-primary)' }}>
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${value === opt.value ? 'border-[var(--accent)]' : ''}`}
            style={value !== opt.value ? { borderColor: 'var(--separator)' } : {}}>
            {value === opt.value && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}
          </div>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SectionDivider({ label }: { label?: string }) {
  return (
    <div className="px-5 pt-5 pb-1">
      {label && <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>{label}</p>}
      {!label && <div className="h-px" style={{ background: 'var(--separator)' }} />}
    </div>
  );
}

// ─── Two-factor authentication (TOTP) ─────────────────────────────────────────
function TwoFactorSection({ onBack }: { onBack: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/users/me/2fa').then(({ data }) => setEnabled(!!data.enabled)).catch(() => setEnabled(false));
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setErr(''); setMsg(''); setBusy(true);
    try { await fn(); } catch (e: any) { setErr(e.response?.data?.error || 'Something went wrong'); }
    finally { setBusy(false); }
  };
  const startSetup = () => run(async () => {
    const { data } = await api.post('/users/me/2fa/setup');
    setSetup({ qr: data.qr, secret: data.secret });
  });
  const enable = () => run(async () => {
    await api.post('/users/me/2fa/enable', { code });
    setEnabled(true); setSetup(null); setCode(''); setMsg('Two-factor authentication is now ON.');
  });
  const disable = () => run(async () => {
    await api.post('/users/me/2fa/disable', { password: pw });
    setEnabled(false); setPw(''); setMsg('Two-factor authentication turned off.');
  });

  return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Two-step verification" onBack={onBack} />
      <div className="p-5 space-y-4">
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,168,132,0.1)' }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8" style={{ fill: 'var(--accent)' }}><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          </div>
          <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
            Require a one-time code from an authenticator app (Google Authenticator, Authy, 1Password…) each time you log in.
          </p>
        </div>

        {msg && <div className="rounded-lg px-4 py-2.5 text-sm text-green-500" style={{ background: 'rgba(34,197,94,0.08)' }}>{msg}</div>}
        {err && <div className="rounded-lg px-4 py-2.5 text-sm text-red-500" style={{ background: 'rgba(239,68,68,0.08)' }}>{err}</div>}

        {enabled === null && <p className="text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>Loading…</p>}

        {enabled === false && !setup && (
          <button onClick={startSetup} disabled={busy}
            className="w-full bg-wa-green hover:bg-wa-green-dark text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-60">
            {busy ? 'Please wait…' : 'Set up two-factor authentication'}
          </button>
        )}

        {enabled === false && setup && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>1. Scan this QR code with your authenticator app:</p>
            <img src={setup.qr} alt="2FA QR code" className="w-44 h-44 mx-auto rounded-lg bg-white p-2" />
            <p className="text-xs text-center break-all" style={{ color: 'var(--text-tertiary)' }}>
              Or enter this key manually:<br /><span className="font-mono">{setup.secret}</span>
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>2. Enter the 6-digit code it shows:</p>
            <input inputMode="numeric" maxLength={6} placeholder="123456" value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-lg px-4 py-3 text-center text-lg tracking-[0.4em] outline-none border"
              style={{ color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--separator)' }} />
            <button onClick={enable} disabled={busy || code.length !== 6}
              className="w-full bg-wa-green hover:bg-wa-green-dark text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-60">
              {busy ? 'Verifying…' : 'Verify & enable'}
            </button>
          </div>
        )}

        {enabled === true && (
          <div className="space-y-3">
            <div className="rounded-lg px-4 py-3 text-sm flex items-center gap-2" style={{ background: 'var(--hover)', color: 'var(--text-primary)' }}>
              <span className="text-green-500">●</span> Two-factor authentication is enabled.
            </div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Enter your password to turn it off</label>
            <input type="password" value={pw} placeholder="Your password"
              onChange={e => setPw(e.target.value)}
              className="w-full rounded-lg px-4 py-3 text-sm outline-none border"
              style={{ color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--separator)' }} />
            <button onClick={disable} disabled={busy || !pw}
              className="w-full text-red-500 font-medium py-3 rounded-lg border transition-colors disabled:opacity-60"
              style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
              {busy ? 'Please wait…' : 'Turn off two-factor authentication'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section: Account ─────────────────────────────────────────────────────────
function AccountSection({ onBack }: { onBack: () => void }) {
  const { user, updateUser, logout } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [about, setAbout] = useState(user?.about || '');
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingAbout, setEditingAbout] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [deletePw, setDeletePw] = useState('');
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [emailPw, setEmailPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pwStrength = (pw: string) => {
    if (!pw) return 0;
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };
  const strength = pwStrength(newPw);
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e'][strength];

  const saveUsername = async () => {
    if (!username.trim()) return;
    try {
      const { data } = await api.put('/users/me', { username: username.trim() });
      updateUser(data); setEditingUsername(false);
    } catch (e: any) { alert(e.response?.data?.error || 'Failed'); }
  };

  const saveAbout = async () => {
    try {
      const { data } = await api.put('/users/me', { about });
      updateUser(data); setEditingAbout(false);
    } catch {}
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('avatar', file);
    try {
      const { data } = await api.post('/users/me/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      updateUser({ avatar: data.avatar });
    } catch {} finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleChangePassword = async () => {
    setPwError(''); setPwSuccess('');
    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return; }
    if (newPw.length < 6) { setPwError('Min 6 characters'); return; }
    setSaving(true);
    try {
      await api.put('/users/me/password', { currentPassword: currentPw, newPassword: newPw });
      setPwSuccess('Password changed successfully!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setPwSuccess(''); setShowPassword(false); }, 2000);
    } catch (e: any) { setPwError(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleChangeEmail = async () => {
    setEmailError(''); setEmailSuccess('');
    if (!newEmail.includes('@')) { setEmailError('Enter a valid email'); return; }
    setSaving(true);
    try {
      const { data } = await api.put('/users/me', { email: newEmail });
      updateUser(data);
      setEmailSuccess('Email updated!');
      setTimeout(() => { setEmailSuccess(''); setShowEmail(false); }, 2000);
    } catch (e: any) { setEmailError(e.response?.data?.error || 'Failed to update email'); }
    finally { setSaving(false); }
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    try {
      await api.delete('/users/me', { data: { password: deletePw } });
      logout();
    } catch (e: any) { setDeleteError(e.response?.data?.error || 'Failed'); }
  };

  if (show2FA) return <TwoFactorSection onBack={() => setShow2FA(false)} />;

  if (showPassword) return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Change password" onBack={() => setShowPassword(false)} />
      <div className="p-5 space-y-4">
        {[{ label: 'Current password', val: currentPw, set: setCurrentPw }, { label: 'New password', val: newPw, set: setNewPw }, { label: 'Confirm new password', val: confirmPw, set: setConfirmPw }].map(({ label, val, set }) => (
          <div key={label}>
            <label className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{label}</label>
            <input type="password" value={val} onChange={e => set(e.target.value)}
              className="w-full border-b py-2 text-sm outline-none bg-transparent mt-1"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
          </div>
        ))}
        {newPw && (
          <div className="space-y-1">
            <div className="flex gap-1">
              {[1,2,3,4].map(i => (
                <div key={i} className="h-1 flex-1 rounded-full transition-all" style={{ background: i <= strength ? strengthColor : 'var(--separator)' }} />
              ))}
            </div>
            {strengthLabel && <p className="text-xs" style={{ color: strengthColor }}>{strengthLabel} password</p>}
          </div>
        )}
        {pwError && <p className="text-sm text-red-500">{pwError}</p>}
        {pwSuccess && <p className="text-sm" style={{ color: 'var(--accent)' }}>{pwSuccess}</p>}
        <button onClick={handleChangePassword} disabled={saving || !currentPw || !newPw || !confirmPw}
          className="w-full py-3 rounded-xl text-white font-medium disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {saving ? 'Changing...' : 'Change password'}
        </button>
      </div>
    </div>
  );

  if (showEmail) return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Update email" onBack={() => setShowEmail(false)} />
      <div className="p-5 space-y-4">
        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--accent)' }}>New email address</label>
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            className="w-full border-b py-2 text-sm outline-none bg-transparent mt-1"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
        </div>
        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Current password (for verification)</label>
          <input type="password" value={emailPw} onChange={e => setEmailPw(e.target.value)} placeholder="Enter password"
            className="w-full border-b py-2 text-sm outline-none bg-transparent mt-1"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
        </div>
        {emailError && <p className="text-sm text-red-500">{emailError}</p>}
        {emailSuccess && <p className="text-sm" style={{ color: 'var(--accent)' }}>{emailSuccess}</p>}
        <button onClick={handleChangeEmail} disabled={saving || !newEmail}
          className="w-full py-3 rounded-xl text-white font-medium disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {saving ? 'Updating...' : 'Update email'}
        </button>
      </div>
    </div>
  );

  if (showDelete) return (
    <div className="flex flex-col h-full">
      <SectionHeader title="Delete account" onBack={() => setShowDelete(false)} />
      <div className="p-5 space-y-4">
        <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
          <p className="font-semibold mb-1">Warning: this action is irreversible</p>
          <p>Your account, messages, media, and all data will be permanently deleted.</p>
        </div>
        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Confirm with your password</label>
          <input type="password" value={deletePw} onChange={e => setDeletePw(e.target.value)} placeholder="Enter your password"
            className="w-full border-b py-2 text-sm outline-none focus:border-red-500 bg-transparent mt-1"
            style={{ color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
        </div>
        {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}
        <button onClick={handleDeleteAccount} disabled={!deletePw}
          className="w-full py-3 rounded-xl text-white font-medium bg-red-500 hover:bg-red-600 disabled:opacity-50">
          Delete my account permanently
        </button>
      </div>
    </div>
  );

  const memberSince = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '—';

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SectionHeader title="Account" onBack={onBack} />
      <div className="flex flex-col items-center py-6 gap-2">
        <div className="relative">
          <Avatar src={user?.avatar} name={user?.username} size={80} />
          <button onClick={() => fileRef.current?.click()}
            className="absolute bottom-0 right-0 w-7 h-7 text-white rounded-full flex items-center justify-center shadow-md" style={{ background: 'var(--accent)' }}>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          </button>
          <input ref={fileRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Tap to change photo</p>
      </div>

      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--separator)' }}>
        <p className="text-xs font-medium mb-1" style={{ color: 'var(--accent)' }}>Your name</p>
        {editingUsername ? (
          <div className="flex items-center gap-2">
            <input value={username} onChange={e => setUsername(e.target.value)} autoFocus maxLength={30}
              className="flex-1 border-b py-1 text-sm outline-none bg-transparent"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--separator)' }}
              onKeyDown={e => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') setEditingUsername(false); }} />
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{username.length}/30</span>
            <button onClick={saveUsername} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Save</button>
            <button onClick={() => setEditingUsername(false)} className="text-sm" style={{ color: 'var(--text-tertiary)' }}>✕</button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{user?.username}</p>
            <button onClick={() => setEditingUsername(true)} style={{ color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--separator)' }}>
        <p className="text-xs font-medium mb-1" style={{ color: 'var(--accent)' }}>About</p>
        {editingAbout ? (
          <div className="flex items-start gap-2">
            <textarea value={about} onChange={e => setAbout(e.target.value)} rows={2} autoFocus maxLength={139}
              className="flex-1 border-b py-1 text-sm outline-none bg-transparent resize-none"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
            <div className="flex flex-col gap-1">
              <button onClick={saveAbout} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Save</button>
              <button onClick={() => setEditingAbout(false)} className="text-sm" style={{ color: 'var(--text-tertiary)' }}>✕</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{user?.about || '—'}</p>
            <button onClick={() => setEditingAbout(true)} style={{ color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--separator)' }}>
        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Email</p>
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{user?.email}</p>
      </div>

      <div className="px-5 py-2 border-b" style={{ borderColor: 'var(--separator)' }}>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Member since {memberSince}</p>
      </div>

      <SectionDivider label="Security" />
      <SettingRow label="Change password" onClick={() => setShowPassword(true)} />
      <SettingRow label="Update email" onClick={() => setShowEmail(true)} />
      <SettingRow label="Two-step verification" onClick={() => setShow2FA(true)} badge="Soon" />
      <SectionDivider />
      <SettingRow label="Delete my account" onClick={() => setShowDelete(true)} danger />
    </div>
  );
}

// ─── Section: Privacy ─────────────────────────────────────────────────────────
function PrivacySection({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<PrivacySettings>({
    last_seen: 'everyone', profile_photo: 'everyone', about_visibility: 'everyone',
    groups_visibility: 'everyone', status_visibility: 'everyone',
    read_receipts: true, disappearing_messages: 0,
  });
  const [blockedUsers, setBlockedUsers] = useState<{ id: string; username: string; avatar: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/users/me/settings'), api.get('/users/blocked')])
      .then(([sRes, bRes]) => {
        const s = sRes.data;
        setSettings({
          last_seen: s.last_seen || 'everyone',
          profile_photo: s.profile_photo || 'everyone',
          about_visibility: s.about_visibility || 'everyone',
          groups_visibility: s.groups_visibility || 'everyone',
          status_visibility: s.status_visibility || 'everyone',
          read_receipts: !!s.read_receipts,
          disappearing_messages: s.disappearing_messages || 0,
        });
        setBlockedUsers(bRes.data);
      }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const update = async (patch: Partial<PrivacySettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await api.put('/users/me/settings', {
      last_seen: next.last_seen, profile_photo: next.profile_photo,
      about_visibility: next.about_visibility, read_receipts: next.read_receipts,
      groups_visibility: next.groups_visibility, status_visibility: next.status_visibility,
      disappearing_messages: next.disappearing_messages,
    });
  };

  const handleUnblock = async (userId: string) => {
    await api.delete(`/users/block/${userId}`);
    setBlockedUsers(prev => prev.filter(u => u.id !== userId));
  };

  const visOpts = [{ value: 'everyone', label: 'Everyone' }, { value: 'nobody', label: 'Nobody' }];
  const disappearOpts = [
    { value: 0, label: 'Off' }, { value: 86400, label: '24 hours' },
    { value: 604800, label: '7 days' }, { value: 7776000, label: '90 days' },
  ];

  if (loading) return <div className="flex-1 flex items-center justify-center"><svg className="animate-spin w-6 h-6" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg></div>;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SectionHeader title="Privacy" onBack={onBack} />
      <SectionDivider label="Who can see my personal info" />
      <RadioGroup label="Last seen & online" options={visOpts} value={settings.last_seen} onChange={v => update({ last_seen: v as any })} />
      <div className="h-px mx-5" style={{ background: 'var(--separator)' }} />
      <RadioGroup label="Profile photo" options={visOpts} value={settings.profile_photo} onChange={v => update({ profile_photo: v as any })} />
      <div className="h-px mx-5" style={{ background: 'var(--separator)' }} />
      <RadioGroup label="About" options={visOpts} value={settings.about_visibility} onChange={v => update({ about_visibility: v as any })} />
      <div className="h-px mx-5" style={{ background: 'var(--separator)' }} />
      <RadioGroup label="Status" options={visOpts} value={settings.status_visibility} onChange={v => update({ status_visibility: v as any })} />

      <SectionDivider label="Groups" />
      <RadioGroup label="Who can add me to groups" options={visOpts} value={settings.groups_visibility} onChange={v => update({ groups_visibility: v as any })} />

      <SectionDivider label="Messages" />
      <Toggle on={settings.read_receipts} onChange={v => update({ read_receipts: v })}
        label="Read receipts" desc="If turned off, you won't send or receive read receipts" />

      <SectionDivider label="Disappearing messages" />
      <div className="px-5 py-3">
        <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Set a default timer for new chats</p>
        <div className="grid grid-cols-2 gap-2">
          {disappearOpts.map(opt => (
            <button key={opt.value} onClick={() => update({ disappearing_messages: opt.value })}
              className="py-2 px-3 rounded-lg text-sm font-medium border transition-all"
              style={{
                background: settings.disappearing_messages === opt.value ? 'var(--accent)' : 'var(--hover)',
                color: settings.disappearing_messages === opt.value ? 'white' : 'var(--text-primary)',
                borderColor: settings.disappearing_messages === opt.value ? 'var(--accent)' : 'var(--separator)',
              }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <SectionDivider label="Blocked contacts" />
      {blockedUsers.length === 0 ? (
        <p className="px-5 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>No blocked contacts</p>
      ) : (
        blockedUsers.map(u => (
          <div key={u.id} className="flex items-center gap-3 px-5 py-2.5">
            <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm text-white shrink-0"
              style={{ background: 'var(--accent)' }}>
              {u.username[0].toUpperCase()}
            </div>
            <span className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{u.username}</span>
            <button onClick={() => handleUnblock(u.id)} className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Unblock</button>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Section: Chats ─────────────────────────────────────────────────────────────
function ChatsSection({ onBack }: { onBack: () => void }) {
  const [enterToSend, setEnterToSend] = useState(() => localStorage.getItem('enterToSend') !== 'false');
  const [spellCheck, setSpellCheck] = useState(() => localStorage.getItem('spellCheck') !== 'false');
  const [showTyping, setShowTyping] = useState(() => localStorage.getItem('showTyping') !== 'false');
  const [mediaAutoDownload, setMediaAutoDownload] = useState(() => localStorage.getItem('mediaAutoDownload') !== 'false');
  const [mediaDownloadRoaming, setMediaDownloadRoaming] = useState(() => localStorage.getItem('mediaDownloadRoaming') === 'true');
  const [archiving, setArchiving] = useState(false);
  const [archiveDone, setArchiveDone] = useState(false);

  const set = (key: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val); localStorage.setItem(key, String(val));
  };

  const archiveAll = async () => {
    setArchiving(true);
    try {
      const { data: chats } = await api.get('/chats');
      const active = chats.filter((c: any) => !c.is_archived);
      await Promise.all(active.map((c: any) => api.put(`/chats/${c.id}/settings`, { is_archived: true })));
      setArchiveDone(true);
      setTimeout(() => setArchiveDone(false), 3000);
    } catch {} finally { setArchiving(false); }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SectionHeader title="Chats" onBack={onBack} />
      <SectionDivider label="Input & Display" />
      <Toggle on={enterToSend} onChange={v => set('enterToSend', v, setEnterToSend)}
        label="Enter to send" desc="Press Enter to send, Shift+Enter for new line" />
      <Toggle on={spellCheck} onChange={v => set('spellCheck', v, setSpellCheck)}
        label="Spell check" desc="Enable spell checking in message input" />
      <Toggle on={showTyping} onChange={v => set('showTyping', v, setShowTyping)}
        label="Typing indicators" desc="Show when others are typing" />

      <SectionDivider label="Media auto-download" />
      <Toggle on={mediaAutoDownload} onChange={v => set('mediaAutoDownload', v, setMediaAutoDownload)}
        label="Auto-download on Wi-Fi" desc="Automatically download photos and videos" />
      <Toggle on={mediaDownloadRoaming} onChange={v => set('mediaDownloadRoaming', v, setMediaDownloadRoaming)}
        label="Auto-download when roaming" desc="May incur mobile data charges" />

      <SectionDivider label="Chat management" />
      <button onClick={archiveAll} disabled={archiving}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:opacity-80 transition-opacity disabled:opacity-50">
        <div>
          <p className="text-sm text-left" style={{ color: 'var(--text-primary)' }}>
            {archiveDone ? '✓ All chats archived' : 'Archive all chats'}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Move all active chats to archive</p>
        </div>
        {archiving && <svg className="animate-spin w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
      </button>

      <button onClick={() => {
        if (confirm('Clear all cached data? This will not delete your messages.')) {
          ['enterToSend','spellCheck','showTyping','mediaAutoDownload','mediaDownloadRoaming'].forEach(k => localStorage.removeItem(k));
          window.location.reload();
        }
      }} className="w-full flex items-center justify-between px-5 py-3.5 hover:opacity-80">
        <div>
          <p className="text-sm text-left" style={{ color: 'var(--text-primary)' }}>Clear app cache</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Resets preferences to defaults</p>
        </div>
      </button>
    </div>
  );
}

// ─── Section: Appearance ────────────────────────────────────────────────────────
const ACCENT_PRESETS = [
  { name: 'Green',   accent: '#00a884', dark: '#008069', light: '#25d366' },
  { name: 'Blue',    accent: '#2196F3', dark: '#1565C0', light: '#64B5F6' },
  { name: 'Violet',  accent: '#7C3AED', dark: '#5B21B6', light: '#A78BFA' },
  { name: 'Rose',    accent: '#E91E63', dark: '#C2185B', light: '#F48FB1' },
  { name: 'Amber',   accent: '#F59E0B', dark: '#D97706', light: '#FCD34D' },
  { name: 'Teal',    accent: '#14B8A6', dark: '#0F766E', light: '#5EEAD4' },
  { name: 'Red',     accent: '#EF4444', dark: '#DC2626', light: '#FCA5A5' },
  { name: 'Slate',   accent: '#64748B', dark: '#475569', light: '#94A3B8' },
];

const TEXT_COLOR_PRESETS = [
  { label: 'Default',    value: '',        display: null },
  { label: 'White',      value: '#ffffff',  display: '#ffffff' },
  { label: 'Off-white',  value: '#e5e5e5',  display: '#e5e5e5' },
  { label: 'Light grey', value: '#b0b0b0',  display: '#b0b0b0' },
  { label: 'Dark',       value: '#111111',  display: '#111111' },
  { label: 'Green',      value: '#25d366',  display: '#25d366' },
  { label: 'Cyan',       value: '#00bcd4',  display: '#00bcd4' },
  { label: 'Yellow',     value: '#ffd600',  display: '#ffd600' },
  { label: 'Orange',     value: '#ff9800',  display: '#ff9800' },
  { label: 'Pink',       value: '#e91e63',  display: '#e91e63' },
];

const WALLPAPER_COLORS = [
  '#075e54','#128c7e','#25d366','#34b7f1','#8e44ad','#9b59b6',
  '#2c3e50','#1a237e','#e74c3c','#c0392b','#f39c12','#e67e22',
];
const WALLPAPER_GRADIENTS = [
  'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
  'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)',
  'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)',
  'linear-gradient(135deg,#43e97b 0%,#38f9d7 100%)',
  'linear-gradient(135deg,#fa709a 0%,#fee140 100%)',
  'linear-gradient(135deg,#30cfd0 0%,#330867 100%)',
];

function AppearanceSection({ onBack, darkMode, onToggleDark }: { onBack: () => void; darkMode: boolean; onToggleDark: () => void }) {
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('fontSize') || '14'));
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => (localStorage.getItem('themeMode') as any) || 'system');
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem('accentColor') || '#00a884');
  const [textColor, setTextColor] = useState(() => localStorage.getItem('textColor') || '');
  const [customTextColor, setCustomTextColor] = useState(() => localStorage.getItem('textColor') || '#ffffff');
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('compactMode') === 'true');
  const [wallpaperType, setWallpaperType] = useState(() => localStorage.getItem('chatWallpaperType') || 'none');
  const [wallpaperValue, setWallpaperValue] = useState(() => localStorage.getItem('chatWallpaper') || '');
  const [uploading, setUploading] = useState(false);
  const wallpaperFileRef = useRef<HTMLInputElement>(null);

  const applyFontSize = (size: number) => {
    setFontSize(size);
    localStorage.setItem('fontSize', String(size));
    document.documentElement.style.fontSize = `${size}px`;
  };

  const applyTheme = (t: 'light' | 'dark' | 'system') => {
    setTheme(t); localStorage.setItem('themeMode', t);
    if (t === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (systemDark !== darkMode) onToggleDark();
    } else if ((t === 'dark') !== darkMode) onToggleDark();
  };

  const applyAccent = (accent: string, dark: string, light: string) => {
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-dark', dark);
    document.documentElement.style.setProperty('--accent-light', light);
    localStorage.setItem('accentColor', accent);
    localStorage.setItem('accentColorDark', dark);
    localStorage.setItem('accentColorLight', light);
    setAccentColor(accent);
  };

  const applyTextColor = (color: string) => {
    setTextColor(color);
    if (color) {
      document.documentElement.style.setProperty('--text-primary', color);
      localStorage.setItem('textColor', color);
      setCustomTextColor(color);
    } else {
      document.documentElement.style.removeProperty('--text-primary');
      localStorage.removeItem('textColor');
    }
  };

  const applyCompact = (on: boolean) => {
    setCompactMode(on);
    localStorage.setItem('compactMode', String(on));
    document.documentElement.style.setProperty('--msg-spacing', on ? '2px' : '4px');
    document.documentElement.style.setProperty('--msg-padding', on ? '4px 8px' : '8px 12px');
  };

  const applyWallpaper = (value: string, type: 'color' | 'gradient' | 'image') => {
    document.documentElement.style.removeProperty('--chat-bg-override');
    document.documentElement.style.removeProperty('--chat-pattern-override');
    document.documentElement.style.removeProperty('--chat-bg-image');
    if (type === 'image') document.documentElement.style.setProperty('--chat-bg-image', `url("${value}")`);
    else if (type === 'gradient') document.documentElement.style.setProperty('--chat-bg-image', value);
    else {
      document.documentElement.style.setProperty('--chat-bg-override', value);
      document.documentElement.style.setProperty('--chat-pattern-override', 'none');
    }
    localStorage.setItem('chatWallpaper', value); localStorage.setItem('chatWallpaperType', type);
    setWallpaperValue(value); setWallpaperType(type);
  };

  const removeWallpaper = () => {
    document.documentElement.style.removeProperty('--chat-bg-override');
    document.documentElement.style.removeProperty('--chat-pattern-override');
    document.documentElement.style.removeProperty('--chat-bg-image');
    localStorage.removeItem('chatWallpaper'); localStorage.removeItem('chatWallpaperType');
    setWallpaperValue(''); setWallpaperType('none');
  };

  const handleWallpaperPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (wallpaperFileRef.current) wallpaperFileRef.current.value = '';
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/messages/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      applyWallpaper(data.url, 'image');
    } catch { alert('Failed to upload'); } finally { setUploading(false); }
  };

  const preview = wallpaperValue ? (
    wallpaperType === 'image' ? { backgroundImage: `url("${wallpaperValue}")`, backgroundSize: 'cover', backgroundPosition: 'center' } :
    wallpaperType === 'gradient' ? { backgroundImage: wallpaperValue } :
    { backgroundColor: wallpaperValue }
  ) : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SectionHeader title="Appearance" onBack={onBack} />

      <SectionDivider label="Theme" />
      <RadioGroup label="Color scheme"
        options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System default' }]}
        value={theme} onChange={v => applyTheme(v as any)} />

      <SectionDivider label="App color" />
      <div className="px-5 py-3 space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {ACCENT_PRESETS.map(preset => {
            const active = accentColor === preset.accent;
            return (
              <button key={preset.name} onClick={() => applyAccent(preset.accent, preset.dark, preset.light)}
                className="flex flex-col items-center gap-1.5">
                <div className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-110"
                  style={{ background: preset.accent, boxShadow: active ? `0 0 0 3px var(--panel), 0 0 0 5px ${preset.accent}` : 'none', transform: active ? 'scale(1.1)' : 'scale(1)' }}>
                  {active && <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                </div>
                <span className="text-[10px]" style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)' }}>{preset.name}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 pt-1 border-t" style={{ borderColor: 'var(--separator)' }}>
          <label className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>Custom</label>
          <input type="color" value={accentColor} onChange={e => applyAccent(e.target.value, e.target.value, e.target.value)}
            className="w-8 h-8 rounded-full cursor-pointer border-0 p-0 overflow-hidden" style={{ background: 'none' }} />
          <span className="text-xs font-mono w-16 text-right" style={{ color: 'var(--text-tertiary)' }}>{accentColor}</span>
        </div>
      </div>

      <SectionDivider label="Font size" />
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>A</span>
          <input type="range" min={12} max={20} value={fontSize} onChange={e => applyFontSize(+e.target.value)}
            className="flex-1 mx-4 accent-[var(--accent)]" />
          <span className="text-xl font-semibold" style={{ color: 'var(--text-secondary)' }}>A</span>
        </div>
        <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
          {fontSize === 12 ? 'Small' : fontSize <= 14 ? 'Medium' : fontSize <= 17 ? 'Large' : 'Extra large'} ({fontSize}px)
        </p>
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'var(--hover)' }}>
          <p className="text-sm" style={{ fontSize, color: 'var(--text-primary)' }}>Preview: This is how your messages will look.</p>
        </div>
      </div>

      <SectionDivider label="Text color" />
      <div className="px-5 py-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {TEXT_COLOR_PRESETS.map(preset => {
            const active = textColor === preset.value;
            return (
              <button key={preset.value || 'default'} onClick={() => applyTextColor(preset.value)} title={preset.label}
                className="flex flex-col items-center gap-1 group">
                <div className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110 flex items-center justify-center"
                  style={{ background: preset.display || 'var(--hover)', borderColor: active ? 'var(--accent)' : 'var(--separator)', boxShadow: active ? '0 0 0 2px var(--accent)' : 'none' }}>
                  {!preset.display && <svg viewBox="0 0 24 24" className="w-4 h-4" style={{ color: 'var(--icon)' }} fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>}
                </div>
                <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{preset.label}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Custom</label>
          <input type="color" value={customTextColor}
            onChange={e => { setCustomTextColor(e.target.value); applyTextColor(e.target.value); }}
            className="w-8 h-8 rounded-full cursor-pointer border-0 p-0 overflow-hidden" style={{ background: 'none' }} />
          <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{textColor || 'default'}</span>
        </div>
        <div className="p-3 rounded-lg" style={{ background: 'var(--hover)' }}>
          <p className="text-sm" style={{ color: textColor || 'var(--text-primary)' }}>Preview: This is how your text will look.</p>
        </div>
      </div>

      <SectionDivider label="Layout" />
      <Toggle on={compactMode} onChange={applyCompact}
        label="Compact mode" desc="Reduce spacing between messages for a denser view" />

      <SectionDivider label="Chat wallpaper" />
      {preview && (
        <div className="px-5 pb-3">
          <div className="relative h-24 rounded-xl overflow-hidden border" style={{ ...preview, borderColor: 'var(--separator)' }}>
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.15)' }}>
              <span className="text-white text-xs font-medium">Current wallpaper</span>
            </div>
          </div>
          <button onClick={removeWallpaper} className="mt-2 text-xs text-red-500 font-medium flex items-center gap-1 hover:opacity-80">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            Remove wallpaper
          </button>
        </div>
      )}
      <div className="px-5 pb-3">
        <input ref={wallpaperFileRef} type="file" className="hidden" accept="image/*" onChange={handleWallpaperPhoto} />
        <button onClick={() => wallpaperFileRef.current?.click()} disabled={uploading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--separator)', color: 'var(--text-primary)', background: 'var(--hover)' }}>
          {uploading ? <><svg className="animate-spin w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Uploading…</> :
          <><svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Choose photo from gallery</>}
        </button>
      </div>
      <div className="px-5 pb-1">
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--icon)' }}>Colors</p>
        <div className="grid grid-cols-6 gap-2">
          {WALLPAPER_COLORS.map(color => {
            const active = wallpaperType === 'color' && wallpaperValue === color;
            return (
              <button key={color} onClick={() => applyWallpaper(color, 'color')}
                className="aspect-square rounded-lg transition-all hover:scale-110"
                style={{ background: color, border: active ? '3px solid var(--text-primary)' : '2px solid transparent', outline: active ? '1px solid var(--panel)' : 'none', outlineOffset: -4 }} />
            );
          })}
        </div>
      </div>
      <div className="px-5 py-3">
        <p className="text-xs font-medium mb-2" style={{ color: 'var(--icon)' }}>Gradients</p>
        <div className="grid grid-cols-3 gap-2">
          {WALLPAPER_GRADIENTS.map(grad => {
            const active = wallpaperType === 'gradient' && wallpaperValue === grad;
            return (
              <button key={grad} onClick={() => applyWallpaper(grad, 'gradient')}
                className="h-14 rounded-lg transition-all hover:scale-105"
                style={{ backgroundImage: grad, border: active ? '3px solid var(--text-primary)' : '2px solid transparent', outline: active ? '1px solid var(--panel)' : 'none', outlineOffset: -4 }} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Section: Notifications ──────────────────────────────────────────────────────
function NotificationsSection({ onBack }: { onBack: () => void }) {
  const [msgNotif, setMsgNotif] = useState(() => localStorage.getItem('notif_messages') !== 'false');
  const [msgSound, setMsgSound] = useState(() => localStorage.getItem('notif_sound') !== 'false');
  const [msgPreview, setMsgPreview] = useState(() => localStorage.getItem('notif_preview') !== 'false');
  const [groupNotif, setGroupNotif] = useState(() => localStorage.getItem('notif_groups') !== 'false');
  const [reactionNotif, setReactionNotif] = useState(() => localStorage.getItem('notif_reactions') !== 'false');
  const [callRing, setCallRing] = useState(() => localStorage.getItem('notif_calls') !== 'false');
  const [quietHours, setQuietHours] = useState(() => localStorage.getItem('notif_quiet') === 'true');
  const [quietFrom, setQuietFrom] = useState(() => localStorage.getItem('notif_quiet_from') || '22:00');
  const [quietTo, setQuietTo] = useState(() => localStorage.getItem('notif_quiet_to') || '08:00');
  const [permission, setPermission] = useState<string>(() => typeof window !== 'undefined' ? (Notification?.permission || 'default') : 'default');
  const [playingPreview, setPlayingPreview] = useState(false);

  const save = (key: string, val: boolean, setter: (v: boolean) => void) => {
    setter(val); localStorage.setItem(key, String(val));
  };

  const saveTime = (key: string, val: string, setter: (v: string) => void) => {
    setter(val); localStorage.setItem(key, val);
  };

  const requestPermission = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const playPreviewSound = () => {
    if (playingPreview) return;
    setPlayingPreview(true);
    try {
      const ctx = new AudioContext();
      [[880, 0], [1100, 0.12], [880, 0.24]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.16);
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.18);
      });
      setTimeout(() => { setPlayingPreview(false); ctx.close(); }, 700);
    } catch { setPlayingPreview(false); }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SectionHeader title="Notifications" onBack={onBack} />

      {permission !== 'granted' && (
        <div className="mx-5 mt-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(0,168,132,0.1)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--accent)' }}>Enable browser notifications</p>
          <p className="mb-2" style={{ color: 'var(--text-secondary)' }}>
            {permission === 'denied' ? 'Notifications are blocked. Enable them in your browser settings.' : 'Allow notifications to receive alerts when the app is in the background.'}
          </p>
          {permission !== 'denied' && <button onClick={requestPermission} className="font-medium text-sm" style={{ color: 'var(--accent)' }}>Allow</button>}
        </div>
      )}

      <SectionDivider label="Message notifications" />
      <Toggle on={msgNotif} onChange={v => save('notif_messages', v, setMsgNotif)} label="Show in-app notifications" desc="Toast banners when messages arrive" />
      <Toggle on={msgSound} onChange={v => save('notif_sound', v, setMsgSound)} label="Notification sound" />
      <Toggle on={msgPreview} onChange={v => save('notif_preview', v, setMsgPreview)}
        label="Show message preview" desc="Display message content in notifications" />
      <div className="flex items-center justify-between px-5 py-3">
        <div>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Sound preview</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Hear what the notification sounds like</p>
        </div>
        <button onClick={playPreviewSound} disabled={playingPreview}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border hover:opacity-80 disabled:opacity-50"
          style={{ borderColor: 'var(--separator)', color: 'var(--text-primary)', background: 'var(--hover)' }}>
          {playingPreview ? <><svg className="w-3.5 h-3.5 fill-current animate-pulse" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>Playing…</> :
          <><svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>Preview</>}
        </button>
      </div>

      <SectionDivider label="Other notifications" />
      <Toggle on={groupNotif} onChange={v => save('notif_groups', v, setGroupNotif)} label="Group notifications" desc="Notifications from group chats" />
      <Toggle on={reactionNotif} onChange={v => save('notif_reactions', v, setReactionNotif)} label="Reaction notifications" desc="When someone reacts to your message" />
      <Toggle on={callRing} onChange={v => save('notif_calls', v, setCallRing)} label="Call ringtone" desc="Play ringtone for incoming calls" />

      <SectionDivider label="Quiet hours" />
      <Toggle on={quietHours} onChange={v => save('notif_quiet', v, setQuietHours)}
        label="Do not disturb" desc="Silence all notifications during set hours" />
      {quietHours && (
        <div className="px-5 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Silence from</label>
            <input type="time" value={quietFrom} onChange={e => saveTime('notif_quiet_from', e.target.value, setQuietFrom)}
              className="text-sm rounded-lg px-2 py-1 border outline-none"
              style={{ background: 'var(--hover)', color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Until</label>
            <input type="time" value={quietTo} onChange={e => saveTime('notif_quiet_to', e.target.value, setQuietTo)}
              className="text-sm rounded-lg px-2 py-1 border outline-none"
              style={{ background: 'var(--hover)', color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Notifications will be silenced from {quietFrom} to {quietTo}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Section: Storage ────────────────────────────────────────────────────────────
interface AccountStats { messages: number; media: number; calls: number; statuses: number; }

function StorageSection({ onBack }: { onBack: () => void }) {
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(est => setStorageInfo({ usage: est.usage || 0, quota: est.quota || 0 }));
    }
    api.get('/users/me/stats').then(({ data }) => setStats(data)).catch(() => {});
  }, []);

  const fmt = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const pct = storageInfo ? Math.min(100, Math.round((storageInfo.usage / storageInfo.quota) * 100)) : 0;

  const exportData = async () => {
    setExporting(true);
    try {
      const { data: chats } = await api.get('/chats');
      const exportObj: any = { exportedAt: new Date().toISOString(), chats: [] };
      for (const chat of chats.slice(0, 20)) {
        const { data: msgs } = await api.get(`/chats/${chat.id}/messages?limit=100`);
        exportObj.chats.push({ id: chat.id, name: chat.name || chat.other_user?.username, messages: msgs });
      }
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'chat-export.json';
      a.click(); URL.revokeObjectURL(url);
    } catch { alert('Export failed'); } finally { setExporting(false); }
  };

  const statItems = stats ? [
    { label: 'Messages sent', value: stats.messages.toLocaleString(), icon: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg> },
    { label: 'Media shared', value: stats.media.toLocaleString(), icon: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg> },
    { label: 'Calls made', value: stats.calls.toLocaleString(), icon: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg> },
    { label: 'Status updates', value: stats.statuses.toLocaleString(), icon: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg> },
  ] : [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SectionHeader title="Storage and data" onBack={onBack} />

      <SectionDivider label="Account activity" />
      {stats ? (
        <div className="px-5 py-3 grid grid-cols-2 gap-3">
          {statItems.map(item => (
            <div key={item.label} className="rounded-xl p-3" style={{ background: 'var(--hover)' }}>
              <div className="flex items-center gap-1.5 mb-1" style={{ color: 'var(--icon)' }}>{item.icon}</div>
              <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{item.value}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex justify-center py-6">
          <svg className="animate-spin w-5 h-5" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        </div>
      )}

      <SectionDivider label="Browser storage" />
      {storageInfo ? (
        <div className="px-5 py-4">
          <div className="flex justify-between text-sm mb-2">
            <span style={{ color: 'var(--text-primary)' }}>{fmt(storageInfo.usage)} used</span>
            <span style={{ color: 'var(--text-secondary)' }}>{fmt(storageInfo.quota)} total</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--separator)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--accent)' }} />
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{pct}% of available storage used</p>
        </div>
      ) : (
        <p className="px-5 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Storage info not available in this browser</p>
      )}

      <SectionDivider label="Manage data" />
      <button onClick={exportData} disabled={exporting}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:opacity-80 disabled:opacity-50">
        <div>
          <p className="text-sm text-left" style={{ color: 'var(--text-primary)' }}>Export chat history</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Download your messages as a JSON file</p>
        </div>
        {exporting ? <svg className="animate-spin w-4 h-4" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        : <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>}
      </button>

      <button onClick={() => {
        if (confirm('Clear local app data? This will not delete your account or messages.')) {
          const keep = ['token', 'user', 'darkMode'];
          Object.keys(localStorage).filter(k => !keep.includes(k)).forEach(k => localStorage.removeItem(k));
          window.location.reload();
        }
      }} className="w-full flex items-center justify-between px-5 py-3.5 hover:opacity-80">
        <div>
          <p className="text-sm text-left" style={{ color: 'var(--text-primary)' }}>Clear app data</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>Resets all preferences, keeps your account</p>
        </div>
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--icon)' }}><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>

      <SectionDivider label="Network usage" />
      <div className="px-5 py-3 space-y-2">
        {[
          { label: 'Auto-download on Wi-Fi', key: 'mediaAutoDownload', defaultOn: true },
          { label: 'Auto-download when roaming', key: 'mediaDownloadRoaming', defaultOn: false },
        ].map(({ label, key, defaultOn }) => (
          <div key={key} className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span className="font-medium" style={{ color: (localStorage.getItem(key) ?? String(defaultOn)) !== 'false' ? 'var(--accent)' : 'var(--text-tertiary)' }}>
              {(localStorage.getItem(key) ?? String(defaultOn)) !== 'false' ? 'On' : 'Off'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Section: Help ────────────────────────────────────────────────────────────────
const KEYBOARD_SHORTCUTS = [
  { category: 'Navigation', shortcuts: [
    { keys: ['Ctrl', 'F'], desc: 'Open global search' },
    { keys: ['Ctrl', 'N'], desc: 'New chat' },
    { keys: ['Escape'], desc: 'Close panel / end call' },
  ]},
  { category: 'Messaging', shortcuts: [
    { keys: ['Enter'], desc: 'Send message' },
    { keys: ['Shift', 'Enter'], desc: 'New line' },
  ]},
  { category: 'Calls', shortcuts: [
    { keys: ['Escape'], desc: 'End call' },
    { keys: ['M'], desc: 'Mute / unmute microphone' },
  ]},
  { category: 'Media viewer', shortcuts: [
    { keys: ['Escape'], desc: 'Close viewer' },
    { keys: ['+'], desc: 'Zoom in' },
    { keys: ['-'], desc: 'Zoom out' },
    { keys: ['0'], desc: 'Reset zoom' },
  ]},
];

const FAQ = [
  { q: 'How do I start a voice or video call?', a: 'Open a direct (1-on-1) chat and tap the phone or video icon in the top-right of the chat header. Group calls are not yet supported.' },
  { q: 'Can I see who viewed my status?', a: 'Yes — open your own status and swipe up, or look for the eye icon at the bottom. You\'ll see a list of everyone who viewed it.' },
  { q: 'How do I mute a chat?', a: 'Open the chat info panel (tap the name at the top) and use the Mute toggle. Muted chats won\'t play sounds or show banners.' },
  { q: 'How do disappearing messages work?', a: 'Set a default timer in Settings → Privacy → Disappearing messages. When enabled, new messages auto-delete after the timer expires.' },
  { q: 'How do I change the app accent color?', a: 'Go to Settings → Appearance → App color and pick one of the 8 presets or use the custom color picker.' },
  { q: 'Can I export my chat history?', a: 'Yes — go to Settings → Storage and data → Export chat history to download a JSON file of your recent messages.' },
];

function HelpSection({ onBack }: { onBack: () => void }) {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportSent, setReportSent] = useState(false);

  const sendReport = () => {
    if (!reportText.trim()) return;
    console.log('[Bug report]', reportText);
    setReportSent(true);
    setReportText('');
    setTimeout(() => setReportSent(false), 3000);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SectionHeader title="Help" onBack={onBack} />

      {/* Keyboard shortcuts */}
      <div className="border-b" style={{ borderColor: 'var(--separator)' }}>
        <button onClick={() => setShortcutsOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:opacity-80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--hover)', color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM8 11H6V9h2v2zm0 4H6v-2h2v2zm4-4h-2V9h2v2zm0 4h-2v-2h2v2zm4-4h-2V9h2v2zm0 4h-2v-2h2v2z"/></svg>
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Keyboard shortcuts</span>
          </div>
          <svg viewBox="0 0 24 24" className={`w-4 h-4 fill-current transition-transform ${shortcutsOpen ? 'rotate-90' : ''}`} style={{ color: 'var(--icon)' }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
        {shortcutsOpen && (
          <div className="px-5 pb-4 space-y-4">
            {KEYBOARD_SHORTCUTS.map(group => (
              <div key={group.category}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--accent)' }}>{group.category}</p>
                <div className="space-y-2">
                  {group.shortcuts.map(s => (
                    <div key={s.desc} className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.desc}</span>
                      <div className="flex items-center gap-1">
                        {s.keys.map((k, i) => (
                          <span key={i} className="flex items-center gap-1">
                            <kbd className="px-1.5 py-0.5 rounded text-xs font-mono border"
                              style={{ background: 'var(--bg)', borderColor: 'var(--separator)', color: 'var(--text-primary)' }}>{k}</kbd>
                            {i < s.keys.length - 1 && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>+</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAQ */}
      <SectionDivider label="Frequently asked questions" />
      {FAQ.map((item, i) => (
        <div key={i} className="border-b" style={{ borderColor: 'var(--separator)' }}>
          <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:opacity-80">
            <span className="text-sm pr-4" style={{ color: 'var(--text-primary)' }}>{item.q}</span>
            <svg viewBox="0 0 24 24" className={`w-4 h-4 fill-current shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} style={{ color: 'var(--icon)' }}>
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </button>
          {faqOpen === i && (
            <div className="px-5 pb-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item.a}</p>
            </div>
          )}
        </div>
      ))}

      {/* Report a problem */}
      <SectionDivider label="Support" />
      <div className="border-b" style={{ borderColor: 'var(--separator)' }}>
        <button onClick={() => setReportOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:opacity-80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--hover)', color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Report a problem</span>
          </div>
          <svg viewBox="0 0 24 24" className={`w-4 h-4 fill-current transition-transform ${reportOpen ? 'rotate-90' : ''}`} style={{ color: 'var(--icon)' }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
        {reportOpen && (
          <div className="px-5 pb-4 space-y-3">
            <textarea value={reportText} onChange={e => setReportText(e.target.value)} rows={4}
              placeholder="Describe the problem you encountered…"
              className="w-full text-sm rounded-xl px-3 py-2 border outline-none resize-none"
              style={{ background: 'var(--hover)', color: 'var(--text-primary)', borderColor: 'var(--separator)' }} />
            {reportSent && <p className="text-sm" style={{ color: 'var(--accent)' }}>✓ Report sent — thank you!</p>}
            <button onClick={sendReport} disabled={!reportText.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}>
              Send report
            </button>
          </div>
        )}
      </div>

      <SectionDivider label="About VYRE" />
      <div className="px-5 py-4 space-y-2">
        {[
          { label: 'App', value: 'VYRE' },
          { label: 'Version', value: '1.0.0' },
          { label: 'Build', value: '2026.06.14' },
          { label: 'Platform', value: 'Web (React + Node.js)' },
          { label: 'Transport', value: 'WebSocket (Socket.io)' },
          { label: 'Calls', value: 'WebRTC P2P' },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ color: 'var(--text-primary)' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Settings Panel ──────────────────────────────────────────────────────────
export default function SettingsPanel({ onClose, darkMode, onToggleDark }: Props) {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<Section | null>(null);

  const renderSection = () => {
    const back = () => setActiveSection(null);
    switch (activeSection) {
      case 'account':      return <AccountSection onBack={back} />;
      case 'privacy':      return <PrivacySection onBack={back} />;
      case 'chats':        return <ChatsSection onBack={back} />;
      case 'appearance':   return <AppearanceSection onBack={back} darkMode={darkMode} onToggleDark={onToggleDark} />;
      case 'notifications': return <NotificationsSection onBack={back} />;
      case 'storage':      return <StorageSection onBack={back} />;
      case 'help':         return <HelpSection onBack={back} />;
      default:             return null;
    }
  };

  return (
    <div className="fixed inset-y-0 left-0 z-40 w-[380px] flex flex-col shadow-2xl fade-in"
      style={{ background: 'var(--panel)' }}>
      {activeSection ? (
        <div className="flex flex-col h-full overflow-hidden">{renderSection()}</div>
      ) : (
        <>
          <div className="flex items-center gap-4 px-4 py-4 border-b" style={{ background: 'var(--header)', borderColor: 'var(--separator)' }}>
            <button onClick={onClose} style={{ color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
            <h2 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Settings</h2>
          </div>

          <button onClick={() => setActiveSection('account')}
            className="flex items-center gap-4 px-5 py-4 border-b hover:opacity-80 transition-opacity"
            style={{ borderColor: 'var(--separator)' }}>
            <Avatar src={user?.avatar} name={user?.username} size={56} />
            <div className="flex-1 min-w-0 text-left">
              <p className="font-semibold text-base truncate" style={{ color: 'var(--text-primary)' }}>{user?.username}</p>
              <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>{user?.about || 'Hey there!'}</p>
            </div>
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" style={{ color: 'var(--icon)' }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
          </button>

          <div className="flex-1 overflow-y-auto">
            {SECTIONS.filter(s => s.id !== 'account').map(section => (
              <button key={section.id} onClick={() => setActiveSection(section.id)}
                className="w-full flex items-center gap-4 px-5 py-3.5 border-b hover:opacity-80 transition-opacity text-left"
                style={{ borderColor: 'var(--separator)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--hover)', color: 'var(--icon)' }}>
                  {section.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{section.label}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{section.desc}</p>
                </div>
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" style={{ color: 'var(--icon)' }}><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
              </button>
            ))}

            <button onClick={logout}
              className="w-full flex items-center gap-4 px-5 py-3.5 text-left text-red-500 hover:opacity-80 transition-opacity mt-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-red-500"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
              </div>
              <span className="text-sm font-medium">Log out</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
