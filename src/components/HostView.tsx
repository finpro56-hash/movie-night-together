import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  UploadCloud,
  Film,
  Copy,
  Check,
  Users,
  QrCode,
  Sparkles,
  Info,
  Radio,
  FileVideo,
  Settings2,
} from 'lucide-react';
import { UseLocalVideoReturn } from '../hooks/useLocalVideo';
import { ChatPanel } from './ChatPanel';
import { DCChatMessage, ConnectionState } from '../types/protocol';

interface HostViewProps {
  roomId: string;
  hostToken: string | null;
  localVideo: UseLocalVideoReturn;
  connectionState: ConnectionState;
  dataChannelState: RTCDataChannelState;
  isViewerConnected: boolean;
  chatMessages: DCChatMessage[];
  onSendMessage: (text: string) => boolean;
  onSendPlay: (time: number) => void;
  onSendPause: (time: number) => void;
  onSendSeek: (time: number) => void;
  onSendRate: (rate: number, time: number) => void;
  onSendSync: (state: 'playing' | 'paused' | 'buffering', time: number, playbackRate: number, duration?: number) => void;
  onAttachStream: (stream: MediaStream) => void;
  onStartNegotiation: () => void;
  onSendHostReady: () => void;
}

export const HostView: React.FC<HostViewProps> = ({
  roomId,
  localVideo,
  connectionState,
  dataChannelState,
  isViewerConnected,
  chatMessages,
  onSendMessage,
  onSendPlay,
  onSendPause,
  onSendSeek,
  onSendRate,
  onSendSync,
  onAttachStream,
  onStartNegotiation,
  onSendHostReady,
}) => {
  const { videoRef, videoInfo, error: videoError, handleFileSelect, startCapture } = localVideo;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  const watchUrl = `${window.location.origin}/watch/${roomId}`;

  // Sync state broadcast timer (Host -> Viewer via DataChannel)
  useEffect(() => {
    if (dataChannelState === 'open') {
      syncTimerRef.current = window.setInterval(() => {
        if (videoRef.current) {
          const state = videoRef.current.paused ? 'paused' : 'playing';
          onSendSync(
            state,
            videoRef.current.currentTime,
            videoRef.current.playbackRate,
            videoRef.current.duration || 0
          );
        }
      }, 500);
    }

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
      }
    };
  }, [dataChannelState, onSendSync, videoRef]);

  // Do not capture a newly selected file until the media element can actually
  // produce frames. Capturing too early can create a WebRTC track that stays
  // effectively frozen until the host repeatedly toggles play/pause.
  const capturedForUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoInfo) return;
    if (capturedForUrlRef.current === videoInfo.objectUrl) return;

    const attachWhenReady = () => {
      if (capturedForUrlRef.current === videoInfo.objectUrl) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      const stream = startCapture();
      if (!stream) return;
      capturedForUrlRef.current = videoInfo.objectUrl;
      onAttachStream(stream);
      onSendHostReady();
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      attachWhenReady();
    }
    video.addEventListener('loadeddata', attachWhenReady);
    video.addEventListener('canplay', attachWhenReady);
    return () => {
      video.removeEventListener('loadeddata', attachWhenReady);
      video.removeEventListener('canplay', attachWhenReady);
    };
  }, [videoInfo?.objectUrl, startCapture, onAttachStream, onSendHostReady, videoRef]);

  // When a viewer joins, start WebRTC negotiation
  useEffect(() => {
    if (isViewerConnected && videoInfo) {
      onStartNegotiation();
    }
  }, [isViewerConnected, videoInfo, onStartNegotiation]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().then(() => {
        setIsPlaying(true);
        onSendPlay(video.currentTime);
      }).catch((e) => console.error('Local play error:', e));
    } else {
      video.pause();
      setIsPlaying(false);
      onSendPause(video.currentTime);
    }
  }, [videoRef, onSendPlay, onSendPause]);

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      onSendSeek(newTime);
    }
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      onSendRate(rate, videoRef.current.currentTime);
    }
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

  const copyInviteLink = () => {
    navigator.clipboard.writeText(watchUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => {
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Top Banner: Invite & Session Info */}
      <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase bg-orange-500/10 text-orange-400 border border-orange-500/20">
              Host Authoritative
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-xs font-mono text-slate-400">Room: {roomId}</span>
          </div>
          <p className="text-sm font-medium text-slate-200">
            Share this invite link with your viewer friend to begin direct P2P streaming.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 sm:w-80 bg-[#141414] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 truncate select-all">
            {watchUrl}
          </div>
          <button
            id="copy-invite-btn"
            onClick={copyInviteLink}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-orange-950/40 shrink-0 active:scale-95 cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedLink ? 'Copied' : 'Copy Link'}
          </button>
          <button
            id="show-qr-btn"
            onClick={() => setShowQrModal(true)}
            className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-colors shrink-0 cursor-pointer"
            title="Show QR Code"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Theater & Chat Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Video Player & Controls (2 cols) */}
        <div className="lg:col-span-2 flex flex-col space-y-4">
          {!videoInfo ? (
            /* Empty State: File Selection Dropzone */
            <div
              id="file-dropzone"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`aspect-video w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all duration-200 shadow-2xl ${
                isDragging
                  ? 'border-orange-500 bg-orange-950/20 scale-[1.01]'
                  : 'border-white/10 hover:border-orange-500/40 bg-[#0d0d0d]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />

              <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 mb-4 shadow-lg">
                <UploadCloud className="w-8 h-8" />
              </div>

              <h3 className="text-lg font-bold text-slate-100">
                Select or Drop Local Video File
              </h3>
              <p className="text-sm text-slate-400 max-w-md mt-1.5 leading-relaxed">
                Choose any MP4, WebM, or MKV file on your device. The file is never uploaded — it plays locally and captures directly to your peer.
              </p>

              <div className="mt-5 flex items-center gap-2 text-xs font-mono text-slate-400 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
                <FileVideo className="w-3.5 h-3.5 text-orange-400" />
                Best compatibility: MP4 (H.264/AAC) or WebM (VP8/VP9). Other formats depend on browser codec support.
              </div>
            </div>
          ) : (
            /* Active Theater Video Player */
            <div
              ref={containerRef}
              className="relative aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-2xl group border border-white/10 flex items-center justify-center"
            >
              <video
                ref={videoRef}
                playsInline
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setCurrentTime(videoRef.current.currentTime);
                  }
                }}
                onDurationChange={() => {
                  if (videoRef.current) {
                    setDuration(videoRef.current.duration || 0);
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onWaiting={() => setIsPlaying(false)}
                onEnded={() => {
                  setIsPlaying(false);
                  if (videoRef.current) onSendPause(videoRef.current.currentTime);
                }}
                onClick={togglePlay}
                className="w-full h-full object-contain cursor-pointer"
              />

              {/* Top Status Overlay on Video */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs text-white">
                  <Film className="w-3.5 h-3.5 text-orange-400" />
                  <span className="font-medium truncate max-w-xs">{videoInfo.fileName}</span>
                  <span className="text-slate-500">•</span>
                  <span className="font-mono text-slate-400 text-[11px]">
                    {videoInfo.videoWidth}x{videoInfo.videoHeight}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs font-mono">
                  <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                  <span className="text-emerald-300">Capturing Live MediaStream</span>
                </div>
              </div>

              {/* Bottom Custom Overlay Controls */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 flex flex-col gap-2.5 opacity-90 group-hover:opacity-100 transition-opacity duration-300">
                {/* Timeline Scrubber */}
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-300 min-w-[45px]">
                    {formatTime(currentTime)}
                  </span>
                  <input
                    id="host-video-scrubber"
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeekChange}
                    className="flex-1 h-1.5 bg-slate-700/80 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:h-2 transition-all"
                  />
                  <span className="text-xs font-mono text-slate-400 min-w-[45px]">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Controls Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Play/Pause */}
                    <button
                      id="host-play-pause-btn"
                      onClick={togglePlay}
                      className="p-2 hover:bg-white/10 rounded-xl text-white transition-colors cursor-pointer"
                      title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                    </button>

                    {/* Volume & Mute */}
                    <div className="flex items-center gap-2 group/vol">
                      <button
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
                        className="w-16 sm:w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white"
                      />
                    </div>
                  </div>

                  {/* Right: Playback Speed & Fullscreen & Change Video */}
                  <div className="flex items-center gap-2">
                    {/* Speed Selector */}
                    <div className="flex items-center bg-white/10 rounded-xl p-0.5 text-xs font-mono text-slate-300">
                      {[0.75, 1, 1.25, 1.5].map((rate) => (
                        <button
                          key={rate}
                          onClick={() => handleRateChange(rate)}
                          className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                            playbackRate === rate
                              ? 'bg-orange-500 text-white font-bold'
                              : 'hover:text-white'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>

                    {/* Fullscreen */}
                    <button
                      onClick={toggleFullscreen}
                      className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
                      title="Fullscreen"
                    >
                      {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Video Metadata Card */}
          {videoInfo && (
            <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400">
                  <Film className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-slate-200 truncate max-w-sm">{videoInfo.fileName}</div>
                  <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                    {(videoInfo.fileSize / (1024 * 1024)).toFixed(1)} MB • {formatTime(duration)} • {videoInfo.videoWidth}x{videoInfo.videoHeight}
                  </div>
                </div>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 hover:text-slate-100 transition-colors shrink-0 cursor-pointer"
              >
                Change Video File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
            </div>
          )}

          {/* Viewer Connectivity Info Card */}
          <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-4 flex items-center justify-between text-xs shadow-lg">
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  isViewerConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'
                }`}
              ></div>
              <div>
                <span className="font-semibold text-slate-200">
                  {isViewerConnected ? 'Viewer is Connected' : 'Waiting for Viewer to join...'}
                </span>
                <p className="text-slate-400 text-[11px] mt-0.5">
                  {isViewerConnected
                    ? 'Playback commands and live stream are synchronized in real time.'
                    : 'Send the watch URL above to your viewer friend.'}
                </p>
              </div>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-semibold ${
                isViewerConnected
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                  : 'bg-white/5 text-slate-400 border border-white/10'
              }`}
            >
              {isViewerConnected ? 'SYNCED' : 'AWAITING'}
            </span>
          </div>
        </div>

        {/* Real-time DataChannel Chat (1 col) */}
        <div className="lg:col-span-1 h-[520px] lg:h-auto">
          <ChatPanel
            messages={chatMessages}
            currentRole="host"
            dataChannelState={dataChannelState}
            onSendMessage={onSendMessage}
          />
        </div>
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <h3 className="text-base font-bold text-slate-100">Room QR Code</h3>
            <p className="text-xs text-slate-400">Scan to join this watch room on mobile</p>
            <div className="bg-white p-4 rounded-xl flex items-center justify-center mx-auto w-48 h-48 shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(watchUrl)}`}
                alt="Room QR Code"
                className="w-full h-full"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="text-xs font-mono text-slate-400 truncate bg-[#141414] p-2.5 rounded-xl border border-white/10">
              {watchUrl}
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold rounded-xl border border-white/10 transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
