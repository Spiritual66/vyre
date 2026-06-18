import type { MouseEvent } from 'react';

interface ContactData {
  id: string;
  name: string;
  about?: string;
  avatar?: string | null;
}

interface Props {
  content: string;
  isOwn: boolean;
}

function Initials({ name, size }: { name: string; size: number }) {
  const COLORS = ['#128c7e', '#25d366', '#34b7f1', '#8e44ad', '#e74c3c', '#f39c12', '#2c3e50', '#16a085'];
  const color = COLORS[name.charCodeAt(0) % COLORS.length];
  const letter = name.charAt(0).toUpperCase();
  return (
    <div
      className="rounded-full flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {letter}
    </div>
  );
}

export default function ContactCard({ content, isOwn }: Props) {
  let data: ContactData;
  try {
    data = JSON.parse(content);
  } catch {
    return (
      <span className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
        Invalid contact
      </span>
    );
  }

  const { id, name, about, avatar } = data;

  const handleMessage = (e: MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('vyre:open-dm', { detail: { userId: id } }));
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{ width: 240 }}>
      {/* Contact info */}
      <div
        className="flex items-center gap-3 px-3 py-3"
        style={{ background: isOwn ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.04)' }}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="w-11 h-11 rounded-full object-cover shrink-0"
            onError={e => {
              e.currentTarget.style.display = 'none';
              (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.setProperty('display', 'flex');
            }}
          />
        ) : null}
        {/* Fallback initials (shown when no avatar or avatar fails) */}
        <div style={{ display: avatar ? 'none' : 'flex' }}>
          <Initials name={name} size={44} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {name}
          </p>
          {about && (
            <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {about}
            </p>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--separator)' }} />

      {/* Action bar */}
      <div
        className="flex"
        style={{ background: isOwn ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.02)' }}
      >
        <button
          onClick={handleMessage}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color: 'var(--accent)' }}
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
          </svg>
          Message
        </button>
      </div>
    </div>
  );
}
