import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/axios';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [twoFA, setTwoFA] = useState(false);   // login: awaiting 2FA code
  const [code, setCode] = useState('');
  const { login, register } = useAuth();

  // Password-reset flow, driven by ?reset=<token> in the URL (from the email link).
  const initialToken = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('reset') || '' : '';
  const [flow, setFlow] = useState<'auth' | 'forgot' | 'reset'>(initialToken ? 'reset' : 'auth');
  const [resetToken] = useState(initialToken);
  const [fpEmail, setFpEmail] = useState('');
  const [rpPw, setRpPw] = useState('');
  const [rpConfirm, setRpConfirm] = useState('');
  const [info, setInfo] = useState('');
  const [devLink, setDevLink] = useState('');

  const switchMode = (m: 'login' | 'register') => { setMode(m); setError(''); setTwoFA(false); setCode(''); };

  const clearToAuth = () => {
    setFlow('auth'); setError(''); setInfo(''); setDevLink(''); setRpPw(''); setRpConfirm('');
    if (window.history.replaceState) window.history.replaceState({}, '', window.location.pathname);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (mode === 'login') {
        const res = await login(form.email, form.password, twoFA ? code : undefined);
        if (res.twoFactorRequired) { setTwoFA(true); setLoading(false); return; }
      } else {
        if (!form.username.trim()) { setError('Username required'); setLoading(false); return; }
        await register(form.username, form.email, form.password);
      }
    } catch (err: any) { setError(err.response?.data?.error || 'Something went wrong'); }
    finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setInfo(''); setDevLink(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: fpEmail });
      setInfo(data.message || 'If an account exists for that email, a reset link has been sent.');
      if (data.devResetLink) setDevLink(data.devResetLink);
    } catch (err: any) { setError(err.response?.data?.error || 'Something went wrong'); }
    finally { setLoading(false); }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setInfo('');
    if (rpPw !== rpConfirm) { setError("Passwords don't match"); return; }
    if (rpPw.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: resetToken, newPassword: rpPw });
      setInfo('Password reset! Returning to login…');
      setTimeout(clearToAuth, 1600);
    } catch (err: any) { setError(err.response?.data?.error || 'Something went wrong'); }
    finally { setLoading(false); }
  };

  const inputCls = 'w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors border';
  const inputStyle = { color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--separator)' } as const;

  const field = (label: string, type: string, placeholder: string, key: 'username' | 'email' | 'password') => (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input type={type} placeholder={placeholder} value={form[key]} required
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className={inputCls} style={inputStyle}
        {...(key === 'password' ? { minLength: 6 } : {})}
      />
    </div>
  );

  const errorBox = error && (
    <div className="border rounded-lg px-4 py-3 text-sm text-red-500"
      style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>{error}</div>
  );
  const infoBox = info && (
    <div className="rounded-lg px-4 py-3 text-sm text-green-500" style={{ background: 'rgba(34,197,94,0.08)' }}>
      {info}
      {devLink && (
        <div className="mt-2 break-all">
          <span style={{ color: 'var(--text-tertiary)' }}>Dev (no email configured): </span>
          <a href={devLink} className="underline" style={{ color: 'var(--accent)' }}>open reset link</a>
        </div>
      )}
    </div>
  );

  const submitBtn = (label: string, busyLabel: string) => (
    <button type="submit" disabled={loading}
      className="w-full bg-wa-green hover:bg-wa-green-dark text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-60">
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>{busyLabel}
        </span>
      ) : label}
    </button>
  );

  const backBtn = (
    <button type="button" onClick={clearToAuth} className="w-full text-center text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
      ← Back to login
    </button>
  );

  return (
    <div className="flex items-center justify-center w-full h-full" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm px-4">
        <div className="flex flex-col items-center mb-8">
          <img src="/vyre.svg" alt="VYRE" className="w-20 h-20 rounded-2xl shadow-xl mb-4" />
          <h1 className="text-3xl font-bold tracking-widest" style={{ color: 'var(--accent)' }}>VYRE</h1>
          <p className="text-xs uppercase tracking-widest mt-1" style={{ color: 'var(--text-tertiary)' }}>where conversations ignite</p>
        </div>

        <div className="rounded-2xl shadow-lg p-8" style={{ background: 'var(--panel)' }}>
          {flow === 'reset' ? (
            <form onSubmit={handleReset} className="space-y-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Set a new password</h2>
              <input type="password" placeholder="New password" value={rpPw} required minLength={6}
                onChange={e => setRpPw(e.target.value)} className={inputCls} style={inputStyle} />
              <input type="password" placeholder="Confirm new password" value={rpConfirm} required minLength={6}
                onChange={e => setRpConfirm(e.target.value)} className={inputCls} style={inputStyle} />
              {errorBox}{infoBox}
              {submitBtn('Reset password', 'Resetting…')}
              {backBtn}
            </form>
          ) : flow === 'forgot' ? (
            <form onSubmit={handleForgot} className="space-y-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Reset your password</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Enter your email and we'll send a reset link.</p>
              <input type="email" placeholder="your@email.com" value={fpEmail} required
                onChange={e => setFpEmail(e.target.value)} className={inputCls} style={inputStyle} />
              {errorBox}{infoBox}
              {submitBtn('Send reset link', 'Sending…')}
              {backBtn}
            </form>
          ) : (
            <>
              <div className="flex mb-6 rounded-lg p-1" style={{ background: 'var(--hover)' }}>
                {(['login', 'register'] as const).map(m => (
                  <button key={m} onClick={() => switchMode(m)}
                    className="flex-1 py-2 rounded-md text-sm font-medium transition-all"
                    style={{
                      background: mode === m ? 'var(--panel)' : 'transparent',
                      color: mode === m ? 'var(--accent)' : 'var(--text-secondary)',
                      boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    }}>
                    {m === 'login' ? 'Log in' : 'Sign up'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'login' && twoFA ? (
                  <div>
                    <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                      Two-factor authentication is on. Enter the 6-digit code from your authenticator app.
                    </p>
                    <input inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus required
                      placeholder="123456" value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full rounded-lg px-4 py-3 text-center text-lg tracking-[0.4em] outline-none border"
                      style={inputStyle} />
                    <button type="button" onClick={() => { setTwoFA(false); setCode(''); setError(''); }}
                      className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>← Back to login</button>
                  </div>
                ) : (
                  <>
                    {mode === 'register' && field('Username', 'text', 'Your name', 'username')}
                    {field(mode === 'login' ? 'Email or username' : 'Email', mode === 'login' ? 'text' : 'email', mode === 'login' ? 'email or username' : 'your@email.com', 'email')}
                    {field('Password', 'password', '••••••••', 'password')}
                  </>
                )}

                {errorBox}

                {submitBtn(
                  mode === 'login' ? (twoFA ? 'Verify code' : 'Log in') : 'Create account',
                  mode === 'login' ? (twoFA ? 'Verifying...' : 'Logging in...') : 'Creating account...'
                )}
              </form>

              {mode === 'login' && !twoFA && (
                <button type="button"
                  onClick={() => { setFlow('forgot'); setError(''); setInfo(''); setDevLink(''); setFpEmail(form.email.includes('@') ? form.email : ''); }}
                  className="w-full text-center text-xs mt-4" style={{ color: 'var(--accent)' }}>
                  Forgot password?
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
