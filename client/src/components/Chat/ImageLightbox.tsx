import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '=' || e.key === '+') setZoom(z => Math.min(z + 0.3, 5));
      if (e.key === '-') setZoom(z => Math.max(z - 0.3, 0.3));
      if (e.key === '0') { setZoom(1); setPos({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.3, Math.min(5, z + (e.deltaY > 0 ? -0.15 : 0.15))));
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setDragging(true);
    drag.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPos({
      x: drag.current.px + (e.clientX - drag.current.mx) / zoom,
      y: drag.current.py + (e.clientY - drag.current.my) / zoom,
    });
  };

  const onDoubleClick = () => {
    if (zoom > 1) { setZoom(1); setPos({ x: 0, y: 0 }); }
    else setZoom(2.5);
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = src.split('/').pop() || 'photo';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const openOriginal = () => window.open(src, '_blank');

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.94)' }}
      onMouseMove={onMouseMove}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-2 rounded-full"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
        <span className="text-white/50 text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
        <div className="w-px h-4 bg-white/20" />
        <button onClick={() => setZoom(z => Math.min(z + 0.3, 5))}
          title="Zoom in (+)"
          className="w-8 h-8 rounded-full hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center transition-all">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
        <button onClick={() => { setZoom(z => Math.max(z - 0.3, 0.3)); }}
          title="Zoom out (-)"
          className="w-8 h-8 rounded-full hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center transition-all">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 13H5v-2h14v2z"/></svg>
        </button>
        <button onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }); }}
          title="Reset zoom (0)"
          className="w-8 h-8 rounded-full hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center transition-all text-xs font-bold">
          1:1
        </button>
        <div className="w-px h-4 bg-white/20" />
        <button onClick={download}
          title="Download"
          className="w-8 h-8 rounded-full hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center transition-all">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        </button>
        <button onClick={openOriginal}
          title="Open in new tab"
          className="w-8 h-8 rounded-full hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center transition-all">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
        </button>
        <div className="w-px h-4 bg-white/20" />
        <button onClick={onClose}
          title="Close (Esc)"
          className="w-8 h-8 rounded-full hover:bg-white/15 text-white/80 hover:text-white flex items-center justify-center transition-all">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>

      {/* Image */}
      <div
        className="relative z-10 select-none"
        style={{
          transform: `scale(${zoom}) translate(${pos.x}px, ${pos.y}px)`,
          transition: dragging ? 'none' : 'transform 0.12s ease',
          cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
      >
        <img
          src={src}
          alt={alt || 'Photo'}
          className="max-w-[88vw] max-h-[88vh] object-contain rounded-xl shadow-2xl"
          draggable={false}
        />
      </div>

      {/* Hint */}
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/25 text-[11px] select-none pointer-events-none">
        Double-click to zoom · Scroll to zoom · Drag to pan · Esc to close
      </p>
    </div>
  );
}
