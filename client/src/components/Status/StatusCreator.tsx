import { useState, useRef } from 'react';
import api from '../../api/axios';

const SOLID_COLORS = [
  '#075e54','#128c7e','#25d366','#1a1a2e',
  '#16213e','#0f3460','#e94560','#f5a623',
  '#7b2d8b','#2c3e50','#c0392b','#e67e22',
];
const GRADIENTS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#30cfd0,#330867)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#ffecd2,#fcb69f)',
];
const FONTS = [
  { label: 'Sans', value: 'ui-sans-serif, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, monospace' },
  { label: 'Cursive', value: 'cursive' },
];

interface Props { onClose: () => void; }

export default function StatusCreator({ onClose }: Props) {
  const [tab, setTab] = useState<'text' | 'media'>('text');
  const [text, setText] = useState('');
  const [bg, setBg] = useState<string>(SOLID_COLORS[0]);
  const [isGradient, setIsGradient] = useState(false);
  const [fontSize, setFontSize] = useState(28);
  const [fontFamily, setFontFamily] = useState(FONTS[0].value);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);
  const [bgTab, setBgTab] = useState<'color' | 'gradient'>('color');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setTab('media');
  };

  const handlePost = async () => {
    if (tab === 'text' && !text.trim()) return;
    if (tab === 'media' && !file) return;
    setPosting(true);
    try {
      const formData = new FormData();
      if (tab === 'text') {
        formData.append('content', text);
        formData.append('type', 'text');
        formData.append('background', bg);
        formData.append('font_size', String(fontSize));
        formData.append('font_family', fontFamily);
        formData.append('align', align);
      } else if (file) {
        formData.append('file', file);
        if (caption.trim()) formData.append('caption', caption.trim());
      }
      await api.post('/statuses', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onClose();
    } finally {
      setPosting(false);
    }
  };

  const bgStyle = isGradient
    ? { backgroundImage: bg }
    : { backgroundColor: bg };

  return (
    <div className="fixed inset-0 z-[150] flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }}>

      {/* Full-screen preview */}
      <div className="flex-1 relative flex items-center justify-center"
        style={tab === 'text' ? bgStyle : { background: '#111' }}>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-4 z-10"
          style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.5),transparent)' }}>
          <button onClick={onClose} className="text-white p-2 rounded-full hover:bg-white/15">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
          <div className="flex items-center gap-2">
            {tab === 'text' && (
              <>
                {/* Alignment */}
                <button onClick={() => setAlign(a => a === 'left' ? 'center' : a === 'center' ? 'right' : 'left')}
                  className="text-white p-2 rounded-full hover:bg-white/15" title="Text alignment">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                    {align === 'left' && <path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/>}
                    {align === 'center' && <path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/>}
                    {align === 'right' && <path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/>}
                  </svg>
                </button>
                {/* Font family */}
                <div className="flex items-center gap-0.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  {FONTS.map(f => (
                    <button key={f.value} onClick={() => setFontFamily(f.value)}
                      className="px-2.5 py-1.5 text-xs transition-colors"
                      style={{
                        fontFamily: f.value,
                        color: fontFamily === f.value ? '#fff' : 'rgba(255,255,255,0.6)',
                        background: fontFamily === f.value ? 'rgba(255,255,255,0.2)' : 'transparent',
                      }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        {tab === 'text' ? (
          <textarea
            placeholder="Type a status..."
            value={text}
            onChange={e => setText(e.target.value)}
            style={{
              fontSize,
              fontFamily,
              textAlign: align,
              color: 'white',
              background: 'transparent',
              resize: 'none',
              caretColor: 'white',
            }}
            className="w-full h-full max-h-[60vh] p-8 placeholder-white/40 outline-none leading-relaxed"
            maxLength={700}
          />
        ) : preview ? (
          <>
            {file?.type.startsWith('video/') ? (
              <video src={preview} className="max-h-[65vh] max-w-full object-contain rounded-xl" controls />
            ) : (
              <img src={preview} className="max-h-[65vh] max-w-full object-contain rounded-xl" alt="Preview" />
            )}
          </>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-3 text-white/60 hover:text-white/90 transition-colors">
            <svg viewBox="0 0 24 24" className="w-16 h-16 fill-current">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
            </svg>
            <span className="text-base font-medium">Tap to add photo or video</span>
          </button>
        )}

        {/* Character count */}
        {tab === 'text' && (
          <div className="absolute bottom-4 right-4 text-xs text-white/40">{700 - text.length}</div>
        )}
      </div>

      {/* Controls panel */}
      <div className="shrink-0 rounded-t-2xl overflow-hidden pb-safe" style={{ background: 'var(--panel)' }}>
        <div className="px-4 pt-4 pb-2 space-y-3">

          {/* Tab switcher */}
          <div className="flex gap-2">
            <button onClick={() => setTab('text')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${tab === 'text' ? 'bg-wa-green text-white' : ''}`}
              style={tab !== 'text' ? { background: 'var(--hover)', color: 'var(--text-secondary)' } : {}}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z"/></svg>
              Text
            </button>
            <button onClick={() => { setTab('media'); if (!file) fileRef.current?.click(); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${tab === 'media' ? 'bg-wa-green text-white' : ''}`}
              style={tab !== 'media' ? { background: 'var(--hover)', color: 'var(--text-secondary)' } : {}}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
              Photo/Video
            </button>
          </div>

          {/* Text controls */}
          {tab === 'text' && (
            <>
              {/* Background type tabs */}
              <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'var(--input-bg)' }}>
                <button onClick={() => setBgTab('color')}
                  className="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{ background: bgTab === 'color' ? 'var(--panel)' : 'transparent', color: bgTab === 'color' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  Colors
                </button>
                <button onClick={() => setBgTab('gradient')}
                  className="flex-1 py-1.5 rounded-md text-xs font-medium transition-colors"
                  style={{ background: bgTab === 'gradient' ? 'var(--panel)' : 'transparent', color: bgTab === 'gradient' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  Gradients
                </button>
              </div>

              {bgTab === 'color' ? (
                <div className="grid grid-cols-6 gap-2">
                  {SOLID_COLORS.map(c => (
                    <button key={c} onClick={() => { setBg(c); setIsGradient(false); }}
                      className="aspect-square rounded-lg transition-transform hover:scale-110"
                      style={{
                        background: c,
                        outline: !isGradient && bg === c ? '3px solid var(--text-primary)' : 'none',
                        outlineOffset: 2,
                      }} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {GRADIENTS.map(g => (
                    <button key={g} onClick={() => { setBg(g); setIsGradient(true); }}
                      className="h-10 rounded-lg transition-transform hover:scale-105"
                      style={{
                        backgroundImage: g,
                        outline: isGradient && bg === g ? '3px solid var(--text-primary)' : 'none',
                        outlineOffset: 2,
                      }} />
                  ))}
                </div>
              )}

              {/* Font size */}
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>A</span>
                <input type="range" min="16" max="48" value={fontSize}
                  onChange={e => setFontSize(Number(e.target.value))}
                  className="flex-1 accent-wa-green" />
                <span className="text-2xl font-semibold" style={{ color: 'var(--text-secondary)' }}>A</span>
              </div>
            </>
          )}

          {/* Caption for media */}
          {tab === 'media' && file && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--input-bg)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" style={{ color: 'var(--icon)' }}>
                <path d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z"/>
              </svg>
              <input
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Add a caption…"
                maxLength={200}
                className="flex-1 text-sm bg-transparent outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          )}

          {/* Post button */}
          <button onClick={handlePost}
            disabled={posting || (tab === 'text' && !text.trim()) || (tab === 'media' && !file)}
            className="w-full bg-wa-green hover:bg-wa-green-dark text-white py-3 rounded-2xl font-semibold transition-colors disabled:opacity-40">
            {posting ? 'Posting…' : '→ Post Status'}
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
