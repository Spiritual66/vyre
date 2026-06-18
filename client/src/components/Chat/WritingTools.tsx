import { useState } from 'react';
import api from '../../api/axios';

interface Props {
  text: string;
  onApply: (result: string) => void;
  onClose: () => void;
}

type Action = 'proofread' | 'rewrite' | 'friendly' | 'professional' | 'concise' | 'longer' | 'list' | 'improve' | 'translate' | 'summarize' | 'emojify';

const TOOLS: { id: Action; label: string; icon: string; desc: string }[] = [
  { id: 'proofread',    label: 'Proofread',    icon: '✓',  desc: 'Fix spelling & grammar' },
  { id: 'rewrite',      label: 'Rewrite',      icon: '↺',  desc: 'Clearer & more engaging' },
  { id: 'friendly',     label: 'Friendly',     icon: '😊', desc: 'Warm, casual tone' },
  { id: 'professional', label: 'Professional', icon: '💼', desc: 'Formal business tone' },
  { id: 'concise',      label: 'Concise',      icon: '⟨⟩', desc: 'Remove filler words' },
  { id: 'longer',       label: 'Expand',       icon: '⇕',  desc: 'Add detail & context' },
  { id: 'list',         label: 'Make List',    icon: '≡',  desc: 'Bullet or numbered list' },
  { id: 'improve',      label: 'Improve',      icon: '✨', desc: 'Better flow & impact' },
  { id: 'translate',    label: 'Translate',    icon: '🌐', desc: 'Auto-detect & translate' },
  { id: 'summarize',    label: 'Summarize',    icon: '📝', desc: '2-3 sentence summary' },
  { id: 'emojify',      label: 'Emojify',      icon: '🎉', desc: 'Add relevant emojis' },
];

export default function WritingTools({ text, onApply, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<Action | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editingResult, setEditingResult] = useState(false);
  const [editedResult, setEditedResult] = useState('');

  const runTool = async (action: Action) => {
    if (loading) return;
    setActiveAction(action);
    setResult(null);
    setError('');
    setEditingResult(false);
    setLoading(true);

    try {
      const { data } = await api.post('/ai/writing', { text, action });
      setResult(data.result);
      setEditedResult(data.result);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Writing tools unavailable. Add GEMINI_API_KEY or GROQ_API_KEY to server/.env.';
      setError(msg);
      setActiveAction(null);
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    onApply(editedResult || result!);
    onClose();
  };

  const reset = () => {
    setResult(null);
    setActiveAction(null);
    setError('');
    setEditingResult(false);
  };

  return (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 mx-2 rounded-2xl shadow-2xl flex flex-col overflow-hidden fade-in"
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--separator)',
        zIndex: 50,
        maxHeight: 380,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0" style={{ borderColor: 'var(--separator)' }}>
        <span style={{ fontSize: 16 }}>✨</span>
        <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>Writing Tools</span>
        {result && (
          <button onClick={reset} className="text-xs px-2 py-0.5 rounded-full hover:opacity-70 transition-opacity"
            style={{ color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
            ← Back
          </button>
        )}
        <button onClick={onClose} className="p-1 rounded-full hover:opacity-60 transition-opacity" style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* Original text preview */}
      <div className="px-4 py-2 shrink-0 border-b" style={{ borderColor: 'var(--separator)', background: 'var(--hover)' }}>
        <p className="text-[11px] font-medium mb-0.5" style={{ color: 'var(--text-tertiary)' }}>ORIGINAL</p>
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{text}</p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-6">
          <svg className="animate-spin w-6 h-6" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {TOOLS.find(t => t.id === activeAction)?.label}…
          </span>
        </div>
      )}

      {/* Result */}
      {!loading && result !== null && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {editingResult ? (
              <textarea
                autoFocus
                value={editedResult}
                onChange={e => setEditedResult(e.target.value)}
                className="w-full text-sm leading-relaxed bg-transparent outline-none resize-none"
                style={{ color: 'var(--text-primary)', minHeight: 80 }}
                rows={4}
              />
            ) : (
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>
                {result}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5 border-t shrink-0" style={{ borderColor: 'var(--separator)' }}>
            <button
              onClick={apply}
              className="flex-1 py-1.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-80"
              style={{ background: 'var(--accent)' }}
            >
              Use this
            </button>
            <button
              onClick={() => { if (!editingResult) setEditedResult(result!); setEditingResult(e => !e); }}
              className="px-3 py-1.5 rounded-full text-sm font-medium border transition-opacity hover:opacity-70"
              style={{ borderColor: 'var(--separator)', color: 'var(--text-primary)' }}
            >
              {editingResult ? 'Preview' : 'Edit'}
            </button>
            <button
              onClick={reset}
              className="px-3 py-1.5 rounded-full text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--text-secondary)' }}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Tool grid */}
      {!loading && result === null && !error && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-4 gap-2">
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                onClick={() => runTool(tool.id)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all hover:opacity-80 active:scale-95"
                style={{
                  background: activeAction === tool.id ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--hover)',
                  borderColor: activeAction === tool.id ? 'var(--accent)' : 'var(--separator)',
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{tool.icon}</span>
                <span className="text-[10px] font-medium text-center leading-tight" style={{ color: 'var(--text-primary)' }}>
                  {tool.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {!loading && result === null && error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-5">
          <span style={{ fontSize: 32 }}>⚠️</span>
          <p className="text-sm text-center leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <button
            onClick={reset}
            className="text-xs px-4 py-1.5 rounded-full font-medium border hover:opacity-70 transition-opacity"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
