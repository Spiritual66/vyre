import { useState, useRef, useEffect } from 'react';

interface Props {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
  onError?: (msg: string) => void;
}

const BAR_COUNT = 48;
const MAX_SEC = 600;

function getBestMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export default function VoiceRecorder({ onSend, onCancel, onError }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0.04));

  const mediaRef   = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<BlobPart[]>([]);
  const timerRef   = useRef<ReturnType<typeof setInterval>>();
  const animRef    = useRef<number>();
  const ctxRef     = useRef<AudioContext | null>(null);
  const startRef   = useRef(Date.now());
  const historyRef = useRef<number[]>(Array(BAR_COUNT).fill(0.04));
  const sentRef    = useRef(false); // guard against double-send

  useEffect(() => {
    // Pause every AudioPlayer so mic doesn't pick up speaker output (echo)
    window.dispatchEvent(new CustomEvent('vyre:recording-start'));

    let stream: MediaStream;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          onError?.('Voice messages need a secure connection — open the app over HTTPS or http://localhost.');
          onCancel();
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            // Do NOT constrain sampleRate — let the browser pick the native
            // rate; forcing 48 kHz can break AEC on some OS/driver combos.
          },
        });

        // Use the stream's native sample rate so AEC reference stays aligned
        const nativeRate = stream.getAudioTracks()[0]
          .getSettings().sampleRate ?? 48000;

        const ctx = new AudioContext({ sampleRate: nativeRate });
        ctxRef.current = ctx;

        const source   = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        // analyser is intentionally NOT connected to ctx.destination
        // — routing it there would create an audio feedback loop.
        source.connect(analyser);

        const mimeType = getBestMimeType();
        const recOpts: MediaRecorderOptions = { audioBitsPerSecond: 64000 };
        if (mimeType) recOpts.mimeType = mimeType;

        const mr = new MediaRecorder(stream, recOpts);
        mediaRef.current = mr;
        chunksRef.current = [];
        mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.start(200); // 200 ms timeslices

        startRef.current = Date.now();
        timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);

        // Waveform: RMS amplitude across voice frequency range (~85–3500 Hz)
        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          analyser.getByteFrequencyData(freqData);
          // bin width ≈ nativeRate / fftSize Hz; voice bins ≈ 1–18
          const voiceBins = freqData.slice(1, 19);
          let sum = 0;
          for (let i = 0; i < voiceBins.length; i++) sum += (voiceBins[i] / 255) ** 2;
          const rms    = Math.sqrt(sum / voiceBins.length);
          const height = Math.max(0.04, Math.min(1, rms * 3.5));
          historyRef.current = [...historyRef.current.slice(1), height];
          setBars([...historyRef.current]);
          animRef.current = requestAnimationFrame(draw);
        };
        draw();
      } catch (err: any) {
        const name = err?.name;
        const msg =
          (name === 'NotAllowedError' || name === 'PermissionDeniedError')
            ? 'Microphone access denied. Please allow it in your browser settings.'
          : (name === 'NotFoundError' || name === 'DevicesNotFoundError')
            ? 'No microphone was found on this device.'
          : (name === 'NotReadableError' || name === 'TrackStartError')
            ? 'Your microphone is already in use by another app or tab.'
          : 'Could not access microphone. Check your device settings.';
        onError?.(msg);
        onCancel();
      }
    };

    start();

    return () => {
      clearInterval(timerRef.current);
      cancelAnimationFrame(animRef.current!);
      if (ctxRef.current) {
        try { ctxRef.current.close(); } catch {}
        ctxRef.current = null;
      }
      if (stream) stream.getTracks().forEach(t => t.stop());
      window.dispatchEvent(new CustomEvent('vyre:recording-end'));
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doSend = () => {
    if (sentRef.current) return;
    sentRef.current = true;
    clearInterval(timerRef.current);
    cancelAnimationFrame(animRef.current!);
    const duration = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
    const mr = mediaRef.current;
    if (!mr || mr.state === 'inactive') return;
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      onSend(blob, duration);
    };
    mr.stop();
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const nearLimit = seconds >= MAX_SEC - 10;

  // Auto-send at the 10-minute cap
  useEffect(() => {
    if (seconds >= MAX_SEC) doSend();
  }, [seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 flex-1">
      {/* Cancel */}
      <button
        onClick={onCancel}
        className="p-2 rounded-full transition-opacity hover:opacity-70 shrink-0"
        style={{ color: '#ef4444' }}
        title="Cancel recording"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>

      {/* Recording indicator + timer */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="w-2 h-2 rounded-full animate-pulse shrink-0"
          style={{ background: nearLimit ? '#f59e0b' : '#ef4444' }}
        />
        <span
          className="text-[13px] font-mono tabular-nums"
          style={{ color: nearLimit ? '#f59e0b' : 'var(--text-secondary)', minWidth: 34 }}
        >
          {fmt(seconds)}
        </span>
      </div>

      {/* Live waveform */}
      <div className="flex items-center gap-[2px] flex-1 h-9 overflow-hidden">
        {bars.map((h, i) => (
          <div
            key={i}
            className="rounded-full shrink-0"
            style={{
              width: 2.5,
              height: `${Math.max(3, Math.round(h * 36))}px`,
              background: `rgba(37,211,102,${Math.max(0.35, h)})`,
              transition: 'height 80ms ease-out',
            }}
          />
        ))}
      </div>

      {/* Send */}
      <button
        onClick={doSend}
        className="w-11 h-11 rounded-full flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity shrink-0"
        style={{ background: 'var(--accent)' }}
        title="Send voice message"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
          <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
        </svg>
      </button>
    </div>
  );
}
