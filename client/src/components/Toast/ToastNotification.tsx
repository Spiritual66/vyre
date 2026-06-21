import { useEffect, useRef } from 'react';

export interface ToastItem {
  id: string;
  chatId: string;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  isGroup: boolean;
  chatName?: string;
  duration?: number;
}

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onClickToast: (chatId: string, id: string) => void;
}

function Toast({ toast, onDismiss, onClick }: { toast: ToastItem; onDismiss: () => void; onClick: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, toast.duration ?? 4000);
    return () => clearTimeout(timerRef.current);
  }, [onDismiss, toast.duration]);

  const initials = toast.senderName?.slice(0, 2).toUpperCase() || '??';

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 w-80 px-4 py-3 rounded-xl shadow-xl cursor-pointer select-none"
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--separator)',
        animation: 'toastSlideIn 0.25s ease',
      }}
    >
      {/* Avatar */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-bold text-white bg-wa-green">
        {toast.senderAvatar ? (
          <img src={toast.senderAvatar} alt={toast.senderName} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {toast.isGroup ? `${toast.senderName}` : toast.senderName}
          </p>
          {toast.isGroup && toast.chatName && (
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              ~ {toast.chatName}
            </p>
          )}
        </div>
        <p className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
          {toast.body}
        </p>
      </div>

      {/* Dismiss */}
      <button
        onClick={e => { e.stopPropagation(); onDismiss(); }}
        className="flex-shrink-0 p-1 rounded-full opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--icon)' }}
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>
    </div>
  );
}

export default function ToastNotification({ toasts, onDismiss, onClickToast }: Props) {
  if (!toasts.length) return null;

  return (
    <>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: 320 }}
      >
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <Toast
              toast={t}
              onDismiss={() => onDismiss(t.id)}
              onClick={() => onClickToast(t.chatId, t.id)}
            />
          </div>
        ))}
      </div>
    </>
  );
}
