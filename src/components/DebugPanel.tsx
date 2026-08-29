import React, { useState } from 'react';
import { WebRTCStatsReport, Role, ConnectionState } from '../types/protocol';
import { X, Copy, Check, Terminal, Activity, Wifi, ShieldAlert, Cpu } from 'lucide-react';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string | null;
  role: Role | null;
  connectionState: ConnectionState;
  stats: WebRTCStatsReport | null;
  isCaptureSupported: boolean;
  driftMs?: number;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  isOpen,
  onClose,
  roomId,
  role,
  connectionState,
  stats,
  isCaptureSupported,
  driftMs = 0,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copyStatsJson = () => {
    const debugDump = {
      roomId,
      role,
      connectionState,
      isCaptureSupported,
      driftMs,
      stats,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };

    navigator.clipboard.writeText(JSON.stringify(debugDump, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      id="debug-diagnostics-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-[#141414] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-slate-100 font-mono">
              WebRTC Diagnostics & Telemetry
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="copy-debug-json-btn"
              onClick={copyStatsJson}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-mono rounded-xl border border-white/10 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied JSON' : 'Export JSON'}
            </button>
            <button
              id="close-debug-modal-btn"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs font-mono">
          {/* Section 1: Session & States */}
          <div>
            <h3 className="text-slate-400 text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5 font-bold">
              <Activity className="w-3.5 h-3.5 text-orange-400" />
              Session & State Machine
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#121212] p-3.5 rounded-xl border border-white/10">
              <div>
                <span className="text-slate-500 block text-[10px]">Room ID:</span>
                <span className="text-slate-200 font-semibold">{roomId || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Active Role:</span>
                <span className="text-orange-400 font-semibold">{role || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">App State:</span>
                <span className="text-emerald-400 font-semibold">{connectionState}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">DataChannel:</span>
                <span className={stats?.dataChannelState === 'open' ? 'text-emerald-400' : 'text-slate-400'}>
                  {stats?.dataChannelState || 'closed'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: ICE & Network Path */}
          <div>
            <h3 className="text-slate-400 text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5 font-bold">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              ICE Negotiation & Path Topology
            </h3>
            <div className="bg-[#121212] p-3.5 rounded-xl border border-white/10 space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-slate-500 block text-[10px]">Path Type:</span>
                  <span
                    className={`font-semibold ${
                      stats?.connectionPath === 'direct'
                        ? 'text-emerald-400'
                        : stats?.connectionPath === 'relay'
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {stats?.connectionPath === 'direct'
                      ? 'DIRECT P2P (Host / Srflx)'
                      : stats?.connectionPath === 'relay'
                      ? 'TURN RELAY'
                      : 'Detecting...'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">ICE Connection:</span>
                  <span className="text-slate-200">{stats?.iceConnectionState || 'uninitialized'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Signaling State:</span>
                  <span className="text-slate-200">{stats?.signalingState || 'uninitialized'}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/10">
                <div>
                  <span className="text-slate-500 block text-[10px]">Local Candidate:</span>
                  <span className="text-slate-300">
                    {stats?.localCandidateType ? `${stats.localCandidateType} (${stats.localCandidateProtocol || 'udp'})` : 'N/A'}
                  </span>
                  {stats?.localCandidateAddress && (
                    <span className="block text-slate-500 text-[10px] truncate">{stats.localCandidateAddress}</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Remote Candidate:</span>
                  <span className="text-slate-300">
                    {stats?.remoteCandidateType ? `${stats.remoteCandidateType} (${stats.remoteCandidateProtocol || 'udp'})` : 'N/A'}
                  </span>
                  {stats?.remoteCandidateAddress && (
                    <span className="block text-slate-500 text-[10px] truncate">{stats.remoteCandidateAddress}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Performance & RTP Metrics */}
          <div>
            <h3 className="text-slate-400 text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5 font-bold">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              Real-Time Metrics & RTP Telemetry
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#121212] p-3.5 rounded-xl border border-white/10">
              <div>
                <span className="text-slate-500 block text-[10px]">Round-Trip Time (RTT):</span>
                <span className="text-amber-400 font-semibold">{stats?.rttMs ? `${stats.rttMs} ms` : 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Bitrate:</span>
                <span className="text-orange-400 font-semibold">{stats?.bitrateKbps ? `${stats.bitrateKbps} kbps` : '0 kbps'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Packet Loss:</span>
                <span className={stats?.packetLossPercent && stats.packetLossPercent > 2 ? 'text-rose-400' : 'text-slate-200'}>
                  {stats?.packetLossPercent !== undefined ? `${stats.packetLossPercent}%` : '0%'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Sync Drift Offset:</span>
                <span className={Math.abs(driftMs) > 250 ? 'text-amber-400' : 'text-emerald-400'}>
                  {driftMs ? `${Math.round(driftMs)} ms` : '0 ms'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block text-[10px]">Frames Decoded:</span>
                <span className="text-slate-300">{stats?.framesDecoded || 0}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Frames Dropped:</span>
                <span className={stats?.framesDropped ? 'text-rose-400' : 'text-slate-300'}>
                  {stats?.framesDropped || 0}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Audio Jitter:</span>
                <span className="text-slate-300">{stats?.audioJitterMs ? `${stats.audioJitterMs} ms` : '0 ms'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Video Jitter:</span>
                <span className="text-slate-300">{stats?.videoJitterMs ? `${stats.videoJitterMs} ms` : '0 ms'}</span>
              </div>
            </div>
          </div>

          {/* Section 4: Browser Capabilities */}
          <div>
            <h3 className="text-slate-400 text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5 font-bold">
              <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
              Browser Media Capabilities
            </h3>
            <div className="bg-[#121212] p-3.5 rounded-xl border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-slate-200 font-semibold block">HTMLMediaElement.captureStream()</span>
                <span className="text-slate-400 text-[11px]">
                  Required by Host browser to capture local video playback directly into WebRTC MediaStream.
                </span>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  isCaptureSupported
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                    : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                }`}
              >
                {isCaptureSupported ? 'SUPPORTED' : 'UNSUPPORTED'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
