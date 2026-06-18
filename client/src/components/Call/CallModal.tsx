import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';

interface CallModalProps {
  callId: string;
  type: 'audio' | 'video';
  mode: 'outgoing' | 'incoming';
  remoteUser: { id: string; username: string; avatar: string | null };
  offer?: RTCSessionDescriptionInit;
  onClose: () => void;
  onAccepted?: () => void;
}

const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined;
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME as string | undefined;
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL as string | undefined;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...(TURN_URL ? [{ urls: TURN_URL, username: TURN_USERNAME, credential: TURN_CREDENTIAL }] : []),
  ],
  iceCandidatePoolSize: 10,
};

const isMobile = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// getUserMedia / mediaDevices only exist in a "secure context": HTTPS, or
// http://localhost / 127.0.0.1. On any other origin (e.g. a LAN IP like
// http://192.168.x.x:5173 opened from a phone) navigator.mediaDevices is
// undefined, so calls can never reach the camera/mic. Detect that up front.
const mediaDevicesAvailable = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === 'function';

// Translate a getUserMedia failure into a clear, actionable message.
function mediaErrorMessage(err: any): string {
  if (err?.__insecure || !mediaDevicesAvailable()) {
    return 'Camera & microphone need a secure connection. Open the app over HTTPS (or http://localhost), not a plain http:// IP address.';
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera/microphone access was blocked. Allow it in your browser’s site settings (the 🔒/camera icon in the address bar) and try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No camera or microphone was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your camera or microphone is already in use by another app or browser tab. Close it and try again.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'The selected camera/microphone is unavailable. Pick a different device.';
    case 'SecurityError':
      return 'Camera & microphone require a secure connection (HTTPS).';
    default:
      return 'Could not access camera/microphone.';
  }
}

type QualityLevel = 'excellent' | 'good' | 'poor' | 'unknown';

