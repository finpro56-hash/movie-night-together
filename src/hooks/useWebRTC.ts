import { useState, useEffect, useRef, useCallback } from 'react';
import { SignalingClient } from '../services/signalingClient';
import { WebRTCManager } from '../services/webrtcManager';
import { SyncManager } from '../services/syncManager';
import {
  Role,
  ConnectionState,
  DataChannelMessage,
  DCChatMessage,
  DCSyncMessage,
  WebRTCStatsReport,
  ErrorCode,
} from '../types/protocol';

export interface UseWebRTCOptions {
  roomId?: string;
  initialRole?: Role;
  onRemotePlay?: (time: number) => void;
  onRemotePause?: (time: number) => void;
  onRemoteSeek?: (time: number) => void;
  onRemoteRate?: (rate: number, time: number) => void;
  onRemoteSync?: (sync: DCSyncMessage, expectedTime: number) => void;
}

export interface UseWebRTCReturn {
  role: Role | null;
  roomId: string | null;
  hostToken: string | null;
  connectionState: ConnectionState;
  dataChannelState: RTCDataChannelState;
  remoteStream: MediaStream | null;
  stats: WebRTCStatsReport | null;
  chatMessages: DCChatMessage[];
  lastError: { code: ErrorCode; message: string } | null;
  isViewerConnected: boolean;
  createRoom: () => Promise<string>;
  joinRoom: (roomId: string) => Promise<void>;
  sendHostReady: () => void;
  attachLocalStream: (stream: MediaStream) => void;
  startOfferNegotiation: () => Promise<void>;
  sendChat: (text: string) => boolean;
  sendPlay: (time: number) => void;
  sendPause: (time: number) => void;
  sendSeek: (time: number) => void;
  sendRate: (rate: number, time: number) => void;
  sendSync: (state: 'playing' | 'paused' | 'buffering', time: number, playbackRate: number, duration?: number) => void;
  leaveRoom: () => void;
  clearError: () => void;
  syncManager: SyncManager;
}

