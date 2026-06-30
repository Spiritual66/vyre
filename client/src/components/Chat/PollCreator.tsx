import { useState } from 'react';

const inputStyle = { color: 'var(--text-primary)', background: 'var(--input-bg)', borderColor: 'var(--separator)' } as const;

export default function PollCreator({ onCreate, onClose }: {
  onCreate: (poll: { question: string; options: string[] }) => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const cleaned = options.map(o => o.trim()).filter(Boolean);
  const valid = question.trim().length > 0 && cleaned.length >= 2;

  const submit = () => {
    if (!valid) return;
    onCreate({ question: question.trim(), options: cleaned });
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl p-5 mx-4" style={{ background: 'var(--panel)' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Create a poll</h3>
        <input value={question} autoFocus onChange={e => setQuestion(e.target.value)} placeholder="Ask a question…"
          className="w-full rounded-lg px-3 py-2 text-sm mb-3 outline-none border" style={inputStyle} />
        <div className="space-y-2 mb-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={o} onChange={e => setOptions(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                placeholder={`Option ${i + 1}`} className="flex-1 rounded-lg px-3 py-2 text-sm outline-none border" style={inputStyle} />
              {options.length > 2 && (
                <button type="button" onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))}
                  className="text-lg leading-none px-1" style={{ color: 'var(--text-tertiary)' }} title="Remove">×</button>
              )}
            </div>
          ))}
        </div>
        {options.length < 8 && (
          <button type="button" onClick={() => setOptions(p => [...p, ''])} className="text-xs mb-4" style={{ color: 'var(--accent)' }}>
            + Add option
          </button>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg" style={{ color: 'var(--text-secondary)' }}>Cancel</button>
          <button type="button" onClick={submit} disabled={!valid}
            className="px-4 py-2 text-sm rounded-lg bg-wa-green text-white font-medium disabled:opacity-50">Create poll</button>
        </div>
      </div>
    </div>
  );
}
