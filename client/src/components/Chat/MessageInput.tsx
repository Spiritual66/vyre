import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
const EmojiPicker = lazy(() => import('./EmojiPicker'));
import { Message } from '../../types';
import api from '../../api/axios';
import VoiceRecorder from './VoiceRecorder';
import LocationPicker from './LocationPicker';
import StickerPicker from './StickerPicker';
import WritingTools from './WritingTools';
import PollCreator from './PollCreator';

interface ContactSearchResult {
  id: string;
  username: string;
  about: string | null;
  avatar: string | null;
}

interface Props {
  chatId: string;
  onSend: (content: string, type?: string, fileUrl?: string, replyTo?: string, fileName?: string, fileSize?: number) => void;
  onTyping: (typing: boolean) => void;
  replyTo?: Message | null;
  onCancelReply?: () => void;
  disabled?: boolean;
}

const DRAFT_KEY = (chatId: string) => `draft:${chatId}`;

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function MessageInput({ chatId, onSend, onTyping, replyTo, onCancelReply, disabled }: Props) {
  const [text, setText] = useState(() => sessionStorage.getItem(DRAFT_KEY(chatId)) || '');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recording, setRecording] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string; caption: string } | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [showWritingTools, setShowWritingTools] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactSearchResult[]>([]);
  const [contactLoading, setContactLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);     // documents / all files
  const imageRef = useRef<HTMLInputElement>(null);    // photos & videos
  const dropRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isTypingRef = useRef(false);
  const contactSearchRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ─── Text / draft ─────────────────────────────────────────
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (val) sessionStorage.setItem(DRAFT_KEY(chatId), val);
    else sessionStorage.removeItem(DRAFT_KEY(chatId));
    if (!isTypingRef.current) { isTypingRef.current = true; onTyping(true); }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => { isTypingRef.current = false; onTyping(false); }, 1500);
    // Auto-height
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 128) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && localStorage.getItem('enterToSend') !== 'false') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, 'text', undefined, replyTo?.id);
    setText('');
    sessionStorage.removeItem(DRAFT_KEY(chatId));
    isTypingRef.current = false;
    onTyping(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    onCancelReply?.();
  }, [text, onSend, onTyping, replyTo, onCancelReply, chatId]);

  // ─── File upload ───────────────────────────────────────────
  const uploadFile = useCallback(async (file: File, caption?: string) => {
    setUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data: res } = await api.post('/messages/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: p => setUploadProgress(Math.round((p.loaded * 100) / (p.total || 1))),
      });
      onSend(caption || file.name, res.type, res.url, replyTo?.id, file.name, file.size);
      onCancelReply?.();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Upload failed. Please try again.';
      setUploadError(msg);
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [onSend, replyTo, onCancelReply]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (files.length === 1 && files[0].type.startsWith('image/')) {
      setImagePreview({ file: files[0], url: URL.createObjectURL(files[0]), caption: '' });
      e.target.value = '';
      return;
    }
    for (const file of files) await uploadFile(file);
    e.target.value = '';
  };

  const sendImagePreview = async () => {
    if (!imagePreview) return;
    URL.revokeObjectURL(imagePreview.url);
    const { file, caption } = imagePreview;
    setImagePreview(null);
    await uploadFile(file, caption || file.name);
  };

  // ─── Voice ────────────────────────────────────────────────
  const handleVoiceSend = async (blob: Blob, duration: number) => {
    setRecording(false);
    setUploading(true);
    setUploadProgress(0);
    try {
      const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
      const formData = new FormData();
      formData.append('file', blob, `voice-message.${ext}`);
      const { data: res } = await api.post('/messages/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: p => setUploadProgress(Math.round((p.loaded * 100) / (p.total || 1))),
      });
      onSend(String(duration), 'audio', res.url, replyTo?.id);
      onCancelReply?.();
    } catch (err: any) {
      setUploadError(err?.response?.data?.error || 'Voice upload failed.');
      setTimeout(() => setUploadError(''), 4000);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ─── Location ─────────────────────────────────────────────
  const handleLocationConfirm = useCallback((loc: { lat: number; lng: number; address: string; label: string }) => {
    onSend(JSON.stringify(loc), 'location', undefined, replyTo?.id);
    onCancelReply?.();
    setShowLocationPicker(false);
  }, [onSend, replyTo, onCancelReply]);

  // ─── Sticker ──────────────────────────────────────────────
  const handleStickerSelect = (emoji: string) => {
    onSend(emoji, 'sticker', undefined, replyTo?.id);
    onCancelReply?.();
    setShowStickerPicker(false);
  };

  const handleCreatePoll = (poll: { question: string; options: string[] }) => {
    onSend(JSON.stringify(poll), 'poll', undefined, replyTo?.id);
    onCancelReply?.();
    setShowPollCreator(false);
  };

  // ─── Writing tools apply ───────────────────────────────────
  const handleWritingToolsApply = (result: string) => {
    setText(result);
    sessionStorage.setItem(DRAFT_KEY(chatId), result);
    setShowWritingTools(false);
    setTimeout(() => {
      inputRef.current?.focus();
      const el = inputRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 128) + 'px';
      }
    }, 0);
  };

  // ─── Contact picker ────────────────────────────────────────
  const searchContacts = (q: string) => {
    clearTimeout(contactSearchRef.current);
    setContactSearch(q);
    setContactLoading(true);
    contactSearchRef.current = setTimeout(async () => {
      try {
        const { data: res } = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        setContactResults(res.slice(0, 20));
      } catch { setContactResults([]); }
      finally { setContactLoading(false); }
    }, q ? 300 : 0);
  };

  const openContactPicker = () => {
    setContactSearch('');
    setContactResults([]);
    setShowContactPicker(true);
    setContactLoading(true);
    api.get('/users/search?q=').then(r => setContactResults(r.data.slice(0, 20))).catch(() => {}).finally(() => setContactLoading(false));
  };

  const sendContact = (c: ContactSearchResult) => {
    onSend(JSON.stringify({ id: c.id, name: c.username, about: c.about || '', avatar: c.avatar }), 'contact', undefined, replyTo?.id);
    onCancelReply?.();
    setShowContactPicker(false);
  };

  // ─── Emoji ────────────────────────────────────────────────
  const addEmoji = (emoji: { native: string }) => {
    const pos = inputRef.current?.selectionStart ?? text.length;
    const next = text.slice(0, pos) + emoji.native + text.slice(pos);
    setText(next);
    if (next) sessionStorage.setItem(DRAFT_KEY(chatId), next);
    setShowEmoji(false);
    setTimeout(() => { inputRef.current?.focus(); }, 0);
  };

  // ─── Clipboard paste ──────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) setImagePreview({ file, url: URL.createObjectURL(file), caption: '' });
    }
  }, []);

  // ─── Drag & drop ──────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) setDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (dropRef.current?.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length || disabled || uploading) return;
    if (files.length === 1 && files[0].type.startsWith('image/')) {
      setImagePreview({ file: files[0], url: URL.createObjectURL(files[0]), caption: '' });
      return;
    }
    for (const file of files) await uploadFile(file);
  }, [disabled, uploading, uploadFile]);

  useEffect(() => { inputRef.current?.focus(); }, [replyTo]);

  // Attach menu options
  const attachOptions = [
    {
      label: 'Document',
      color: '#5157AE',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
        </svg>
      ),
      action: () => { fileRef.current?.click(); setShowAttachMenu(false); },
    },
    {
      label: 'Photos & Videos',
      color: '#D3396D',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
        </svg>
      ),
      action: () => { imageRef.current?.click(); setShowAttachMenu(false); },
    },
    {
      label: 'Location',
      color: '#00B5A1',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      ),
      action: () => { setShowLocationPicker(true); setShowAttachMenu(false); },
    },
    {
      label: 'Contact',
      color: '#0095D6',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      ),
      action: () => { openContactPicker(); setShowAttachMenu(false); },
    },
    {
      label: 'Poll',
      color: '#8b5cf6',
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M5 9h3v10H5zm5.5-5h3v15h-3zM16 13h3v6h-3z"/>
        </svg>
      ),
      action: () => { setShowPollCreator(true); setShowAttachMenu(false); },
    },
  ];

  const hasText = text.trim().length > 0;

  return (
    <>
      {/* ── Modals ─────────────────────────────────────────── */}
      {showPollCreator && (
        <PollCreator onCreate={handleCreatePoll} onClose={() => setShowPollCreator(false)} />
      )}
      {showLocationPicker && (
        <LocationPicker onConfirm={handleLocationConfirm} onClose={() => setShowLocationPicker(false)} />
      )}

      {/* Contact picker */}
      {showContactPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--modal-overlay)' }}
          onClick={() => setShowContactPicker(false)}>
          <div className="w-80 max-h-[70vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden fade-in"
            style={{ background: 'var(--panel)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: 'var(--separator)', background: 'var(--header)' }}>
              <button onClick={() => setShowContactPicker(false)} style={{ color: 'var(--icon)' }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
              </button>
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Share Contact</span>
            </div>
            <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--separator)' }}>
              <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'var(--input-bg)' }}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0" style={{ color: 'var(--icon)' }}>
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
                <input autoFocus value={contactSearch} onChange={e => searchContacts(e.target.value)}
                  placeholder="Search contacts…"
                  className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--text-primary)' }} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {contactLoading ? (
                <div className="flex justify-center py-8">
                  <svg className="animate-spin w-6 h-6" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              ) : contactResults.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text-tertiary)' }}>
                  {contactSearch ? 'No contacts found' : 'No contacts yet'}
                </p>
              ) : contactResults.map(c => (
                <button key={c.id} onClick={() => sendContact(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:opacity-80 transition-opacity border-b"
                  style={{ borderColor: 'var(--separator)' }}>
                  {c.avatar
                    ? <img src={c.avatar} alt={c.username} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white text-sm shrink-0"
                        style={{ background: ['#128c7e','#25d366','#34b7f1','#8e44ad','#e74c3c','#f39c12'][c.id.charCodeAt(0) % 6] }}>
                        {c.username.charAt(0).toUpperCase()}
                      </div>}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{c.username}</p>
                    {c.about && <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{c.about}</p>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Image preview modal */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#000' }}>
          {/* Top bar */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <button onClick={() => { URL.revokeObjectURL(imagePreview.url); setImagePreview(null); }}
              className="p-1.5 rounded-full hover:opacity-70 transition-opacity" style={{ color: 'white' }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-white">{imagePreview.file.name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{formatBytes(imagePreview.file.size)}</p>
            </div>
          </div>

          {/* Image area */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
            <img src={imagePreview.url} alt="preview"
              className="max-h-full max-w-full rounded-lg object-contain"
              style={{ boxShadow: '0 4px 32px rgba(0,0,0,0.8)' }} />
          </div>

          {/* Bottom bar: caption + send */}
          <div className="shrink-0 px-4 pb-6 pt-3" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="flex items-center gap-3 max-w-2xl mx-auto">
              <div className="flex-1 flex items-center rounded-full px-4 py-2.5"
                style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0 mr-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                </svg>
                <input
                  className="flex-1 text-sm bg-transparent outline-none"
                  style={{ color: 'white' }}
                  placeholder="Add a caption…"
                  value={imagePreview.caption}
                  onChange={e => setImagePreview(p => p ? { ...p, caption: e.target.value } : p)}
                  onKeyDown={e => { if (e.key === 'Enter') sendImagePreview(); }}
                  autoFocus
                />
              </div>
              <button onClick={sendImagePreview}
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
                style={{ background: 'var(--accent)' }}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden file inputs ─────────────────────────────── */}
      <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileInput}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,audio/*,video/*" />
      <input ref={imageRef} type="file" multiple className="hidden" onChange={handleFileInput}
        accept="image/*,video/*" />

      {/* ── Input bar ─────────────────────────────────────── */}
      <div
        ref={dropRef}
        className="relative border-t"
        style={{ background: 'var(--panel)', borderColor: 'var(--separator)' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag-over overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none rounded-lg"
            style={{ background: 'rgba(0,168,132,0.1)', border: '2px dashed var(--accent)' }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8 mb-1" style={{ fill: 'var(--accent)' }}>
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
            <span className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Drop to send</span>
          </div>
        )}

        {/* Reply preview */}
        {replyTo && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg overflow-hidden border-l-4"
            style={{ background: 'var(--hover)', borderColor: 'var(--accent)' }}>
            <div className="flex-1 min-w-0 px-3 py-2">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--accent)' }}>
                {replyTo.sender_name}
              </p>
              <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {replyTo.type === 'image' ? '📷 Photo' :
                 replyTo.type === 'video' ? '🎥 Video' :
                 replyTo.type === 'audio' ? '🎵 Voice message' :
                 replyTo.type === 'file' ? `📎 ${replyTo.file_name}` :
                 replyTo.type === 'location' ? '📍 Location' :
                 replyTo.type === 'contact'
                   ? (() => { try { return `👤 ${JSON.parse(replyTo.content || '{}').name}`; } catch { return '👤 Contact'; } })()
                   : replyTo.type === 'sticker' ? '🎭 Sticker'
                   : replyTo.content}
              </p>
            </div>
            {replyTo.type === 'image' && replyTo.file_url && (
              <img src={replyTo.file_url} alt="" className="w-12 h-12 object-cover shrink-0" />
            )}
            <button onClick={onCancelReply} className="p-2 shrink-0 hover:opacity-70 transition-opacity" style={{ color: 'var(--icon)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        )}

        {/* Upload error toast */}
        {uploadError && (
          <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            {uploadError}
          </div>
        )}

        {/* Upload progress bar */}
        {uploading && (
          <div className="mx-3 mt-2">
            <div className="h-0.5 rounded-full overflow-hidden" style={{ background: 'var(--separator)' }}>
              <div className="h-full transition-all duration-200"
                style={{ background: 'var(--accent)', width: uploadProgress ? `${uploadProgress}%` : '60%' }} />
            </div>
          </div>
        )}

        {/* ── Main input row ──────────────────────────────── */}
        <div className="flex items-end gap-2 px-2 py-2">
          {recording ? (
            /* Voice recorder — full width */
            <div className="flex-1">
              <VoiceRecorder onSend={handleVoiceSend} onCancel={() => setRecording(false)} onError={msg => { setUploadError(msg); setTimeout(() => setUploadError(''), 5000); }} />
            </div>
          ) : (
            <>
              {/* Emoji button */}
              <div className="relative shrink-0 self-end mb-1">
                <button
                  onClick={() => { setShowEmoji(s => !s); setShowStickerPicker(false); }}
                  disabled={disabled}
                  className="w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:opacity-70"
                  style={{ color: showEmoji ? 'var(--accent)' : 'var(--icon)' }}
                  title="Emoji"
                >
                  {showEmoji ? (
                    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                    </svg>
                  )}
                </button>
                {showEmoji && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEmoji(false)} />
                    <div className="absolute z-50 fade-in" style={{ bottom: '100%', left: 0, marginBottom: 8 }}>
                      <Suspense fallback={<div className="rounded-lg p-4 text-xs" style={{ background: 'var(--panel)', color: 'var(--text-tertiary)' }}>Loading emoji…</div>}>
                        <EmojiPicker onEmojiSelect={addEmoji} />
                      </Suspense>
                    </div>
                  </>
                )}
              </div>

              {/* Sticker button */}
              <div className="relative shrink-0 self-end mb-1">
                <button
                  onClick={() => { setShowStickerPicker(s => !s); setShowEmoji(false); setShowWritingTools(false); }}
                  disabled={disabled}
                  className="w-9 h-9 flex items-center justify-center rounded-full transition-colors hover:opacity-70"
                  style={{ color: showStickerPicker ? 'var(--accent)' : 'var(--icon)' }}
                  title="Stickers"
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>🎭</span>
                </button>
                {showStickerPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowStickerPicker(false)} />
                    <div className="absolute z-50" style={{ bottom: '100%', left: 0, marginBottom: 8, width: 320 }}>
                      <StickerPicker
                        onSelect={handleStickerSelect}
                        onClose={() => setShowStickerPicker(false)}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Input + attach container */}
              <div className="flex-1 relative flex flex-col">
                {/* Writing Tools panel */}
                {showWritingTools && text.trim() && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowWritingTools(false)} />
                    <WritingTools
                      text={text.trim()}
                      onApply={handleWritingToolsApply}
                      onClose={() => setShowWritingTools(false)}
                    />
                  </>
                )}

                {/* Attach popup — above the input */}
                {showAttachMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                    <div className="absolute z-50 right-0 fade-in"
                      style={{ bottom: 'calc(100% + 8px)' }}>
                      <div className="flex flex-col items-end gap-2.5 pb-1">
                        {[...attachOptions].reverse().map((opt, i) => (
                          <div key={i} className="flex items-center gap-2.5">
                            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap"
                              style={{ background: 'var(--panel)', color: 'var(--text-secondary)', border: '1px solid var(--separator)' }}>
                              {opt.label}
                            </span>
                            <button
                              onClick={opt.action}
                              className="w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
                              style={{ background: opt.color }}
                            >
                              {opt.icon}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Text input row */}
                <div className="flex items-end rounded-[24px] px-4 py-2.5 gap-2"
                  style={{ background: 'var(--input-field)', border: '1px solid var(--separator)', minHeight: 48 }}>
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Message"
                    disabled={disabled}
                    rows={1}
                    spellCheck={localStorage.getItem('spellCheck') !== 'false'}
                    className="flex-1 resize-none text-sm bg-transparent leading-[1.4] outline-none self-center"
                    style={{ color: 'var(--text-primary)', maxHeight: 128, overflowY: 'auto' }}
                  />
                  {/* Writing Tools sparkle — shows when text present */}
                  {hasText && (
                    <button
                      onClick={() => { setShowWritingTools(s => !s); setShowAttachMenu(false); }}
                      disabled={disabled}
                      className="shrink-0 self-end mb-0.5 w-7 h-7 flex items-center justify-center rounded-full transition-all hover:opacity-70"
                      style={{ color: showWritingTools ? 'var(--accent)' : 'var(--icon)' }}
                      title="Writing Tools"
                    >
                      <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-current" style={{ width: 18, height: 18 }}>
                        <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/>
                      </svg>
                    </button>
                  )}

                  {/* Attach / clip button — inside input, right */}
                  <button
                    onClick={() => { setShowAttachMenu(s => !s); setShowWritingTools(false); }}
                    disabled={disabled}
                    className="shrink-0 self-end mb-0.5 w-7 h-7 flex items-center justify-center rounded-full transition-all hover:opacity-70"
                    style={{ color: showAttachMenu ? 'var(--accent)' : 'var(--icon)' }}
                    title="Attach"
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"
                      style={{ transform: showAttachMenu ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Send / Mic button */}
              {hasText ? (
                <button
                  key="send"
                  onClick={handleSend}
                  disabled={disabled}
                  className="shrink-0 self-end w-11 h-11 rounded-full flex items-center justify-center shadow-sm transition-all hover:scale-105 active:scale-95 send-btn-pop"
                  style={{ background: 'var(--accent)' }}
                  title="Send"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              ) : (
                <button
                  key="mic"
                  onClick={() => setRecording(true)}
                  disabled={disabled || uploading}
                  className="shrink-0 self-end w-11 h-11 rounded-full flex items-center justify-center shadow-sm transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'var(--accent)' }}
                  title="Record voice message"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                    <path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
