import { useSocket } from '../../contexts/SocketContext';

export default function WelcomeScreen() {
  const { connected } = useSocket();

  return (
    <div className="flex-1 flex flex-col items-center justify-center border-l select-none"
      style={{ background: 'var(--bg)', borderColor: 'var(--separator)' }}>
      <div className="flex flex-col items-center max-w-md text-center px-8">
        {/* VYRE Logo */}
        <div className="w-44 h-44 mb-8 flex items-center justify-center relative">
          <img src="/vyre.svg" alt="VYRE" className="w-36 h-36 rounded-3xl shadow-lg" />
          {/* Connection dot */}
          <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 transition-colors ${connected ? 'bg-green-500' : 'bg-gray-400'}`}
            style={{ borderColor: 'var(--bg)' }} />
        </div>

        <h2 className="text-4xl font-bold tracking-widest mb-1" style={{ color: 'var(--accent)' }}>VYRE</h2>
        <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--text-tertiary)' }}>where conversations ignite</p>
        <p className="text-sm leading-relaxed mb-8" style={{ color: 'var(--text-secondary)' }}>
          Select a chat from the left or start a new one.
        </p>

        {/* Keyboard shortcuts */}
        <div className="w-full rounded-2xl p-5 mb-6 text-left" style={{ background: 'var(--panel)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--accent)' }}>Keyboard shortcuts</p>
          <div className="space-y-2">
            {[
              { keys: ['Ctrl', 'N'], desc: 'New chat' },
              { keys: ['Ctrl', 'F'], desc: 'Global search' },
              { keys: ['Enter'], desc: 'Send message' },
              { keys: ['Shift', 'Enter'], desc: 'New line in message' },
              { keys: ['Esc'], desc: 'Close current panel' },
              { keys: ['M'], desc: 'Mute / unmute (during call)' },
            ].map(({ keys, desc }) => (
              <div key={desc} className="flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{desc}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {keys.map((k, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <kbd className="px-1.5 py-0.5 rounded text-xs font-mono border"
                        style={{ background: 'var(--bg)', borderColor: 'var(--separator)', color: 'var(--text-primary)' }}>{k}</kbd>
                      {i < keys.length - 1 && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>+</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 w-full mb-6">
          {[
            { icon: '📞', label: 'Voice & Video calls', desc: 'P2P WebRTC calls' },
            { icon: '📎', label: 'File sharing', desc: 'Photos, videos, docs' },
            { icon: '👥', label: 'Group chats', desc: 'Up to 256 members' },
            { icon: '🔒', label: 'Private', desc: 'Encrypted in transit (TLS)' },
          ].map(f => (
            <div key={f.label} className="rounded-xl p-3 text-left" style={{ background: 'var(--panel)' }}>
              <span className="text-xl">{f.icon}</span>
              <p className="text-xs font-semibold mt-1.5" style={{ color: 'var(--text-primary)' }}>{f.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: 'var(--accent)' }}>
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
          Your connection is encrypted in transit
        </div>
      </div>
    </div>
  );
}
