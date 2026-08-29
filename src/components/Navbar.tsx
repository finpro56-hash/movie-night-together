import React from 'react';
import { Film, Terminal, Shield, Copy, Check } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { ConnectionState, ConnectionPathType } from '../types/protocol';

interface NavbarProps {
  roomId: string | null;
  role: 'host' | 'viewer' | null;
  connectionState: ConnectionState;
  connectionPath: ConnectionPathType;
  rttMs?: number;
  onOpenDebug: () => void;
  onOpenPrivacy: () => void;
  onLeaveRoom?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  roomId,
  role,
  connectionState,
  connectionPath,
  rttMs,
  onOpenDebug,
  onOpenPrivacy,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = React.useState(false);

  const copyRoomLink = () => {
    if (!roomId) return;
    const url = `${window.location.origin}/watch/${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/10 px-4 lg:px-8 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              if (roomId && onLeaveRoom) {
                if (window.confirm('Leave current watch room?')) {
                  onLeaveRoom();
                } else {
                  e.preventDefault();
                }
              }
            }}
            className="flex items-center gap-2.5 group"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-600 via-orange-500 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-950/40 group-hover:scale-105 transition-all duration-200 ring-1 ring-orange-400/30">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-slate-100 group-hover:text-white transition-colors">
                  WatchTogether
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] uppercase font-mono tracking-wider font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  P2P
                </span>
              </div>
              <p className="hidden md:block text-[11px] text-slate-400 -mt-0.5">
                Zero Cloud Storage • Direct Browser Streaming
              </p>
            </div>
          </a>
        </div>

        {/* Middle: Room Info & Connection Status */}
        <div className="flex items-center gap-3">
          {roomId && (
            <div className="flex items-center gap-1.5 bg-[#121212] border border-white/10 rounded-xl px-3 py-1.5 shadow-inner">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono font-medium">
                {role === 'host' ? 'Host' : 'Viewer'}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs font-mono text-slate-200 font-semibold">{roomId}</span>
              <button
                id="copy-room-id-nav"
                onClick={copyRoomLink}
                className="ml-1 p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                title="Copy Watch Link"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}

          <StatusBadge
            connectionState={connectionState}
            connectionPath={connectionPath}
            rttMs={rttMs}
            isHost={role === 'host'}
          />
        </div>

        {/* Right Actions: Privacy Notice & Diagnostics */}
        <div className="flex items-center gap-2">
          <button
            id="open-privacy-btn"
            onClick={onOpenPrivacy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-white/5 border border-white/5 hover:border-white/15 transition-all"
            title="Privacy Architecture"
          >
            <Shield className="w-3.5 h-3.5 text-orange-400" />
            <span className="hidden sm:inline">Privacy</span>
          </button>

          <button
            id="open-debug-btn"
            onClick={onOpenDebug}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-white/5 border border-white/5 hover:border-white/15 transition-all"
            title="WebRTC Diagnostics (?debug=true)"
          >
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Diagnostics</span>
          </button>

          {roomId && onLeaveRoom && (
            <button
              id="leave-room-btn"
              onClick={() => {
                if (window.confirm('Are you sure you want to leave this watch room?')) {
                  onLeaveRoom();
                }
              }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-800/40 transition-colors"
            >
              Exit
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
