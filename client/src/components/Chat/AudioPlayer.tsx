import { useState, useRef, useEffect, useCallback } from 'react';

const BARS = 50;

interface Props {
  src: string;
  isOwn?: boolean;
  knownDuration?: number;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

function fmtTime(s: number) {
  if (!s || !isFinite(s) || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function placeholderWave(): number[] {
  return Array.from({ length: BARS }, (_, i) =>
    Math.max(0.08, 0.3 + Math.sin(i * 0.55) * 0.18 + Math.sin(i * 1.3) * 0.1)
  );
}

export default function AudioPlayer({ src, isOwn, knownDuration }: Props) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [rate, setRate] = useState(1);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [waveform, setWaveform] = useState<number[]>(placeholderWave);

  // Web Audio API refs
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  // Timing refs — no state so updates don't trigger re-renders
  const startedAtRef = useRef(0);   // audioCtx.currentTime when current play started
  const pausedAtRef = useRef(0);    // seconds into track where we paused
  const rateRef = useRef(1);
  const playingRef = useRef(false);
  const animRef = useRef<number>();
  const mountedRef = useRef(true);
  const durationRef = useRef(knownDuration ?? 0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Keep durationRef in sync so the recording-start handler has a fresh value
  useEffect(() => { durationRef.current = duration; }, [duration]);

  const stopSource = useCallback(() => {
    cancelAnimationFrame(animRef.current!);
    playingRef.current = false;
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
  }, []);

  // Reset everything when src changes
  useEffect(() => {
    stopSource();
    if (!mountedRef.current) return;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(knownDuration ?? 0);
    setLoadState('idle');
    setRate(1);
    rateRef.current = 1;
    pausedAtRef.current = 0;
    bufferRef.current = null;
    setWaveform(placeholderWave());
  }, [src, knownDuration, stopSource]);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      stopSource();
      if (ctxRef.current) {
        try { ctxRef.current.close(); } catch {}
        ctxRef.current = null;
      }
    };
  }, [stopSource]);

  // Pause immediately when voice recording starts so mic can't pick up speaker output
  useEffect(() => {
    const pause = () => {
      if (!playingRef.current) return;
      const ctx = ctxRef.current;
      if (ctx) {
        const elapsed = (ctx.currentTime - startedAtRef.current) * rateRef.current;
        pausedAtRef.current = Math.min(pausedAtRef.current + elapsed, durationRef.current);
      }
      stopSource();
      if (mountedRef.current) setPlaying(false);
    };
    window.addEventListener('vyre:recording-start', pause);
    return () => window.removeEventListener('vyre:recording-start', pause);
  }, [stopSource]);

  const getCtx = (): AudioContext => {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  };

