import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Radio,
  Lock,
  Sparkles,
  AlertCircle,
  Activity,
  Shield,
  Film,
} from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { DCChatMessage, ConnectionState, DCSyncMessage } from '../types/protocol';
import { SyncManager } from '../services/syncManager';

interface ViewerViewProps {
  roomId: string;
  remoteStream: MediaStream | null;
  connectionState: ConnectionState;
  dataChannelState: RTCDataChannelState;
  chatMessages: DCChatMessage[];
  syncManager: SyncManager;
  onSendMessage: (text: string) => boolean;
}

export const ViewerView: React.FC<ViewerViewProps> = ({
  roomId,
  remoteStream,
  connectionState,
  dataChannelState,
  chatMessages,
  syncManager,
  onSendMessage,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [driftInfo, setDriftInfo] = useState<{ driftMs: number; status: 'in-sync' | 'adjusting' | 'diverged' }>({
    driftMs: 0,
    status: 'in-sync',
  });

  // Attach remote stream to HTMLVideoElement
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (remoteStream && remoteStream.getTracks().length > 0) {
      console.log('[Viewer] Binding remote MediaStream to video element');
      video.srcObject = remoteStream;

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsAutoplayBlocked(false);
          })
          .catch((err) => {
            console.warn('[Viewer] Autoplay blocked by browser policy:', err);
            setIsAutoplayBlocked(true);
          });
      }
    } else {
      video.srcObject = null;
    }

    return () => {
      if (video.srcObject === remoteStream) {
        video.srcObject = null;
      }
    };
  }, [remoteStream]);

  // Periodic drift check
  useEffect(() => {
    const timer = setInterval(() => {
      const lastDrift = syncManager.getLastDriftMs();
      const absDrift = Math.abs(lastDrift);
      let status: 'in-sync' | 'adjusting' | 'diverged' = 'in-sync';
      if (absDrift > 1000) {
        status = 'diverged';
      } else if (absDrift > 250) {
        status = 'adjusting';
      }
      setDriftInfo({ driftMs: Math.round(lastDrift), status });
    }, 1000);

    return () => clearInterval(timer);
  }, [syncManager]);

  const handleStartWatchingGesture = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = false;
    video
      .play()
      .then(() => {
        setIsPlaying(true);
        setIsAutoplayBlocked(false);
      })
      .catch((e) => {
        console.error('[Viewer] Manual play failed:', e);
        // Fallback: try muted
        video.muted = true;
        video.play().then(() => {
          setIsPlaying(true);
          setIsAutoplayBlocked(false);
          setIsMuted(true);
        });
      });
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      if (val === 0) {
        setIsMuted(true);
      } else if (isMuted) {
        setIsMuted(false);
        videoRef.current.muted = false;
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      videoRef.current.muted = newMuted;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Viewer Header Banner */}
      <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shadow-inner">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Viewer Mode
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs font-mono text-slate-400">Room: {roomId}</span>
            </div>
            <p className="text-sm font-medium text-slate-200 mt-0.5">
              Receiving direct browser stream from Host.
            </p>
          </div>
        </div>

        {/* Sync Drift Meter */}
        <div className="flex items-center gap-2 bg-[#141414] border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono shadow-inner">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">Sync:</span>
          <span
            className={`font-semibold ${
              driftInfo.status === 'in-sync'
                ? 'text-emerald-400'
                : driftInfo.status === 'adjusting'
                ? 'text-amber-400'
                : 'text-rose-400'
            }`}
          >
            {driftInfo.status === 'in-sync'
              ? '● Locked (<250ms)'
              : driftInfo.status === 'adjusting'
              ? `Adjusting (${driftInfo.driftMs}ms)`
              : `Offset (${driftInfo.driftMs}ms)`}
          </span>
        </div>
      </div>

      {/* Main Theater & Chat Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Remote Video Stream View (2 cols) */}
        <div className="lg:col-span-2 flex flex-col space-y-4">
          <div
            ref={containerRef}
            className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-2xl group border border-white/10 flex items-center justify-center"
          >
            {/* The remote stream video element */}
            <video
              ref={videoRef}
              playsInline
              autoPlay
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full h-full object-contain"
            />

            {/* Waiting for stream placeholder */}
            {(!remoteStream || remoteStream.getTracks().length === 0) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-[#050505]/95 space-y-3">
                <span className="animate-spin inline-block h-8 w-8 border-2 border-orange-500 border-t-transparent rounded-full"></span>
                <h3 className="text-base font-bold text-slate-100">
                  Connecting to Host's Video Stream...
                </h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Establishing direct WebRTC peer connection. The movie will begin streaming once the host selects a video file.
                </p>
              </div>
            )}

            {/* Autoplay blocked banner / button */}
            {isAutoplayBlocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-md z-20 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 animate-pulse">
                  <Play className="w-8 h-8 fill-current ml-1" />
                </div>
                <div className="text-center space-y-1">
                  <h3 className="text-lg font-bold text-slate-100">
                    Start Watching
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Browser security requires a click to enable synchronized video and audio playback.
                  </p>
                </div>
                <button
                  id="start-watching-btn"
                  onClick={handleStartWatchingGesture}
                  className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-sm rounded-xl shadow-xl shadow-orange-950/50 transition-all transform active:scale-95 cursor-pointer flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  START WATCHING
                </button>
              </div>
            )}

            {/* Top Overlay: Host Authority Notice */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-slate-300">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Host controls timeline & playback</span>
              </div>

              <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs font-mono text-emerald-400">
                <Radio className="w-3 h-3 animate-pulse" />
                <span>Direct P2P Stream</span>
              </div>
            </div>

            {/* Bottom Overlay Controls (Volume & Fullscreen) */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent p-4 flex items-center justify-between opacity-90 group-hover:opacity-100 transition-opacity duration-300">
              {/* Volume */}
              <div className="flex items-center gap-2">
                <button
                  id="viewer-mute-btn"
                  onClick={toggleMute}
                  className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-orange-400" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>

              {/* Fullscreen */}
              <button
                id="viewer-fullscreen-btn"
                onClick={toggleFullscreen}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Status Note */}
          <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-4 flex items-center justify-between text-xs text-slate-400 shadow-lg">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>
                Streaming directly from Host's local player via HTMLMediaElement capture.
              </span>
            </div>
            <span className="font-mono text-slate-500 text-[11px]">WebRTC Encrypted</span>
          </div>
        </div>

        {/* Real-time DataChannel Chat (1 col) */}
        <div className="lg:col-span-1 h-[520px] lg:h-auto">
          <ChatPanel
            messages={chatMessages}
            currentRole="viewer"
            dataChannelState={dataChannelState}
            onSendMessage={onSendMessage}
          />
        </div>
      </div>
    </div>
  );
};
