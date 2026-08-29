/**
 * Protocol Definitions for WatchTogether
 * Strongly typed signaling & DataChannel schemas
 */

export type Role = 'host' | 'viewer';

export type ConnectionState =
  | 'IDLE'
  | 'CREATING_ROOM'
  | 'WAITING_FOR_VIEWER'
  | 'JOINING_ROOM'
  | 'NEGOTIATING'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED'
  | 'CLOSED'
  | 'ERROR';

export type ConnectionPathType = 'direct' | 'relay' | 'unknown';

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'INVALID_ROOM'
  | 'INVALID_MESSAGE'
  | 'HOST_NOT_READY'
  | 'SIGNALING_ERROR'
  | 'WEBRTC_ERROR'
  | 'ICE_FAILED'
  | 'TURN_FAILED'
  | 'MEDIA_UNSUPPORTED'
  | 'CAPTURE_UNSUPPORTED'
  | 'PLAYBACK_BLOCKED'
  | 'NETWORK_UNSTABLE'
  | 'CONNECTION_CLOSED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED';

// ==========================================
// Signaling Message Types (Client <-> Server)
// ==========================================

export type SignalingMessageType =
  | 'CREATE_ROOM'
  | 'ROOM_CREATED'
  | 'JOIN_ROOM'
  | 'REJOIN_ROOM'
  | 'ROOM_JOINED'
  | 'VIEWER_JOINED'
  | 'HOST_READY'
  | 'OFFER'
  | 'ANSWER'
  | 'ICE_CANDIDATE'
  | 'PEER_LEFT'
  | 'ROOM_CLOSED'
  | 'ERROR'
  | 'PING'
  | 'PONG';

export interface CreateRoomMessage {
  type: 'CREATE_ROOM';
  payload?: Record<string, never>;
}

export interface RoomCreatedMessage {
  type: 'ROOM_CREATED';
  payload: {
    roomId: string;
    hostToken: string;
    expiresAt: number;
  };
}

export interface JoinRoomMessage {
  type: 'JOIN_ROOM';
  payload: {
    roomId: string;
  };
}

export interface RejoinRoomMessage {
  type: 'REJOIN_ROOM';
  payload: {
    roomId: string;
    role: Role;
    hostToken?: string;
  };
}

export interface RoomJoinedMessage {
  type: 'ROOM_JOINED';
  payload: {
    roomId: string;
    role: 'viewer';
    hostReady: boolean;
  };
}

export interface ViewerJoinedMessage {
  type: 'VIEWER_JOINED';
  payload: {
    roomId: string;
  };
}

export interface HostReadyMessage {
  type: 'HOST_READY';
  payload: {
    roomId: string;
    hostToken?: string;
  };
}

export interface OfferMessage {
  type: 'OFFER';
  payload: {
    roomId: string;
    sdp: RTCSessionDescriptionInit;
    hostToken?: string;
  };
}

export interface AnswerMessage {
  type: 'ANSWER';
  payload: {
    roomId: string;
    sdp: RTCSessionDescriptionInit;
  };
}

export interface IceCandidateMessage {
  type: 'ICE_CANDIDATE';
  payload: {
    roomId: string;
    candidate: RTCIceCandidateInit;
    hostToken?: string;
  };
}

export interface PeerLeftMessage {
  type: 'PEER_LEFT';
  payload: {
    roomId: string;
    role: Role;
    reason?: string;
  };
}

export interface RoomClosedMessage {
  type: 'ROOM_CLOSED';
  payload: {
    roomId: string;
    reason: string;
  };
}

export interface ErrorMessage {
  type: 'ERROR';
  payload: {
    code: ErrorCode;
    message: string;
  };
}

export interface PingMessage {
  type: 'PING';
  payload: {
    timestamp: number;
  };
}

export interface PongMessage {
  type: 'PONG';
  payload: {
    timestamp: number;
    serverTime: number;
  };
}

export type SignalingMessage =
  | CreateRoomMessage
  | RoomCreatedMessage
  | JoinRoomMessage
  | RejoinRoomMessage
  | RoomJoinedMessage
  | ViewerJoinedMessage
  | HostReadyMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | PeerLeftMessage
  | RoomClosedMessage
  | ErrorMessage
  | PingMessage
  | PongMessage;

// ==========================================
// DataChannel Message Types (Peer <-> Peer)
// Channel name: "watch-control"
// ==========================================

export type DataChannelMessageType =
  | 'PLAY'
  | 'PAUSE'
  | 'SEEK'
  | 'SYNC'
  | 'RATE'
  | 'CHAT'
  | 'PING'
  | 'PONG'
  | 'READY';

export interface DCPlayMessage {
  type: 'PLAY';
  time: number;
  sentAt: number;
}

export interface DCPauseMessage {
  type: 'PAUSE';
  time: number;
  sentAt: number;
}

export interface DCSeekMessage {
  type: 'SEEK';
  time: number;
  sentAt: number;
}

export interface DCRateMessage {
  type: 'RATE';
  rate: number;
  time: number;
  sentAt: number;
}

export interface DCSyncMessage {
  type: 'SYNC';
  state: 'playing' | 'paused' | 'buffering';
  time: number;
  playbackRate: number;
  duration?: number;
  sentAt: number;
}

export interface DCChatMessage {
  type: 'CHAT';
  id: string;
  sender: Role;
  text: string;
  sentAt: number;
}

export interface DCPingMessage {
  type: 'PING';
  id: string;
  sentAt: number;
}

export interface DCPongMessage {
  type: 'PONG';
  id: string;
  pingSentAt: number;
  pongSentAt: number;
}

export interface DCReadyMessage {
  type: 'READY';
  role: Role;
  ready: boolean;
  metadata?: {
    fileName?: string;
    duration?: number;
  };
}

export type DataChannelMessage =
  | DCPlayMessage
  | DCPauseMessage
  | DCSeekMessage
  | DCRateMessage
  | DCSyncMessage
  | DCChatMessage
  | DCPingMessage
  | DCPongMessage
  | DCReadyMessage;

// ==========================================
// Diagnostics & WebRTC Statistics
// ==========================================

export interface WebRTCStatsReport {
  timestamp: number;
  connectionState: RTCPeerConnectionState | 'uninitialized';
  iceConnectionState: RTCIceConnectionState | 'uninitialized';
  signalingState: RTCSignalingState | 'uninitialized';
  dataChannelState: RTCDataChannelState | 'closed';
  connectionPath: ConnectionPathType;
  localCandidateType?: string;
  remoteCandidateType?: string;
  localCandidateProtocol?: string;
  remoteCandidateProtocol?: string;
  localCandidateAddress?: string;
  remoteCandidateAddress?: string;
  rttMs: number;
  bitrateKbps: number;
  packetsSent: number;
  packetsReceived: number;
  packetLossPercent: number;
  framesDecoded: number;
  framesDropped: number;
  framesSent: number;
  audioJitterMs: number;
  videoJitterMs: number;
  syncOffsetMs: number;
}
