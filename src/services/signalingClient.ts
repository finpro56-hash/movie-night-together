import {
  SignalingMessage,
  SignalingMessageType,
  ErrorCode,
  Role,
} from '../types/protocol';

export type SignalingEventHandler<T = any> = (payload: T) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Map<SignalingMessageType | 'open' | 'reconnected' | 'close' | 'ws_error', Set<SignalingEventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectTimer?: number;
  private isExplicitlyClosed = false;
  private pingTimer?: number;
  private hasConnectedBefore = false;
  private connecting = false;

  constructor(customUrl?: string) {
    if (customUrl) {
      this.url = customUrl;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.url = `${protocol}//${window.location.host}/ws`;
    }
  }

  public connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (this.ws?.readyState === WebSocket.CONNECTING && this.connecting) {
      return new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('Signaling connection timed out'));
        }, 10000);
        const onOpen = () => { cleanup(); resolve(); };
        const onClose = () => { cleanup(); reject(new Error('Signaling connection closed')); };
        const cleanup = () => {
          window.clearTimeout(timeout);
          this.listeners.get('open')?.delete(onOpen);
          this.listeners.get('close')?.delete(onClose);
        };
        this.on('open', onOpen);
        this.on('close', onClose);
      });
    }

    return new Promise((resolve, reject) => {
      this.isExplicitlyClosed = false;
      this.connecting = true;

      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        return reject(err);
      }

      this.ws.onopen = () => {
        this.connecting = false;
        const wasReconnected = this.hasConnectedBefore;
        this.hasConnectedBefore = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('open', {});
        if (wasReconnected) this.emit('reconnected', {});
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SignalingMessage;
          if (msg && msg.type) {
            this.emit(msg.type, msg.payload);
          }
        } catch (err) {
          console.error('[Signaling] Failed to parse message:', err);
        }
      };

      this.ws.onclose = (event) => {
        this.connecting = false;
        this.stopHeartbeat();
        this.emit('close', event);

        if (!this.isExplicitlyClosed && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 15000);
          console.warn(`[Signaling] Connection lost. Reconnecting attempt ${this.reconnectAttempts} in ${delay}ms...`);
          if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = undefined;
            if (!this.isExplicitlyClosed && !this.isConnected()) {
              this.connect().catch((e) => console.error('[Signaling] Reconnect failed:', e));
            }
          }, delay);
        }
      };

      this.ws.onerror = (error) => {
        this.emit('ws_error', error);
      };
    });
  }

  public on<T = any>(event: SignalingMessageType | 'open' | 'reconnected' | 'close' | 'ws_error', handler: SignalingEventHandler<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  private emit(event: string, payload: any): void {
    const handlers = this.listeners.get(event as any);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(payload);
        } catch (err) {
          console.error(`[Signaling] Error in event listener for ${event}:`, err);
        }
      });
    }
  }

  public send(message: SignalingMessage): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public createRoom(): void {
    this.send({ type: 'CREATE_ROOM', payload: {} });
  }

  public joinRoom(roomId: string): void {
    this.send({ type: 'JOIN_ROOM', payload: { roomId } });
  }

  public rejoinRoom(roomId: string, role: Role, hostToken?: string): void {
    this.send({ type: 'REJOIN_ROOM', payload: { roomId, role, hostToken } });
  }

  public sendHostReady(roomId: string, hostToken?: string): void {
    this.send({ type: 'HOST_READY', payload: { roomId, hostToken } });
  }

  public sendOffer(roomId: string, sdp: RTCSessionDescriptionInit, hostToken?: string): void {
    this.send({ type: 'OFFER', payload: { roomId, sdp, hostToken } });
  }

  public sendAnswer(roomId: string, sdp: RTCSessionDescriptionInit): void {
    this.send({ type: 'ANSWER', payload: { roomId, sdp } });
  }

  public sendIceCandidate(roomId: string, candidate: RTCIceCandidateInit, hostToken?: string): void {
    this.send({ type: 'ICE_CANDIDATE', payload: { roomId, candidate, hostToken } });
  }

  public sendPeerLeft(roomId: string, role: Role, reason?: string): void {
    this.send({ type: 'PEER_LEFT', payload: { roomId, role, reason } });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'PING', payload: { timestamp: Date.now() } });
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  public close(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
