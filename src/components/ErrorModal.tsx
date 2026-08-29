import React from 'react';
import { ErrorCode } from '../types/protocol';
import { AlertTriangle, X, RefreshCw, Home } from 'lucide-react';

interface ErrorModalProps {
  error: { code: ErrorCode; message: string } | null;
  onClose: () => void;
  onHome: () => void;
  onRetry?: () => void;
}

export const ErrorModal: React.FC<ErrorModalProps> = ({
  error,
  onClose,
  onHome,
  onRetry,
}) => {
  if (!error) return null;

  const getExplanation = (code: ErrorCode) => {
    switch (code) {
      case 'ROOM_FULL':
        return 'This watch room already has 1 Host and 1 Viewer connected. WatchTogether rooms are private 2-person watch sessions.';
      case 'ROOM_NOT_FOUND':
        return 'The requested room ID could not be found or has expired due to inactivity. Please create a new room or check the invite link.';
      case 'CAPTURE_UNSUPPORTED':
        return 'Your browser does not support HTMLMediaElement.captureStream(). Please use a modern Chromium-based browser (Chrome, Edge, Brave) or Firefox.';
      case 'MEDIA_UNSUPPORTED':
        return 'This video format/codec cannot be decoded natively by your browser. Try playing an MP4 (H.264 / AAC) or WebM (VP8/VP9) file.';
      case 'PLAYBACK_BLOCKED':
        return 'The browser blocked automated media playback with sound. Click the "Start Watching" button to enable audio.';
      case 'ICE_FAILED':
        return 'Failed to establish direct P2P connection through your network/firewall. A TURN relay server may be required for restricted NATs.';
      case 'RATE_LIMITED':
        return 'Too many requests were sent in a short timeframe. Please wait a few seconds before trying again.';
      default:
        return error.message || 'An unexpected WebRTC or signaling error occurred.';
    }
  };

  return (
    <div
      id="error-dialog-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shadow-inner">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 p-1.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-wider text-orange-400">
              {error.code}
            </div>
            <h3 className="text-lg font-bold text-slate-100 mt-1">
              {error.message || 'Watch Session Notice'}
            </h3>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              {getExplanation(error.code)}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            {onRetry && (
              <button
                id="error-retry-btn"
                onClick={() => {
                  onClose();
                  onRetry();
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-orange-950/40 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            )}
            <button
              id="error-home-btn"
              onClick={() => {
                onClose();
                onHome();
              }}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <Home className="w-4 h-4" />
              Return Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
