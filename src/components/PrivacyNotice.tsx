import React from 'react';
import { X, ShieldCheck, HardDrive, Lock, Server, Radio } from 'lucide-react';

interface PrivacyNoticeProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyNotice: React.FC<PrivacyNoticeProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      id="privacy-notice-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="bg-[#0d0d0d] border border-white/10 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-[#141414] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Privacy & Security Architecture
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm text-slate-300 leading-relaxed">
          <div className="flex gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center text-emerald-400 shadow-sm">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-100">Zero Cloud Movie Uploads</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Your video file stays strictly on the Host's local machine. The movie is never uploaded to any server, cloud storage, or CDN.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-orange-950/80 border border-orange-800/60 flex items-center justify-center text-orange-400 shadow-sm">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-100">Direct Browser-to-Browser WebRTC</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Video and audio frames captured via HTMLMediaElement are transmitted directly between browsers over encrypted DTLS/SRTP WebRTC channels.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-amber-950/80 border border-amber-800/60 flex items-center justify-center text-amber-400 shadow-sm">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-100">Signaling Server Scope</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                The signaling server is strictly used for room coordination and exchanging WebRTC session descriptions (SDP) and ICE candidates. It never receives, proxies, or inspects video data.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-blue-950/80 border border-blue-800/60 flex items-center justify-center text-blue-400 shadow-sm">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-100">TURN Relay Fallback</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                If direct peer-to-peer connection is prevented by restrictive symmetric NATs or corporate firewalls, encrypted media packets pass through the configured TURN relay server.
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-orange-950/40 cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
