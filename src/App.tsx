import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { LandingView } from './components/LandingView';
import { HostView } from './components/HostView';
import { ViewerView } from './components/ViewerView';
import { DebugPanel } from './components/DebugPanel';
import { PrivacyNotice } from './components/PrivacyNotice';
import { ErrorModal } from './components/ErrorModal';
import { useLocalVideo } from './hooks/useLocalVideo';
import { useWebRTC } from './hooks/useWebRTC';
import { Role, DCSyncMessage } from './types/protocol';

export default function App() {
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const localVideo = useLocalVideo();

  // Helper to extract room ID from URL path or query params
  const getInitialRoomIdFromUrl = (): string | null => {
    const pathname = window.location.pathname;
    const match = pathname.match(/\/watch\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('room');
  };

  // Remote viewer video element ref for synchronization events
  const viewerVideoElementRef = useRef<HTMLVideoElement | null>(null);

  // Synchronization callbacks for Viewer
  const handleRemotePlay = useCallback((time: number) => {
    const video = viewerVideoElementRef.current;
    if (video) {
      if (Math.abs(video.currentTime - time) > 0.5) {
        try {
          video.currentTime = time;
        } catch {}
      }
      video.play().catch(() => {});
    }
  }, []);

  const handleRemotePause = useCallback((time: number) => {
    const video = viewerVideoElementRef.current;
    if (video) {
      video.pause();
      if (Math.abs(video.currentTime - time) > 0.5) {
        try {
          video.currentTime = time;
        } catch {}
      }
    }
  }, []);

  const handleRemoteSeek = useCallback((time: number) => {
    const video = viewerVideoElementRef.current;
    if (video) {
      try {
        video.currentTime = time;
      } catch {}
    }
  }, []);

  const handleRemoteRate = useCallback((rate: number, time: number) => {
    const video = viewerVideoElementRef.current;
    if (video) {
      video.playbackRate = rate;
    }
  }, []);

  const handleRemoteSync = useCallback((sync: DCSyncMessage, expectedTime: number) => {
    const video = viewerVideoElementRef.current;
    if (!video) return;

    // Use the same drift policy as SyncManager so the diagnostics and the
    // actual player correction cannot disagree.
    const evaluation = syncManager.evaluateDrift(video.currentTime, expectedTime);

    if (evaluation.action === 'HARD_SYNC') {
      try {
        video.currentTime = expectedTime;
      } catch {}
      video.playbackRate = sync.playbackRate;
    } else if (evaluation.action === 'GENTLE_SLOW_DOWN') {
      video.playbackRate = Math.max(0.5, sync.playbackRate * 0.97);
    } else if (evaluation.action === 'GENTLE_SPEED_UP') {
      video.playbackRate = Math.min(2, sync.playbackRate * 1.03);
    } else {
      video.playbackRate = sync.playbackRate;
    }

    if (sync.state === 'playing' && video.paused) {
      video.play().catch(() => {});
    } else if (sync.state === 'paused' && !video.paused) {
      video.pause();
    }
  }, []);

  const {
    role,
    roomId,
    hostToken,
    connectionState,
    dataChannelState,
    remoteStream,
    stats,
    chatMessages,
    lastError,
    isViewerConnected,
    createRoom,
    joinRoom,
    sendHostReady,
    attachLocalStream,
    startOfferNegotiation,
    sendChat,
    sendPlay,
    sendPause,
    sendSeek,
    sendRate,
    sendSync,
    leaveRoom,
    clearError,
    syncManager,
  } = useWebRTC({
    onRemotePlay: handleRemotePlay,
    onRemotePause: handleRemotePause,
    onRemoteSeek: handleRemoteSeek,
    onRemoteRate: handleRemoteRate,
    onRemoteSync: handleRemoteSync,
  });

  // Check URL on mount: if visiting /watch/:roomId or ?debug=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'true') {
      setIsDebugOpen(true);
    }

    const urlRoomId = getInitialRoomIdFromUrl();
    if (urlRoomId && !roomId) {
      console.log('[App] Auto-joining room from URL:', urlRoomId);
      joinRoom(urlRoomId).catch((err) => {
        console.error('[App] Failed to auto-join room:', err);
      });
    }

    // Keyboard shortcut for debug panel (Ctrl+Shift+D or Cmd+Shift+D)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsDebugOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Update URL history when roomId is created
  useEffect(() => {
    if (roomId) {
      const targetPath = `/watch/${roomId}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }
  }, [roomId]);

  const handleCreateRoom = async () => {
    setIsCreatingRoom(true);
    try {
      await createRoom();
    } catch (err: any) {
      console.error('[App] Room creation failed:', err);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = async (targetId: string) => {
    try {
      await joinRoom(targetId);
    } catch (err: any) {
      console.error('[App] Join room failed:', err);
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    localVideo.clearVideo();
    window.history.pushState({}, '', '/');
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-100 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        roomId={roomId}
        role={role}
        connectionState={connectionState}
        connectionPath={stats?.connectionPath || 'unknown'}
        rttMs={stats?.rttMs}
        onOpenDebug={() => setIsDebugOpen(true)}
        onOpenPrivacy={() => setIsPrivacyOpen(true)}
        onLeaveRoom={roomId ? handleLeaveRoom : undefined}
      />

      {/* Main View Router */}
      <main className="flex-1 flex flex-col">
        {!roomId ? (
          <LandingView
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            isCreating={isCreatingRoom}
          />
        ) : role === 'host' ? (
          <HostView
            roomId={roomId}
            hostToken={hostToken}
            localVideo={localVideo}
            connectionState={connectionState}
            dataChannelState={dataChannelState}
            isViewerConnected={isViewerConnected}
            chatMessages={chatMessages}
            onSendMessage={sendChat}
            onSendPlay={sendPlay}
            onSendPause={sendPause}
            onSendSeek={sendSeek}
            onSendRate={sendRate}
            onSendSync={sendSync}
            onAttachStream={attachLocalStream}
            onStartNegotiation={startOfferNegotiation}
            onSendHostReady={sendHostReady}
          />
        ) : (
          <ViewerView
            roomId={roomId}
            remoteStream={remoteStream}
            connectionState={connectionState}
            dataChannelState={dataChannelState}
            chatMessages={chatMessages}
            syncManager={syncManager}
            onSendMessage={sendChat}
            onVideoElementReady={(video) => { viewerVideoElementRef.current = video; }}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#0a0a0a] py-4 px-6 text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>WatchTogether • Private Browser-to-Browser P2P Movie Watching</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPrivacyOpen(true)}
              className="hover:text-slate-200 transition-colors cursor-pointer"
            >
              Zero Server Media Guarantee
            </button>
            <span className="text-slate-600">•</span>
            <button
              onClick={() => setIsDebugOpen(true)}
              className="hover:text-slate-200 transition-colors font-mono text-[11px] cursor-pointer"
            >
              Diagnostics (Ctrl+Shift+D)
            </button>
          </div>
        </div>
      </footer>

      {/* Diagnostics Modal */}
      <DebugPanel
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        roomId={roomId}
        role={role}
        connectionState={connectionState}
        stats={stats}
        isCaptureSupported={localVideo.isCaptureSupported}
        driftMs={syncManager.getLastDriftMs()}
      />

      {/* Privacy Modal */}
      <PrivacyNotice
        isOpen={isPrivacyOpen}
        onClose={() => setIsPrivacyOpen(false)}
      />

      {/* Error Dialog Modal */}
      <ErrorModal
        error={lastError}
        onClose={clearError}
        onHome={handleLeaveRoom}
        onRetry={
          roomId
            ? () => {
                clearError();
                if (role === 'host') {
                  startOfferNegotiation();
                } else if (roomId) {
                  joinRoom(roomId);
                }
              }
            : undefined
        }
      />
    </div>
  );
}
