import React, { useState } from 'react';
import { Film, Users, Shield, Zap, Lock, ArrowRight, Play, Sparkles } from 'lucide-react';

interface LandingViewProps {
  onCreateRoom: () => void;
  onJoinRoom: (roomId: string) => void;
  isCreating: boolean;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onCreateRoom,
  onJoinRoom,
  isCreating,
}) => {
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    let clean = joinInput.trim();
    if (!clean) {
      setJoinError('Please enter a room ID or paste an invite link.');
      return;
    }

    // Extract room ID from URL if full URL is pasted
    if (clean.includes('/watch/')) {
      const parts = clean.split('/watch/');
      clean = parts[parts.length - 1].split('?')[0].split('#')[0];
    } else if (clean.includes('room=')) {
      const match = clean.match(/[?&]room=([^&]+)/);
      if (match && match[1]) {
        clean = match[1];
      }
    }

    if (clean.length < 3) {
      setJoinError('Invalid room ID format.');
      return;
    }

    onJoinRoom(clean);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10 lg:py-16 max-w-6xl mx-auto w-full">
      {/* Hero Header */}
      <div className="text-center space-y-4 max-w-3xl">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-semibold tracking-wide">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Native WebRTC Direct Streaming • Zero Cloud Storage
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-100 leading-[1.15]">
          Watch your own movie together —{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400">
            directly between browsers.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Host selects a local video file from their computer. Stream directly to your friend via peer-to-peer WebRTC with frame-synchronized controls and real-time chat.
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mt-10">
        {/* Host Flow Card */}
        <div className="bg-[#0d0d0d] border border-white/10 hover:border-white/20 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-2xl relative overflow-hidden group transition-all duration-300">
          <div className="absolute -top-16 -right-16 w-32 h-32 bg-orange-500/10 rounded-full blur-2xl pointer-events-none"></div>

          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shadow-inner">
              <Film className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Host a Movie</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Create a private room, load any video file locally, and get a shareable invite link for your viewer.
            </p>
          </div>

          <button
            id="create-room-btn"
            onClick={onCreateRoom}
            disabled={isCreating}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-orange-950/40 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isCreating ? (
              <>
                <span className="animate-spin inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Creating Room...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                Create Watch Room
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        </div>

        {/* Viewer Flow Card */}
        <div className="bg-[#0d0d0d] border border-white/10 hover:border-white/20 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6 shadow-2xl relative overflow-hidden transition-all duration-300">
          <div className="absolute -top-16 -right-16 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-inner">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Join a Room</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Have an invitation code or link from a friend? Enter it below to join the watch room.
            </p>
          </div>

          <form onSubmit={handleJoinSubmit} className="space-y-3">
            {joinError && (
              <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 p-2.5 rounded-xl">
                {joinError}
              </div>
            )}
            <div className="flex gap-2">
              <input
                id="join-room-input"
                type="text"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Enter room ID or paste link"
                className="flex-1 bg-[#141414] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
              />
              <button
                id="join-room-btn"
                type="submit"
                className="px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 text-slate-100 text-sm font-semibold rounded-xl transition-all shrink-0 shadow-md active:scale-95"
              >
                Join
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-4xl mt-16 pt-10 border-t border-white/10">
        <div className="flex items-start gap-3.5 p-4.5 rounded-2xl bg-[#0d0d0d] border border-white/10 shadow-lg">
          <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-800/50 text-emerald-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">100% Private Media</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Video files stay exclusively in your browser memory and are never uploaded to any server.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5 p-4.5 rounded-2xl bg-[#0d0d0d] border border-white/10 shadow-lg">
          <div className="p-2.5 rounded-xl bg-orange-950/80 border border-orange-800/50 text-orange-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Real-Time Sync Engine</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Drift-corrected playback clock with sub-second synchronization for pause, seek, and rate changes.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3.5 p-4.5 rounded-2xl bg-[#0d0d0d] border border-white/10 shadow-lg">
          <div className="p-2.5 rounded-xl bg-blue-950/80 border border-blue-800/50 text-blue-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">DataChannel Chat</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Instant, unlogged peer-to-peer chat with zero server persistence or trace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
