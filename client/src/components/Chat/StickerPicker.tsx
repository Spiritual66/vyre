import { useState, useEffect, useRef } from 'react';
import { STICKER_PACKS, getRecentStickers, addRecentSticker } from '../../data/stickers';

interface Props {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function StickerPicker({ onSelect, onClose }: Props) {
  const [activePackId, setActivePackId] = useState<string>('recent');
  const [recent, setRecent] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRecent(getRecentStickers());
  }, []);

  const handleSelect = (emoji: string) => {
    addRecentSticker(emoji);
    onSelect(emoji);
  };

  const allStickers = STICKER_PACKS.flatMap(p => p.stickers);
  const searchResults = search.trim()
    ? allStickers.filter(e => e.includes(search)) // emoji search isn't great but OK
    : null;

  const activePack = activePackId === 'recent'
    ? { id: 'recent', name: 'Recently Used', icon: '🕐', stickers: recent }
    : STICKER_PACKS.find(p => p.id === activePackId) ?? STICKER_PACKS[0];

  const displayStickers = searchResults ?? activePack.stickers;

  return (
    <div
      className="rounded-2xl shadow-2xl overflow-hidden flex flex-col fade-in"
      style={{
        width: 320,
        height: 310,
        background: 'var(--panel)',
        border: '1px solid var(--separator)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b shrink-0"
        style={{ borderColor: 'var(--separator)' }}>
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Stickers</span>
        <div className="flex-1 flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ background: 'var(--input-bg)' }}>
          <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current shrink-0" style={{ color: 'var(--icon)' }}>
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search stickers…"
            className="flex-1 text-xs bg-transparent outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
        <button onClick={onClose} className="p-1 rounded-full hover:opacity-60 transition-opacity shrink-0" style={{ color: 'var(--icon)' }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex items-center border-b shrink-0 overflow-x-auto"
          style={{ borderColor: 'var(--separator)' }}>
          {/* Recent tab */}
          <button
            onClick={() => setActivePackId('recent')}
            className="flex items-center justify-center w-10 h-9 text-lg shrink-0 relative transition-opacity hover:opacity-70"
            style={{ opacity: activePackId === 'recent' ? 1 : 0.5 }}
            title="Recently Used"
          >
            🕐
            {activePackId === 'recent' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--accent)' }} />
            )}
          </button>

          {STICKER_PACKS.map(pack => (
            <button
              key={pack.id}
              onClick={() => setActivePackId(pack.id)}
              className="flex items-center justify-center w-10 h-9 text-lg shrink-0 relative transition-opacity hover:opacity-70"
              style={{ opacity: activePackId === pack.id ? 1 : 0.5 }}
              title={pack.name}
            >
              {pack.icon}
              {activePackId === pack.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: 'var(--accent)' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Sticker grid */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto p-2">
        {displayStickers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40">
            <span style={{ fontSize: 40 }}>🎭</span>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {activePackId === 'recent' ? 'No recent stickers yet' : 'No results'}
            </p>
          </div>
        ) : (
          <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
            {displayStickers.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => handleSelect(emoji)}
                className="flex items-center justify-center rounded-xl transition-transform hover:scale-125 hover:bg-opacity-10 active:scale-95"
                style={{
                  aspectRatio: '1',
                  fontSize: 28,
                  lineHeight: 1,
                }}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pack name label */}
      {!search && (
        <div className="px-3 py-1.5 shrink-0 border-t" style={{ borderColor: 'var(--separator)' }}>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-tertiary)' }}>
            {activePackId === 'recent' ? 'Recently Used' : STICKER_PACKS.find(p => p.id === activePackId)?.name}
          </span>
        </div>
      )}
    </div>
  );
}