export function useWebRTC(options: UseWebRTCOptions = {}): UseWebRTCReturn {
  const [role, setRole] = useState<Role | null>(options.initialRole || null);
  const [roomId, setRoomId] = useState<string | null>(options.roomId || null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('IDLE');
  const [dataChannelState, setDataChannelState] = useState<RTCDataChannelState>('closed');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [stats, setStats] = useState<WebRTCStatsReport | null>(null);
  const [chatMessages, setChatMessages] = useState<DCChatMessage[]>([]);
  const [lastError, setLastError] = useState<{ code: ErrorCode; message: string } | null>(null);
  const [isViewerConnected, setIsViewerConnected] = useState<boolean>(false);

  const signalingRef = useRef<SignalingClient | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const syncManagerRef = useRef<SyncManager>(new SyncManager());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Stash active roomId & hostToken in refs for event callbacks
  const activeRoomIdRef = useRef<string | null>(roomId);
  activeRoomIdRef.current = roomId;
  const activeHostTokenRef = useRef<string | null>(hostToken);
  activeHostTokenRef.current = hostToken;
  const activeRoleRef = useRef<Role | null>(role);
  const negotiationInFlightRef = useRef(false);
  const recoveryRequestTimerRef = useRef<number>();
  activeRoleRef.current = role;

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const handleDataChannelMessage = useCallback((msg: DataChannelMessage) => {
    switch (msg.type) {
      case 'CHAT':
        setChatMessages((prev) => [...prev, msg]);
        break;

      case 'PLAY':
        optionsRef.current.onRemotePlay?.(msg.time);
        break;

      case 'PAUSE':
        optionsRef.current.onRemotePause?.(msg.time);
        break;

      case 'SEEK':
        optionsRef.current.onRemoteSeek?.(msg.time);
        break;

      case 'RATE':
        optionsRef.current.onRemoteRate?.(msg.rate, msg.time);
        break;

      case 'SYNC': {
        const expected = syncManagerRef.current.calculateExpectedHostTime(msg);
        optionsRef.current.onRemoteSync?.(msg, expected);
        break;
      }

      case 'PING': {
        const pong = syncManagerRef.current.handlePing(msg);
        webrtcRef.current?.sendDataChannelMessage(pong);
        break;
      }

      case 'PONG': {
        const rtt = syncManagerRef.current.handlePong(msg);
        setStats((prev) => (prev ? { ...prev, rttMs: Math.round(rtt) } : null));
        break;
      }
    }
  }, []);

  // When the browser regains connectivity, proactively refresh ICE. This is
  // especially useful after Wi-Fi ↔ mobile-network transitions.
  useEffect(() => {
    const handleOnline = () => {
      if (activeRoleRef.current === 'host' && webrtcRef.current) {
        void webrtcRef.current.recoverConnection();
      } else if (activeRoleRef.current === 'viewer' && signalingRef.current && activeRoomIdRef.current) {
        if (recoveryRequestTimerRef.current) window.clearTimeout(recoveryRequestTimerRef.current);
        recoveryRequestTimerRef.current = window.setTimeout(() => {
          recoveryRequestTimerRef.current = undefined;
          signalingRef.current?.rejoinRoom(activeRoomIdRef.current!, 'viewer');
        }, 500);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Periodic PING over DataChannel for RTT calculation
  useEffect(() => {
    if (dataChannelState !== 'open') return;

    const pingInterval = window.setInterval(() => {
      if (webrtcRef.current?.isDataChannelOpen()) {
        const ping = syncManagerRef.current.createPing();
        webrtcRef.current.sendDataChannelMessage(ping);
      }
    }, 3000);

    return () => clearInterval(pingInterval);
  }, [dataChannelState]);

  const initWebRTC = useCallback((currentRole: Role) => {
    if (webrtcRef.current) {
      webrtcRef.current.close();
    }

    const webrtc = new WebRTCManager(currentRole, {
      onConnectionStateChange: (state) => {
        setConnectionState(state);
        if (state === 'RECONNECTING' || state === 'CONNECTING') setLastError(null);
        if (state === 'RECONNECTING' && currentRole === 'viewer' && signalingRef.current && activeRoomIdRef.current) {
          if (recoveryRequestTimerRef.current) window.clearTimeout(recoveryRequestTimerRef.current);
          recoveryRequestTimerRef.current = window.setTimeout(() => {
            recoveryRequestTimerRef.current = undefined;
            signalingRef.current?.rejoinRoom(activeRoomIdRef.current!, 'viewer');
          }, 500);
        }
      },
      onDataChannelStateChange: (dcState) => setDataChannelState(dcState),
      onDataChannelMessage: handleDataChannelMessage,
      onRemoteStream: (stream) => {
        setRemoteStream(new MediaStream(stream.getTracks()));
      },
      onIceCandidate: (candidate) => {
        if (activeRoomIdRef.current) {
          signalingRef.current?.sendIceCandidate(
            activeRoomIdRef.current,
            candidate,
            activeHostTokenRef.current || undefined
          );
        }
      },
      onStatsReport: (report) => setStats(report),
      onError: (code, message) => setLastError({ code, message }),
      onIceRestartOffer: (offer) => {
        const activeRoomId = activeRoomIdRef.current;
        if (activeRoomId && signalingRef.current && currentRole === 'host') {
          signalingRef.current.sendOffer(activeRoomId, offer, activeHostTokenRef.current || undefined);
        }
      },
    });

    webrtcRef.current = webrtc;
    return webrtc;
  }, [handleDataChannelMessage]);

  const initSignaling = useCallback(() => {
    if (!signalingRef.current) {
      signalingRef.current = new SignalingClient();
    }
    const sig = signalingRef.current;

    sig.on('open', () => {
      // Initial connection only. Reconnects are handled by the dedicated
      // 'reconnected' event so REJOIN_ROOM is sent exactly once.
    });

    sig.on('reconnected', async () => {
      const activeRoomId = activeRoomIdRef.current;
      const activeRole = activeRoleRef.current;
      if (!activeRoomId || !activeRole) return;

      setConnectionState('RECONNECTING');
      sig.rejoinRoom(activeRoomId, activeRole, activeHostTokenRef.current || undefined);
    });

    sig.on('ROOM_CREATED', (payload: { roomId: string; hostToken: string }) => {
      setRoomId(payload.roomId);
      setHostToken(payload.hostToken);
      setRole('host');
      setConnectionState('WAITING_FOR_VIEWER');
    });

    sig.on('ROOM_JOINED', async (payload: { roomId: string; role: 'viewer'; hostReady: boolean }) => {
      setRoomId(payload.roomId);
      setRole('viewer');
      setConnectionState('CONNECTING');
      const webrtc = initWebRTC('viewer');
      await webrtc.initialize();
    });

    sig.on('VIEWER_JOINED', async () => {
      setIsViewerConnected(true);
      setConnectionState('CONNECTING');

      // Every viewer join/rejoin is an opportunity to rebuild a stale WebRTC
      // session. Only the host creates the offer, preventing offer glare.
      if (activeRoleRef.current !== 'host' || negotiationInFlightRef.current) return;

      negotiationInFlightRef.current = true;
      try {
        const webrtc = webrtcRef.current || initWebRTC('host');
        await webrtc.initialize();
        const offer = await webrtc.createOffer();
        if (activeRoomIdRef.current) {
          sig.sendOffer(activeRoomIdRef.current, offer, activeHostTokenRef.current || undefined);
        }
      } catch (err) {
        console.error('[WebRTC] Reconnect negotiation failed:', err);
        setLastError({ code: 'WEBRTC_ERROR', message: 'Could not reconnect the watch session.' });
      } finally {
        negotiationInFlightRef.current = false;
      }
    });

    sig.on('HOST_READY', () => {
      console.log('[Signaling] Host is ready with media');
    });

    sig.on('OFFER', async (payload: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
      if (!webrtcRef.current) {
        initWebRTC('viewer');
      }
      try {
        const answer = await webrtcRef.current!.handleOfferAndCreateAnswer(payload.sdp);
        sig.sendAnswer(payload.roomId, answer);
      } catch (err: any) {
        console.error('[WebRTC] Offer handling error:', err);
        setLastError({ code: 'WEBRTC_ERROR', message: 'Failed to process host video stream' });
      }
    });

    sig.on('ANSWER', async (payload: { roomId: string; sdp: RTCSessionDescriptionInit }) => {
      try {
        await webrtcRef.current?.handleAnswer(payload.sdp);
      } catch (err: any) {
        console.error('[WebRTC] Answer handling error:', err);
        setLastError({ code: 'WEBRTC_ERROR', message: 'Failed to establish peer connection' });
      }
    });

    sig.on('ICE_CANDIDATE', async (payload: { candidate: RTCIceCandidateInit }) => {
      try {
        await webrtcRef.current?.addIceCandidate(payload.candidate);
      } catch (err) {
        console.warn('[WebRTC] Error adding ICE candidate:', err);
      }
    });

    sig.on('PEER_LEFT', (payload: { role: Role; reason?: string }) => {
      if (payload.role === 'host') {
        setConnectionState('DISCONNECTED');
        setLastError({
          code: 'CONNECTION_CLOSED',
          message: 'The Host has left the watch room.',
        });
        webrtcRef.current?.close();
      } else {
        setIsViewerConnected(false);
        setConnectionState('WAITING_FOR_VIEWER');
      }
    });

    sig.on('ERROR', (payload: { code: ErrorCode; message: string }) => {
      setLastError(payload);
      setConnectionState('ERROR');
    });

    return sig;
  }, [initWebRTC]);

  const createRoom = useCallback(async (): Promise<string> => {
    const sig = initSignaling();
    setConnectionState('CREATING_ROOM');
    if (!sig.isConnected()) {
      await sig.connect();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        createdUnsub();
        errUnsub();
      };
      const createdUnsub = sig.on('ROOM_CREATED', (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(payload.roomId);
      });
      const errUnsub = sig.on('ERROR', (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(err.message));
      });
      sig.createRoom();
    });
  }, [initSignaling]);

  const joinRoom = useCallback(async (targetRoomId: string): Promise<void> => {
    const sig = initSignaling();
    setConnectionState('JOINING_ROOM');
    if (!sig.isConnected()) {
      await sig.connect();
    }
    sig.joinRoom(targetRoomId);
  }, [initSignaling]);

  const sendHostReady = useCallback(() => {
    if (roomId && signalingRef.current) {
      signalingRef.current.sendHostReady(roomId, hostToken || undefined);
    }
  }, [roomId, hostToken]);

  const attachLocalStream = useCallback((stream: MediaStream) => {
    if (!webrtcRef.current) {
      initWebRTC('host');
    }
    webrtcRef.current?.addLocalStream(stream);
  }, [initWebRTC]);

  const startOfferNegotiation = useCallback(async () => {
    if (negotiationInFlightRef.current) return;
    negotiationInFlightRef.current = true;
    try {
      const webrtc = webrtcRef.current || initWebRTC('host');
      await webrtc.initialize();

      if (roomId && signalingRef.current) {
        const offer = await webrtc.createOffer();
        signalingRef.current.sendOffer(roomId, offer, hostToken || undefined);
      }
    } finally {
      negotiationInFlightRef.current = false;
    }
  }, [initWebRTC, roomId, hostToken]);

  const sendChat = useCallback((text: string): boolean => {
    if (!text.trim() || text.length > 500) return false;

    const chatMsg: DCChatMessage = {
      type: 'CHAT',
      id: Math.random().toString(36).substring(2, 9),
      sender: role || 'host',
      text: text.trim(),
      sentAt: Date.now(),
    };

    const sent = webrtcRef.current?.sendDataChannelMessage(chatMsg) || false;
    if (sent) {
      setChatMessages((prev) => [...prev, chatMsg]);
    }
    return sent;
  }, [role]);

  const sendPlay = useCallback((time: number) => {
    webrtcRef.current?.sendDataChannelMessage({
      type: 'PLAY',
      time,
      sentAt: Date.now(),
    });
  }, []);

  const sendPause = useCallback((time: number) => {
    webrtcRef.current?.sendDataChannelMessage({
      type: 'PAUSE',
      time,
      sentAt: Date.now(),
    });
  }, []);

  const sendSeek = useCallback((time: number) => {
    webrtcRef.current?.sendDataChannelMessage({
      type: 'SEEK',
      time,
      sentAt: Date.now(),
    });
  }, []);

  const sendRate = useCallback((rate: number, time: number) => {
    webrtcRef.current?.sendDataChannelMessage({
      type: 'RATE',
      rate,
      time,
      sentAt: Date.now(),
    });
  }, []);

  const sendSync = useCallback((state: 'playing' | 'paused' | 'buffering', time: number, playbackRate: number, duration?: number) => {
    webrtcRef.current?.sendDataChannelMessage({
      type: 'SYNC',
      state,
      time,
      playbackRate,
      duration,
      sentAt: Date.now(),
    });
  }, []);

  const leaveRoom = useCallback(() => {
    if (roomId && role && signalingRef.current) {
      signalingRef.current.sendPeerLeft(roomId, role, 'User navigated away');
    }
    signalingRef.current?.close();
    webrtcRef.current?.close();
    setConnectionState('CLOSED');
    setRoomId(null);
    setHostToken(null);
    setRemoteStream(null);
    setChatMessages([]);
  }, [roomId, role]);

  useEffect(() => {
    return () => {
      signalingRef.current?.close();
      webrtcRef.current?.close();
    };
  }, []);

  return {
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
    syncManager: syncManagerRef.current,
  };
}