  // Fetch + decode audio → real waveform + accurate duration
  const loadAudio = async (): Promise<AudioBuffer | null> => {
    if (bufferRef.current) return bufferRef.current;
    if (!mountedRef.current) return null;
    setLoadState('loading');
    try {
      const ctx = getCtx();
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuf);

      if (!mountedRef.current) return buffer;
      bufferRef.current = buffer;
      setDuration(buffer.duration);

      // Extract real peak-amplitude waveform from first channel
      const ch = buffer.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(ch.length / BARS));
      const peaks = Array.from({ length: BARS }, (_, i) => {
        const start = i * blockSize;
        let peak = 0;
        for (let j = 0; j < blockSize; j++) {
          const abs = Math.abs(ch[start + j] ?? 0);
          if (abs > peak) peak = abs;
        }
        return peak;
      });
      const maxPeak = Math.max(...peaks, 0.001);
      setWaveform(peaks.map(v => Math.max(0.06, v / maxPeak)));
      setLoadState('ready');
      return buffer;
    } catch {
      if (mountedRef.current) setLoadState('error');
      return null;
    }
  };

  // Start playback from a given offset with a given rate
  const startFrom = useCallback((buffer: AudioBuffer, from: number, playbackRate: number) => {
    const ctx = getCtx();
    stopSource();

    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(ctx.destination);
    gainRef.current = gain;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.connect(gain);
    sourceRef.current = source;

    const safeFrom = Math.max(0, Math.min(from, buffer.duration - 0.01));
    startedAtRef.current = ctx.currentTime;
    pausedAtRef.current = safeFrom;
    playingRef.current = true;
    source.start(0, safeFrom);

    // Natural end handler
    source.onended = () => {
      if (!playingRef.current) return; // manually stopped — ignore
      cancelAnimationFrame(animRef.current!);
      playingRef.current = false;
      pausedAtRef.current = 0;
      if (mountedRef.current) {
        setPlaying(false);
        setCurrentTime(0);
      }
    };

    // rAF-based progress update
    const tick = () => {
      if (!playingRef.current || !ctxRef.current) return;
      const elapsed = (ctxRef.current.currentTime - startedAtRef.current) * playbackRate;
      const t = Math.min(safeFrom + elapsed, buffer.duration);
      if (mountedRef.current) setCurrentTime(t);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
  }, [stopSource]);

  const toggle = async () => {
    if (playing) {
      // Pause: capture current position
      const ctx = ctxRef.current;
      if (ctx) {
        const elapsed = (ctx.currentTime - startedAtRef.current) * rateRef.current;
        pausedAtRef.current = Math.min(pausedAtRef.current + elapsed, duration);
      }
      stopSource();
      setPlaying(false);
    } else {
      const buffer = await loadAudio();
      if (!buffer || !mountedRef.current) return;
      setPlaying(true);
      startFrom(buffer, pausedAtRef.current, rateRef.current);
    }
  };

  const seek = async (e: React.MouseEvent<HTMLDivElement>) => {
    const d = duration || bufferRef.current?.duration || 0;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newPos = ratio * d;
    pausedAtRef.current = newPos;
    setCurrentTime(newPos);
    if (playing && bufferRef.current) {
      startFrom(bufferRef.current, newPos, rateRef.current);
    }
  };

  const cycleRate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const rates = [1, 1.5, 2];
    const next = rates[(rates.indexOf(rate) + 1) % rates.length];
    setRate(next);
    rateRef.current = next;
    if (playing && bufferRef.current) {
      // Capture current position before restarting
      const ctx = ctxRef.current;
      if (ctx) {
        const elapsed = (ctx.currentTime - startedAtRef.current) * rate;
        pausedAtRef.current = Math.min(pausedAtRef.current + elapsed, duration);
      }
      startFrom(bufferRef.current, pausedAtRef.current, next);
    }
  };

  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const activeUpTo = Math.round(progress * (BARS - 1));

  const activeColor = isOwn ? 'rgba(0,0,0,0.5)' : 'var(--icon)';
  const inactiveColor = isOwn ? 'rgba(0,0,0,0.17)' : 'var(--separator)';
  const textColor = isOwn ? 'rgba(0,0,0,0.42)' : 'var(--text-tertiary)';
  const pulseColor = isOwn ? 'rgba(0,0,0,0.65)' : 'var(--accent)';

  return (
    <div className="flex items-center gap-2.5 py-1" style={{ minWidth: 220, maxWidth: 280 }}>
      {/* Play / Pause */}
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center transition-opacity hover:opacity-75"
        style={{ background: isOwn ? 'rgba(0,0,0,0.14)' : 'var(--hover)' }}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {loadState === 'loading' ? (
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" style={{ color: activeColor }}>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : loadState === 'error' ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: '#ef4444' }}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
        ) : playing ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" style={{ color: activeColor }}>
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" style={{ color: activeColor }}>
            <path d="M8 5v14l11-7z"/>
          </svg>
        )}
      </button>

      {/* Waveform + time row */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* Waveform bars — click to seek */}
        <div
          className="flex items-end gap-[1.5px] h-8 cursor-pointer select-none"
          onClick={seek}
          title="Click to seek"
        >
          {waveform.map((h, i) => {
            const isActive = i <= activeUpTo;
            const isPulse = playing && i === activeUpTo;
            return (
              <div
                key={i}
                className={isPulse ? 'audio-bar-pulse' : ''}
                style={{
                  flex: 1,
                  height: `${Math.max(h * 100, 6)}%`,
                  borderRadius: 2,
                  background: isPulse ? pulseColor : isActive ? activeColor : inactiveColor,
                  transition: 'background 0.08s',
                  transformOrigin: 'bottom',
                }}
              />
            );
          })}
        </div>

        {/* Time + controls row */}
        <div className="flex justify-between items-center" style={{ color: textColor, fontSize: 10 }}>
          <span className="tabular-nums">{fmtTime(currentTime)}</span>

          <div className="flex items-center gap-1">
            {/* Playback speed */}
            <button
              onClick={cycleRate}
              className="font-bold px-1.5 py-0.5 rounded hover:opacity-70 transition-opacity"
              style={{ background: isOwn ? 'rgba(0,0,0,0.09)' : 'var(--hover)', fontSize: 9 }}
              title="Change playback speed"
            >
              {rate}×
            </button>
            {/* Download */}
            <a
              href={src}
              download
              onClick={e => e.stopPropagation()}
              title="Download voice message"
              className="flex items-center justify-center w-5 h-5 rounded hover:opacity-70 transition-opacity"
              style={{ color: textColor }}
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
              </svg>
            </a>
          </div>

          <span className="tabular-nums">{fmtTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