export default function CallModal({ callId, type, mode, remoteUser, offer, onClose, onAccepted }: CallModalProps) {
  const { socket } = useSocket();
  const [callType, setCallType] = useState<'audio' | 'video'>(type);
  const [status, setStatus] = useState<'ringing' | 'connecting' | 'connected' | 'ended' | 'error'>(
    mode === 'incoming' ? 'ringing' : 'connecting'
  );
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [remoteCameraOff, setRemoteCameraOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [duration, setDuration] = useState(0);
  const [quality, setQuality] = useState<QualityLevel>('unknown');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [pipPos, setPipPos] = useState({ x: 16, y: 80 });
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] });
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [selectedMic, setSelectedMic] = useState<string>('');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qualityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callIdRef = useRef<string>(callId);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const closingRef = useRef(false);
  const pendingCancelRef = useRef(false);   // end clicked before server ACK'd callId
  const noVideoTicksRef = useRef(0);        // consecutive quality ticks with no remote video bytes
  const lastVideoBytesRef = useRef(0);      // for detecting remote camera off
  const containerRef = useRef<HTMLDivElement>(null);
  const pipDrag = useRef({ dragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });
  const toggleScreenShareRef = useRef<(() => void) | null>(null);

  // ── helpers ──────────────────────────────────────────────────────
  const fmtDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
  };

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (status === 'connected' && callType === 'video') {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3500);
    }
  }, [status, callType]);

  // ── cleanup ──────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (qualityTimerRef.current) clearInterval(qualityTimerRef.current);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  }, []);

  const startQualityMonitor = useCallback(() => {
    noVideoTicksRef.current = 0;
    lastVideoBytesRef.current = 0;
    qualityTimerRef.current = setInterval(async () => {
      if (!pcRef.current) return;
      try {
        const stats = await pcRef.current.getStats();
        let packetsLost = 0, packetsSent = 0, jitter = 0, count = 0;
        stats.forEach(r => {
          if (r.type === 'outbound-rtp') { packetsLost += r.packetsLost || 0; packetsSent += r.packetsSent || 1; }
          if (r.type === 'inbound-rtp') { jitter += r.jitter || 0; count++; }
        });
        const lossRate = packetsLost / Math.max(packetsSent, 1);
        const avgJitter = count ? jitter / count : 0;
        setQuality(lossRate < 0.01 && avgJitter < 0.05 ? 'excellent' : lossRate < 0.05 ? 'good' : 'poor');

        // Detect remote camera off — require 2 consecutive ticks with no new video bytes
        // (avoids false positive at call start when bytes haven't accumulated yet)
        if (callType === 'video') {
          let totalVideoBytes = 0;
          stats.forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'video') totalVideoBytes += r.bytesReceived || 0; });
          if (totalVideoBytes > lastVideoBytesRef.current) {
            noVideoTicksRef.current = 0;
            lastVideoBytesRef.current = totalVideoBytes;
            setRemoteCameraOff(false);
          } else {
            noVideoTicksRef.current++;
            if (noVideoTicksRef.current >= 2) setRemoteCameraOff(true);
          }
        }
      } catch {}
    }, 3000);
  }, [callType]);

  // ── device enumeration ────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(list => {
      setDevices({
        cameras: list.filter(d => d.kind === 'videoinput'),
        mics: list.filter(d => d.kind === 'audioinput'),
      });
    }).catch(() => {});
  }, []);

  // ── setup PeerConnection ─────────────────────────────────────────
  const setupPC = useCallback(async (forceAudio = false): Promise<RTCPeerConnection> => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    const effectiveType = forceAudio ? 'audio' : callType;

    const audioConstraint: MediaTrackConstraints = {
      deviceId: selectedMic ? { exact: selectedMic } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const videoConstraint: MediaTrackConstraints = selectedCamera
      ? { deviceId: { exact: selectedCamera }, width: { ideal: 1280 }, height: { ideal: 720 } }
      : { width: { ideal: 1280 }, height: { ideal: 720 } };

    let stream: MediaStream;
    try {
      if (!mediaDevicesAvailable()) {
        const e: any = new Error('insecure context'); e.__insecure = true; throw e;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraint,
        video: effectiveType === 'video' ? videoConstraint : false,
      });
    } catch (err: any) {
      // For a video call, if the *camera* is the problem (missing/busy/over-constrained)
      // but the mic might still work, fall back to an audio-only call instead of failing.
      const cameraOnlyFailure = effectiveType === 'video' && !err?.__insecure &&
        ['NotFoundError', 'DevicesNotFoundError', 'NotReadableError', 'TrackStartError',
         'OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(err?.name);
      if (cameraOnlyFailure) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
          setCallType('audio');
        } catch (err2: any) {
          pc.close();
          throw new Error(mediaErrorMessage(err2));
        }
      } else {
        pc.close();
        throw new Error(mediaErrorMessage(err));
      }
    }

    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = e => {
      if (!e.streams[0]) return;
      if (effectiveType === 'video' && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
        // Mute the video element — audio routed exclusively through remoteAudioRef
        // so the speaker-toggle setSinkId always works
        remoteVideoRef.current.muted = true;
      }
      // Always route audio through the dedicated audio element
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = e => {
      if (e.candidate && socket && callIdRef.current) {
        socket.emit('call:ice-candidate', { callId: callIdRef.current, candidate: e.candidate.toJSON(), to: remoteUser.id });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        setStatus('connected');
        startTimer();
        startQualityMonitor();
        showControls();
      } else if (state === 'disconnected') {
        // Try ICE restart on transient network blips (offerer only to avoid signaling race)
        if (!closingRef.current && mode === 'outgoing' && pc.signalingState === 'stable') {
          pc.restartIce();
        }
      } else if (state === 'failed' || state === 'closed') {
        if (!closingRef.current) handleEnd();
      }
    };

    return pc;
  }, [callType, mode, remoteUser.id, socket, startTimer, startQualityMonitor, showControls, selectedCamera, selectedMic]);

  const drainPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    for (const c of pendingIceRef.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingIceRef.current = [];
  }, []);

  // ── outgoing call: create offer ─────────────────────────────────
  useEffect(() => {
    if (mode !== 'outgoing') return;
    let cancelled = false;
    (async () => {
      try {
        const pc = await setupPC();
        if (cancelled) { cleanup(); return; }
        const sdpOffer = await pc.createOffer();
        await pc.setLocalDescription(sdpOffer);
        socket?.emit('call:invite', { to: remoteUser.id, type: callType, offer: sdpOffer }, (res: any) => {
          if (res?.error) {
            if (!cancelled) { setErrorMsg(res.error); setStatus('error'); cleanup(); setTimeout(onClose, 2500); }
          } else if (res?.callId) {
            callIdRef.current = res.callId;
            // If user ended before server ACK'd the callId, send end now
            if (pendingCancelRef.current) socket?.emit('call:end', { callId: res.callId });
          }
        });
      } catch (err: any) {
        if (!cancelled) { setErrorMsg(err.message || 'Call failed'); setStatus('error'); setTimeout(onClose, 2500); }
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // ── accept call ─────────────────────────────────────────────────
  const acceptCall = useCallback(async (audioOnly = false) => {
    onAccepted?.(); // stop ringtone in parent
    if (audioOnly) setCallType('audio');
    setStatus('connecting');
    try {
      const pc = await setupPC(audioOnly);
      await pc.setRemoteDescription(new RTCSessionDescription(offer!));
      await drainPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket?.emit('call:answer', { callId: callIdRef.current, answer });
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not accept call');
      setStatus('error');
      setTimeout(onClose, 2500);
    }
  }, [drainPendingIce, offer, onAccepted, onClose, setupPC, socket]);

  // ── socket listeners ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onAnswered = async ({ answer }: { callId: string; answer: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      try { await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer)); await drainPendingIce(pcRef.current); } catch {}
    };
    const onIce = async ({ candidate }: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (!candidate) return;
      if (pcRef.current?.remoteDescription) {
        try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
      } else { pendingIceRef.current.push(candidate); }
    };
    const onRejected = () => { setStatus('ended'); cleanup(); setTimeout(onClose, 1200); };
    const onEnded = () => { setStatus('ended'); cleanup(); setTimeout(onClose, 1200); };

    socket.on('call:answered', onAnswered);
    socket.on('call:ice-candidate', onIce);
    socket.on('call:rejected', onRejected);
    socket.on('call:ended', onEnded);
    return () => {
      socket.off('call:answered', onAnswered);
      socket.off('call:ice-candidate', onIce);
      socket.off('call:rejected', onRejected);
      socket.off('call:ended', onEnded);
    };
  }, [socket, cleanup, drainPendingIce, onClose]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  const handleEnd = useCallback(() => {
    if (callIdRef.current) {
      socket?.emit('call:end', { callId: callIdRef.current });
    } else if (mode === 'outgoing') {
      // Race: ended before server ACK'd callId — flag so ACK callback sends call:end
      pendingCancelRef.current = true;
    }
    setStatus('ended');
    cleanup();
    setTimeout(onClose, 800);
  }, [cleanup, mode, onClose, socket]);

  const handleReject = useCallback(() => {
    socket?.emit('call:reject', { callId: callIdRef.current });
    setStatus('ended');
    cleanup();
    setTimeout(onClose, 800);
  }, [cleanup, onClose, socket]);

  // ── controls ─────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = muted; }); // flip
    setMuted(m => !m);
  }, [muted]);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = cameraOff; }); // flip
    setCameraOff(c => !c);
  }, [cameraOff]);

  const toggleSpeaker = useCallback(async () => {
    const audio = remoteAudioRef.current; if (!audio) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const speakers = devices.filter(d => d.kind === 'audiooutput');
      const next = speakerOn ? '' : speakers.find(d => d.label.toLowerCase().includes('speaker'))?.deviceId || speakers[0]?.deviceId || '';
      if (next && (audio as any).setSinkId) await (audio as any).setSinkId(next);
      setSpeakerOn(s => !s);
    } catch { setSpeakerOn(s => !s); }
  }, [speakerOn]);

  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !localStreamRef.current) return;
    if (sharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      const camTrack = localStreamRef.current.getVideoTracks()[0];
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender && camTrack) await sender.replaceTrack(camTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setSharing(false);
    } else {
      try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
          setErrorMsg('Screen sharing needs a secure connection (HTTPS).');
          setTimeout(() => setErrorMsg(''), 3000);
          return;
        }
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = new MediaStream([screenTrack, ...localStreamRef.current.getAudioTracks()]);
        }
        // Use ref to avoid stale closure in onended
        screenTrack.onended = () => { toggleScreenShareRef.current?.(); };
        setSharing(true);
      } catch {}
    }
  }, [sharing]);

  // Keep ref current so screenTrack.onended always calls latest version
  useEffect(() => { toggleScreenShareRef.current = toggleScreenShare; }, [toggleScreenShare]);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch {}
  }, []);

  const switchCamera = useCallback(async (deviceId: string) => {
    setSelectedCamera(deviceId);
    const pc = pcRef.current;
    if (!pc || !localStreamRef.current) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio: false });
      const newTrack = newStream.getVideoTracks()[0];
      newTrack.enabled = !cameraOff; // preserve current camera-off state
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);
      oldTrack.stop();
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } catch {}
  }, [cameraOff]);

  const flipCamera = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !localStreamRef.current || callType !== 'video') return;
    const current = localStreamRef.current.getVideoTracks()[0];
    const currentFacing = current?.getSettings()?.facingMode;
    const newFacing = currentFacing === 'environment' ? 'user' : 'environment';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacing } },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      newTrack.enabled = !cameraOff;
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newTrack);
      const oldTrack = localStreamRef.current.getVideoTracks()[0];
      localStreamRef.current.removeTrack(oldTrack);
      localStreamRef.current.addTrack(newTrack);
      oldTrack.stop();
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } catch {}
  }, [cameraOff, callType]);

  // ── keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
      if (e.key === 'Escape' && status !== 'ringing') handleEnd();
      if (e.key === 'm' && status === 'connected') toggleMute();
      if (e.key === 'v' && status === 'connected' && callType === 'video') toggleCamera();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, handleEnd, toggleMute, toggleCamera, callType]);

  // Auto-hide controls when connected video
  useEffect(() => {
    if (status === 'connected' && callType === 'video') {
      controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3500);
    }
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [status, callType]);

  // ── PiP drag ──────────────────────────────────────────────────────
  const onPipMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    pipDrag.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPosX: pipPos.x, startPosY: pipPos.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (pipDrag.current.dragging) {
      const dx = e.clientX - pipDrag.current.startX;
      const dy = e.clientY - pipDrag.current.startY;
      setPipPos({
        x: Math.max(8, pipDrag.current.startPosX - dx),
        y: Math.max(8, pipDrag.current.startPosY - dy),
      });
    }
    if (callType === 'video' && status === 'connected') showControls();
  };
  const onMouseUp = () => { pipDrag.current.dragging = false; };

  // ── derived ───────────────────────────────────────────────────────
  const qualityColor = quality === 'excellent' ? '#22c55e' : quality === 'good' ? '#f59e0b' : quality === 'poor' ? '#ef4444' : 'transparent';
  const qualityBars = quality === 'excellent' ? 4 : quality === 'good' ? 3 : quality === 'poor' ? 1 : 0;
  const qualityLabel = quality === 'unknown' ? '' : quality.charAt(0).toUpperCase() + quality.slice(1);
  const avatarFallback = remoteUser.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteUser.username)}&background=00a884&color=fff&size=200`;
  const statusLabel =
    status === 'ringing' && mode === 'incoming' ? 'Incoming call…' :
    status === 'ringing' ? 'Calling…' :
    status === 'connecting' ? 'Connecting…' :
    status === 'connected' ? fmtDuration(duration) :
    status === 'error' ? errorMsg : 'Call ended';

  // ── MINIMIZED render ──────────────────────────────────────────────
  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[600] w-56 rounded-2xl overflow-hidden shadow-2xl cursor-pointer select-none"
        style={{ background: 'rgba(15,25,35,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}
        onClick={() => setMinimized(false)}>
        {callType === 'video' && (
          <video ref={remoteVideoRef} autoPlay playsInline
            className="w-full h-28 object-cover" />
        )}
        {callType === 'audio' && (
          <div className="w-full h-16 flex items-center justify-center" style={{ background: 'rgba(0,168,132,0.15)' }}>
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--accent)' }}>
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </div>
        )}
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{remoteUser.username}</p>
            <p className="text-white/50 text-xs tabular-nums">{statusLabel}</p>
          </div>
          <div className="flex gap-1">
            <button onClick={e => { e.stopPropagation(); setMinimized(false); }}
              className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
            </button>
            <button onClick={e => { e.stopPropagation(); handleEnd(); }}
              className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center text-white hover:bg-red-400 transition-all">
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" transform="rotate(135 12 12)"/></svg>
            </button>
          </div>
        </div>
        <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
        {callType === 'audio' && <video ref={localVideoRef} autoPlay playsInline muted style={{ display: 'none' }} />}
      </div>
    );
  }

  // ── FULL render ───────────────────────────────────────────────────
  return (
    <div ref={containerRef}
      className="fixed inset-0 z-[500] flex items-center justify-center select-none"
      style={{ background: callType === 'video' ? '#000' : 'rgba(10,20,30,0.97)' }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onClick={() => { if (callType === 'video' && status === 'connected') showControls(); }}>

      {/* Remote video — full background */}
      {callType === 'video' && (
        <>
          <video ref={remoteVideoRef} autoPlay playsInline
            className="absolute inset-0 w-full h-full object-cover" />
          {/* Camera-off overlay */}
          {remoteCameraOff && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10"
              style={{ background: 'rgba(10,20,30,0.9)' }}>
              <img src={avatarFallback} alt={remoteUser.username}
                className="w-28 h-28 rounded-full object-cover mb-3"
                style={{ border: '3px solid rgba(255,255,255,0.15)' }} />
              <p className="text-white text-base font-semibold">{remoteUser.username}</p>
              <p className="text-white/50 text-sm mt-1">Camera is off</p>
            </div>
          )}
          {/* Blur when not connected */}
          {status !== 'connected' && (
            <div className="absolute inset-0 z-10" style={{ backdropFilter: 'blur(24px)', background: 'rgba(0,0,0,0.6)' }} />
          )}
        </>
      )}

      {/* Remote audio */}
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      {callType === 'audio' && <video ref={localVideoRef} autoPlay playsInline muted style={{ display: 'none' }} />}

      {/* Top bar — quality, name, controls */}
      {(controlsVisible || callType === 'audio' || status !== 'connected') && (
        <div className="absolute top-0 left-0 right-0 z-40 flex items-center gap-3 px-4 py-4 transition-opacity"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)' }}>
          {/* Quality bars */}
          {status === 'connected' && (
            <div className="flex items-end gap-0.5" title={qualityLabel}>
              {[1,2,3,4].map(i => (
                <div key={i} className="rounded-sm transition-all"
                  style={{ width: 3, height: 4 + i * 3, background: i <= qualityBars ? qualityColor : 'rgba(255,255,255,0.2)' }} />
              ))}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{remoteUser.username}</p>
            <p className={`text-xs tabular-nums ${status === 'error' ? 'text-red-400' : 'text-white/60'}`}>{statusLabel}</p>
          </div>
          {/* Top-right actions */}
          <div className="flex items-center gap-2">
            {/* Device picker */}
            {status === 'connected' && callType === 'video' && (devices.cameras.length > 1 || devices.mics.length > 1) && (
              <div className="relative">
                <button onClick={e => { e.stopPropagation(); setShowDevicePicker(d => !d); }}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
                </button>
                {showDevicePicker && (
                  <div className="absolute top-10 right-0 rounded-xl shadow-2xl overflow-hidden w-56 z-50"
                    style={{ background: 'rgba(20,30,40,0.98)', border: '1px solid rgba(255,255,255,0.1)' }}
                    onClick={e => e.stopPropagation()}>
                    {devices.cameras.length > 1 && (
                      <div className="p-3 border-b border-white/10">
                        <p className="text-white/50 text-xs mb-2 font-medium uppercase tracking-wider">Camera</p>
                        {devices.cameras.map(d => (
                          <button key={d.deviceId} onClick={() => { switchCamera(d.deviceId); setShowDevicePicker(false); }}
                            className="w-full text-left text-xs py-1.5 px-2 rounded hover:bg-white/10 text-white/80 truncate flex items-center gap-2">
                            {d.deviceId === selectedCamera && <span style={{ color: 'var(--accent)' }}>✓</span>}
                            {d.label || `Camera ${devices.cameras.indexOf(d) + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                    {devices.mics.length > 1 && (
                      <div className="p-3">
                        <p className="text-white/50 text-xs mb-2 font-medium uppercase tracking-wider">Microphone</p>
                        {devices.mics.map(d => (
                          <button key={d.deviceId} onClick={() => { setSelectedMic(d.deviceId); setShowDevicePicker(false); }}
                            className="w-full text-left text-xs py-1.5 px-2 rounded hover:bg-white/10 text-white/80 truncate flex items-center gap-2">
                            {d.deviceId === selectedMic && <span style={{ color: 'var(--accent)' }}>✓</span>}
                            {d.label || `Mic ${devices.mics.indexOf(d) + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Minimize */}
            {status === 'connected' && (
              <button onClick={e => { e.stopPropagation(); setMinimized(true); }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all"
                title="Minimize">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M19 13H5v-2h14v2z"/></svg>
              </button>
            )}
            {/* Fullscreen */}
            {callType === 'video' && status === 'connected' && (
              <button onClick={e => { e.stopPropagation(); toggleFullscreen(); }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 transition-all"
                title="Fullscreen">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  {fullscreen
                    ? <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                    : <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>}
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Local video PiP */}
      {callType === 'video' && (status === 'connected' || status === 'connecting') && (
        <div className="absolute z-30 rounded-xl overflow-hidden shadow-2xl border-2 cursor-grab active:cursor-grabbing"
          style={{
            width: 120, height: 168,
            right: pipPos.x, bottom: pipPos.y,
            borderColor: sharing ? 'var(--accent-light)' : 'rgba(255,255,255,0.3)',
          }}
          onMouseDown={onPipMouseDown}>
          <video ref={localVideoRef} autoPlay playsInline muted
            className="w-full h-full object-cover"
            style={{ transform: sharing ? 'none' : 'scaleX(-1)' }} />
          {cameraOff && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
              <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current text-white/60"><path d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
            </div>
          )}
          {muted && (
            <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.9)' }}>
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current text-white"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
            </div>
          )}
          {sharing && (
            <div className="absolute top-1 left-0 right-0 flex justify-center">
              <span className="text-[9px] font-medium px-1 py-0.5 rounded text-white" style={{ background: 'var(--accent)' }}>Sharing</span>
            </div>
          )}
        </div>
      )}

      {/* Main card — always visible for audio; for video only when not connected or controls visible */}
      <div className="relative flex flex-col items-center z-20 w-full max-w-sm px-8 py-10 rounded-3xl mx-4"
        style={{
          background: callType === 'video' && status === 'connected' ? 'transparent' : 'rgba(18,28,38,0.96)',
          backdropFilter: callType === 'video' && status === 'connected' ? 'none' : 'blur(24px)',
          pointerEvents: callType === 'video' && status === 'connected' ? 'none' : 'auto',
        }}>

        {/* Avatar + name for audio OR when not connected */}
        {(callType === 'audio' || status !== 'connected') && (
          <>
            <div className="relative mb-5">
              <img src={avatarFallback} alt={remoteUser.username}
                className="w-28 h-28 rounded-full object-cover shadow-2xl"
                style={{ border: status === 'ringing' ? '4px solid rgba(0,168,132,0.6)' : '4px solid rgba(255,255,255,0.15)' }} />
              {status === 'ringing' && mode === 'incoming' && (
                <>
                  <span className="absolute inset-0 rounded-full animate-ping opacity-30"
                    style={{ border: '4px solid var(--accent)' }} />
                  <span className="absolute inset-0 rounded-full animate-ping opacity-15"
                    style={{ border: '4px solid var(--accent)', animationDelay: '0.5s' }} />
                </>
              )}
              {status === 'connected' && muted && (
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: '#ef4444', border: '2px solid rgba(18,28,38,0.96)' }}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-white"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>
                </div>
              )}
            </div>
            <p className="text-white text-xl font-bold mb-1">{remoteUser.username}</p>
            <p className="text-white/50 text-xs mb-1">{callType === 'video' ? '📹 Video call' : '📞 Voice call'}</p>
          </>
        )}

        {/* Status label (audio) */}
        {callType === 'audio' && (
          <p className={`text-base font-semibold mb-8 tabular-nums ${status === 'error' ? 'text-red-400' : status === 'ended' ? 'text-white/50' : 'text-white/80'}`}>
            {statusLabel}
          </p>
        )}

        {/* Controls — ringing */}
        {status === 'ringing' && mode === 'incoming' && (
          <div className="flex flex-col items-center gap-6 mt-4" style={{ pointerEvents: 'auto' }}>
            <p className="text-white/60 text-sm">{type === 'video' ? 'Incoming video call' : 'Incoming call'}</p>
            <div className="flex items-center gap-8">
              {/* Reject */}
              <div className="flex flex-col items-center gap-2">
                <button onClick={handleReject}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-xl transition-all hover:scale-105">
                  <svg className="w-8 h-8 fill-white" viewBox="0 0 24 24">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"
                      transform="rotate(135 12 12)"/>
                  </svg>
                </button>
                <span className="text-white/50 text-xs">Decline</span>
              </div>
              {/* Accept audio-only (only for incoming video) */}
              {type === 'video' && (
                <div className="flex flex-col items-center gap-2">
                  <button onClick={() => acceptCall(true)}
                    className="w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-105"
                    style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <svg className="w-7 h-7 fill-white" viewBox="0 0 24 24">
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                    </svg>
                  </button>
                  <span className="text-white/50 text-xs">Audio only</span>
                </div>
              )}
              {/* Accept */}
              <div className="flex flex-col items-center gap-2">
                <button onClick={() => acceptCall(false)}
                  className="w-16 h-16 rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-105"
                  style={{ background: 'var(--accent)' }}>
                  {type === 'video'
                    ? <svg className="w-8 h-8 fill-white" viewBox="0 0 24 24"><path d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18H3a2 2 0 01-2-2V8a2 2 0 012-2h2m10 0h2a2 2 0 012 2v2"/></svg>
                    : <svg className="w-8 h-8 fill-white" viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>}
                </button>
                <span className="text-white/50 text-xs">{type === 'video' ? 'Video' : 'Accept'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Controls — connecting/outgoing */}
        {(status === 'connecting' || (status === 'ringing' && mode === 'outgoing')) && (
          <div className="flex justify-center mt-4" style={{ pointerEvents: 'auto' }}>
            <button onClick={handleEnd}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-xl transition-all hover:scale-105">
              <svg className="w-8 h-8 fill-white" viewBox="0 0 24 24">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"
                  transform="rotate(135 12 12)"/>
              </svg>
            </button>
          </div>
        )}

        {/* Status ended/error */}
        {(status === 'ended' || status === 'error') && (
          <p className={`text-base font-semibold mt-4 ${status === 'error' ? 'text-red-400' : 'text-white/50'}`}>
            {statusLabel}
          </p>
        )}
      </div>

      {/* Bottom controls — connected */}
      {status === 'connected' && (controlsVisible || callType === 'audio') && (
        <div className="absolute bottom-0 left-0 right-0 z-40 flex flex-col items-center pb-10 pt-16 transition-opacity"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)', pointerEvents: 'auto' }}
          onClick={e => e.stopPropagation()}>

          {/* Duration overlay for video */}
          {callType === 'video' && (
            <p className="text-white/60 text-sm tabular-nums mb-6">{fmtDuration(duration)}</p>
          )}

          <div className="flex items-end justify-center gap-4 flex-wrap">
            {/* Mute */}
            <CtrlBtn active={muted} activeColor="#ef4444" onClick={toggleMute} title={muted ? 'Unmute (M)' : 'Mute (M)'} label={muted ? 'Unmute' : 'Mute'}>
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                {muted
                  ? <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
                  : <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>}
              </svg>
            </CtrlBtn>

            {/* Speaker (audio only) */}
            {callType === 'audio' && (
              <CtrlBtn active={speakerOn} activeColor="var(--accent)" onClick={toggleSpeaker} title="Speaker" label="Speaker">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              </CtrlBtn>
            )}

            {/* Camera toggle (video) */}
            {callType === 'video' && (
              <CtrlBtn active={cameraOff} activeColor="#ef4444" onClick={toggleCamera} title={cameraOff ? 'Turn on camera (V)' : 'Turn off camera (V)'} label={cameraOff ? 'Cam on' : 'Cam off'}>
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  {cameraOff
                    ? <path d="M21 6.5l-4-4-9.17 9.17-2.43-2.43L4 10.64l2.83 2.83L3 17.14V21h3.86l3.72-3.72 2.83 2.83 1.41-1.41-2.43-2.42L21 6.5zM3.27 3L2 4.27l1.68 1.68A9.95 9.95 0 001 12c0 5.52 4.48 10 10 10 2.13 0 4.1-.66 5.74-1.78L19.73 22 21 20.73 3.27 3z"/>
                    : <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>}
                </svg>
              </CtrlBtn>
            )}

            {/* Screen share — desktop only (no API on iOS/Android) */}
            {callType === 'video' && !isMobile && (
              <CtrlBtn active={sharing} activeColor="var(--accent)" onClick={toggleScreenShare} title={sharing ? 'Stop sharing' : 'Share screen'} label={sharing ? 'Stop share' : 'Share'}>
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>
                </svg>
              </CtrlBtn>
            )}

            {/* Flip camera — mobile only */}
            {callType === 'video' && isMobile && (
              <CtrlBtn active={false} activeColor="var(--accent)" onClick={flipCamera} title="Flip camera" label="Flip">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M20 5h-3.17L15 3H9L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-8 13c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm3.5-8.5L12 12l3.5 2.5V15h-7v-.5L12 12 8.5 9.5V9h7v.5z"/>
                </svg>
              </CtrlBtn>
            )}

            {/* End call */}
            <div className="flex flex-col items-center gap-1">
              <button onClick={handleEnd}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 flex items-center justify-center shadow-xl transition-all hover:scale-105">
                <svg className="w-8 h-8 fill-white" viewBox="0 0 24 24">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"
                    transform="rotate(135 12 12)"/>
                </svg>
              </button>
              <span className="text-white/50 text-xs">End</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Control button with label ─────────────────────────────────────────────────
function CtrlBtn({ onClick, active, activeColor, title, label, children }: {
  onClick: () => void; active: boolean; activeColor: string;
  title: string; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button onClick={onClick} title={title}
        className="w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-105 text-white"
        style={{ background: active ? activeColor : 'rgba(255,255,255,0.18)' }}>
        {children}
      </button>
      <span className="text-white/50 text-xs">{label}</span>
    </div>
  );
}
