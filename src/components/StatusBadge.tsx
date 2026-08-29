import React from 'react';
import { ConnectionState, ConnectionPathType } from '../types/protocol';
import { ShieldCheck, Zap, Radio, AlertCircle } from 'lucide-react';

interface StatusBadgeProps {
  connectionState: ConnectionState;
  connectionPath: ConnectionPathType;
  rttMs?: number;
  isHost?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  connectionState,
  connectionPath,
  rttMs = 0,
}) => {
  if (connectionState === 'CONNECTED') {
    if (connectionPath === 'direct') {
      return (
        <div
          id="status-badge-direct"
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 text-xs font-medium tracking-wide shadow-sm"
          title="Direct P2P: Video and audio flow directly between browsers with zero intermediary server relay."
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-emerald-400" />
            Direct P2P
          </span>
          {rttMs > 0 && <span className="text-emerald-500/80 font-mono text-[11px]">({rttMs}ms)</span>}
        </div>
      );
    }

    if (connectionPath === 'relay') {
      return (
        <div
          id="status-badge-relay"
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/30 text-amber-400 text-xs font-medium tracking-wide shadow-sm"
          title="TURN Relay: Direct P2P could not traverse NAT/Firewall. Encrypted media flows via configured TURN relay."
        >
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <span className="flex items-center gap-1">
            <Radio className="w-3 h-3 text-amber-400" />
            TURN Relay
          </span>
          {rttMs > 0 && <span className="text-amber-500/80 font-mono text-[11px]">({rttMs}ms)</span>}
        </div>
      );
    }

    return (
      <div
        id="status-badge-connected"
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-500/30 text-blue-400 text-xs font-medium"
      >
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        Connected
      </div>
    );
  }

  if (connectionState === 'WAITING_FOR_VIEWER') {
    return (
      <div
        id="status-badge-waiting"
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-medium"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        Waiting for friend to join
      </div>
    );
  }

  if (connectionState === 'CONNECTING' || connectionState === 'NEGOTIATING' || connectionState === 'JOINING_ROOM') {
    return (
      <div
        id="status-badge-negotiating"
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/30 text-amber-300 text-xs font-medium"
      >
        <span className="animate-spin inline-block h-2 w-2 border border-amber-400 border-t-transparent rounded-full"></span>
        Establishing WebRTC...
      </div>
    );
  }

  if (connectionState === 'RECONNECTING') {
    return (
      <div
        id="status-badge-reconnecting"
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/80 border border-orange-500/30 text-orange-300 text-xs font-medium"
      >
        <span className="animate-spin inline-block h-2 w-2 border border-orange-400 border-t-transparent rounded-full"></span>
        Reconnecting stream...
      </div>
    );
  }

  if (connectionState === 'ERROR' || connectionState === 'DISCONNECTED') {
    return (
      <div
        id="status-badge-disconnected"
        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-500/30 text-rose-300 text-xs font-medium"
      >
        <AlertCircle className="w-3 h-3 text-rose-400" />
        {connectionState === 'DISCONNECTED' ? 'Peer Disconnected' : 'Connection Error'}
      </div>
    );
  }

  return (
    <div
      id="status-badge-idle"
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs"
    >
      <ShieldCheck className="w-3 h-3 text-slate-400" />
      Private P2P
    </div>
  );
};
