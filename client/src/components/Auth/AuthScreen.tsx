import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        if (!form.username.trim()) { setError('Username required'); setLoading(false); return; }
        await register(form.username, form.email, form.password);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const field = (label: string, type: string, placeholder: string, key: 'username' | 'email' | 'password') => (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input type={type} placeholder={placeholder} value={form[key]} required
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors border"
        style={{ color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--separator)' }}
        {...(key === 'password' ? { minLength: 6 } : {})}
      />
    </div>
  );

  return (
    <div className="flex items-center justify-center w-full h-full" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm px-4">
        {/* VYRE Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/vyre.svg" alt="VYRE" className="w-20 h-20 rounded-2xl shadow-xl mb-4" />
          <h1 className="text-3xl font-bold tracking-widest" style={{ color: 'var(--accent)' }}>VYRE</h1>
          <p className="text-xs uppercase tracking-widest mt-1" style={{ color: 'var(--text-tertiary)' }}>where conversations ignite</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl shadow-lg p-8" style={{ background: 'var(--panel)' }}>
          {/* Mode toggle */}
          <div className="flex mb-6 rounded-lg p-1" style={{ background: 'var(--hover)' }}>
            {(['login', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
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
            {mode === 'register' && field('Username', 'text', 'Your name', 'username')}
            {field(mode === 'login' ? 'Email or username' : 'Email', mode === 'login' ? 'text' : 'email', mode === 'login' ? 'email or username' : 'your@email.com', 'email')}
            {field('Password', 'password', '••••••••', 'password')}

            {error && (
              <div className="border rounded-lg px-4 py-3 text-sm text-red-500"
                style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full bg-wa-green hover:bg-wa-green-dark text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-60">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {mode === 'login' ? 'Logging in...' : 'Creating account...'}
                </span>
              ) : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
