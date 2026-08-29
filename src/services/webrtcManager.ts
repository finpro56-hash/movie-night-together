import {
  Role,
  ConnectionState,
  ConnectionPathType,
  DataChannelMessage,
  WebRTCStatsReport,
  ErrorCode,
} from '../types/protocol';

export interface WebRTCCallbacks {
  onConnectionStateChange: (state: ConnectionState) => void;
  onDataChannelStateChange: (state: RTCDataChannelState) => void;
  onDataChannelMessage: (message: DataChannelMessage) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onStatsReport: (stats: WebRTCStatsReport) => void;
  onError: (code: ErrorCode, message: string) => void;
  onIceRestartOffer?: (offer: RTCSessionDescriptionInit) => void;
}

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private remoteStream: MediaStream = new MediaStream();
  private role: Role;
  private callbacks: WebRTCCallbacks;
  private iceCandidateQueue: RTCIceCandidateInit[] = [];
  private statsInterval?: number;
  private isRemoteDescriptionSet = false;
  private isClosed = false;
  private localStream: MediaStream | null = null;
  private reconnectTimer?: number;
  private iceRestartInFlight = false;

  // Track previous stats to calculate bitrates
  private prevBytesReceived = 0;
  private prevBytesSent = 0;
  private prevStatsTimestamp = 0;

  constructor(role: Role, callbacks: WebRTCCallbacks) {
    this.role = role;
    this.callbacks = callbacks;
  }

  /**
   * Initializes RTCPeerConnection with ICE servers
   */
  public async initialize(iceServers?: RTCIceServer[], force = false): Promise<RTCPeerConnection> {
    // IMPORTANT: initialization is idempotent. Re-initializing here used to
    // destroy the captured host stream immediately before offer creation.
    if (this.pc && !this.isClosed && !force) {
      return this.pc;
    }

    if (force) {
      this.close(false);
    }

    this.isClosed = false;
    this.isRemoteDescriptionSet = false;
    this.iceCandidateQueue = [];
    this.remoteStream = new MediaStream();

    let servers = iceServers;
    if (!servers || servers.length === 0) {
      try {
        const res = await fetch('/api/ice-servers');
        if (res.ok) {
          const data = await res.json();
          servers = data.iceServers;
        }
      } catch (err) {
        console.warn('[WebRTC] Could not fetch server ICE config, using default Google STUN:', err);
        servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
      }
    }

    const rtcConfig: RTCConfiguration = {
      iceServers: servers || [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
      iceCandidatePoolSize: 2,
    };

    this.pc = new RTCPeerConnection(rtcConfig);

    this.setupPeerConnectionEvents();

    // Re-attach a previously captured stream after an ICE restart/reconnect.
    if (this.localStream) {
      this.addLocalStream(this.localStream);
    }

    if (this.role === 'host') {
      this.createHostDataChannel();
    } else {
      this.setupViewerDataChannelListener();
    }

    this.startStatsPolling();

    return this.pc;
  }

  private setupPeerConnectionEvents(): void {
    if (!this.pc) return;

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.callbacks.onIceCandidate(event.candidate.toJSON());
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      const iceState = this.pc.iceConnectionState;
      console.log(`[WebRTC] ICE Connection State: ${iceState}`);

      if (iceState === 'connected' || iceState === 'completed') {
        this.callbacks.onConnectionStateChange('CONNECTED');
      } else if (iceState === 'checking') {
        this.callbacks.onConnectionStateChange('CONNECTING');
      } else if (iceState === 'disconnected') {
        this.callbacks.onConnectionStateChange('RECONNECTING');
      } else if (iceState === 'failed') {
        this.callbacks.onConnectionStateChange('RECONNECTING');
        this.callbacks.onError('ICE_FAILED', 'WebRTC ICE connection failed. Attempting ICE restart.');
        void this.restartIce();
      } else if (iceState === 'closed') {
        this.callbacks.onConnectionStateChange('CLOSED');
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const state = this.pc.connectionState;
      console.log(`[WebRTC] Connection State: ${state}`);

      if (state === 'connected') {
        this.callbacks.onConnectionStateChange('CONNECTED');
      } else if (state === 'connecting') {
        this.callbacks.onConnectionStateChange('CONNECTING');
      } else if (state === 'disconnected') {
        this.callbacks.onConnectionStateChange('RECONNECTING');
      } else if (state === 'failed') {
        this.callbacks.onConnectionStateChange('RECONNECTING');
        this.callbacks.onError('WEBRTC_ERROR', 'Peer connection failed. Attempting recovery.');
        void this.restartIce();
      } else if (state === 'closed') {
        this.callbacks.onConnectionStateChange('CLOSED');
      }
    };

    this.pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote track: kind=${event.track.kind}, id=${event.track.id}`);
      this.remoteStream.addTrack(event.track);
      this.callbacks.onRemoteStream(this.remoteStream);
    };
  }

  private createHostDataChannel(): void {
    if (!this.pc) return;

    try {
      this.dataChannel = this.pc.createDataChannel('watch-control', {
        ordered: true,
      });
      this.bindDataChannelEvents(this.dataChannel);
    } catch (err) {
      console.error('[WebRTC] Failed to create data channel:', err);
    }
  }

  private setupViewerDataChannelListener(): void {
    if (!this.pc) return;

    this.pc.ondatachannel = (event) => {
      console.log(`[WebRTC] Received remote DataChannel: ${event.channel.label}`);
      this.dataChannel = event.channel;
      this.bindDataChannelEvents(this.dataChannel);
    };
  }

  private bindDataChannelEvents(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log('[WebRTC] DataChannel open');
      this.callbacks.onDataChannelStateChange('open');
    };

    channel.onclose = () => {
      console.log('[WebRTC] DataChannel closed');
      this.callbacks.onDataChannelStateChange('closed');
    };

    channel.onerror = (err) => {
      console.error('[WebRTC] DataChannel error:', err);
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DataChannelMessage;
        if (data && data.type) {
          this.callbacks.onDataChannelMessage(data);
        }
      } catch (e) {
        console.error('[WebRTC] Error parsing DataChannel message:', e);
      }
    };
  }

  /**
   * Adds tracks from a captured local MediaStream
   */
  public addLocalStream(stream: MediaStream): void {
    this.localStream = stream;
    if (!this.pc) return;

    const currentSenders = this.pc.getSenders();
    stream.getTracks().forEach((track) => {
      const existingSender = currentSenders.find((s) => s.track && s.track.kind === track.kind);
      if (existingSender) {
        existingSender.replaceTrack(track);
      } else {
        this.pc?.addTrack(track, stream);
      }
    });
  }

  /**
   * Host: Creates and sets local SDP offer
   */
  public async createOffer(options: RTCOfferOptions = {}): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('RTCPeerConnection not initialized');

    this.callbacks.onConnectionStateChange('NEGOTIATING');

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
      ...options,
    });

    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Attempts an ICE restart without discarding the captured media stream.
   * The caller must forward the returned offer through signaling.
   */
  public async restartIce(): Promise<RTCSessionDescriptionInit | null> {
    if (this.role !== 'host' || !this.pc || this.iceRestartInFlight || this.isClosed) return null;
    if (!this.pc.remoteDescription) return null;

    this.iceRestartInFlight = true;
    try {
      this.callbacks.onConnectionStateChange('RECONNECTING');
      const offer = await this.createOffer({ iceRestart: true });
      this.callbacks.onIceRestartOffer?.(offer);
      return offer;
    } catch (err) {
      console.error('[WebRTC] ICE restart failed:', err);
      this.callbacks.onError('ICE_FAILED', 'Unable to restart the WebRTC connection.');
      return null;
    } finally {
      this.iceRestartInFlight = false;
    }
  }

  /**
   * Viewer: Handles SDP offer and creates SDP answer
   */
  public async handleOfferAndCreateAnswer(offerSdp: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('RTCPeerConnection not initialized');

    this.callbacks.onConnectionStateChange('NEGOTIATING');

    await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    this.isRemoteDescriptionSet = true;
    await this.flushIceCandidateQueue();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    return answer;
  }

  /**
   * Host: Handles SDP answer from viewer
   */
  public async handleAnswer(answerSdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return;

    await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
    this.isRemoteDescriptionSet = true;
    await this.flushIceCandidateQueue();
  }

  /**
   * Handles incoming trickle ICE candidate
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;

    if (!this.isRemoteDescriptionSet) {
      this.iceCandidateQueue.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('[WebRTC] Error adding ICE candidate:', err);
    }
  }

  private async flushIceCandidateQueue(): Promise<void> {
    if (!this.pc || !this.isRemoteDescriptionSet) return;

    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn('[WebRTC] Error adding queued ICE candidate:', err);
        }
      }
    }
  }

  /**
   * Sends structured message over WebRTC DataChannel
   */
  public sendDataChannelMessage(msg: DataChannelMessage): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  /**
   * Polls WebRTC statistics (getStats) every second
   */
  private startStatsPolling(): void {
    this.stopStatsPolling();

    this.statsInterval = window.setInterval(async () => {
      if (!this.pc || this.isClosed) return;

      try {
        const stats = await this.pc.getStats();
        let connectionPath: ConnectionPathType = 'unknown';
        let localCandidateType: string | undefined;
        let remoteCandidateType: string | undefined;
        let localCandidateProtocol: string | undefined;
        let remoteCandidateProtocol: string | undefined;
        let localCandidateAddress: string | undefined;
        let remoteCandidateAddress: string | undefined;

        let rttMs = 0;
        let bitrateKbps = 0;
        let packetsSent = 0;
        let packetsReceived = 0;
        let packetLossPercent = 0;
        let framesDecoded = 0;
        let framesDropped = 0;
        let framesSent = 0;
        let audioJitterMs = 0;
        let videoJitterMs = 0;

        let totalBytesReceived = 0;
        let totalBytesSent = 0;
        let totalPacketsLost = 0;
        let totalPacketsExpected = 0;

        // Traverse stats entries
        stats.forEach((report) => {
          // Selected candidate pair
          if (report.type === 'candidate-pair' && (report.selected || report.nominated || report.state === 'succeeded')) {
            if (typeof report.currentRoundTripTime === 'number') {
              rttMs = Math.round(report.currentRoundTripTime * 1000);
            }

            // Find local candidate
            const localCand = stats.get(report.localCandidateId);
            if (localCand) {
              localCandidateType = localCand.candidateType;
              localCandidateProtocol = localCand.protocol;
              localCandidateAddress = `${localCand.ip || localCand.address}:${localCand.port}`;

              if (localCand.candidateType === 'relay') {
                connectionPath = 'relay';
              } else if (localCand.candidateType === 'host' || localCand.candidateType === 'srflx' || localCand.candidateType === 'prflx') {
                connectionPath = 'direct';
              }
            }

            // Find remote candidate
            const remoteCand = stats.get(report.remoteCandidateId);
            if (remoteCand) {
              remoteCandidateType = remoteCand.candidateType;
              remoteCandidateProtocol = remoteCand.protocol;
              remoteCandidateAddress = `${remoteCand.ip || remoteCand.address}:${remoteCand.port}`;

              if (remoteCand.candidateType === 'relay' && connectionPath !== 'relay') {
                connectionPath = 'relay';
              }
            }
          }

          // Inbound RTP (Viewer side)
          if (report.type === 'inbound-rtp') {
            if (typeof report.bytesReceived === 'number') {
              totalBytesReceived += report.bytesReceived;
            }
            if (typeof report.packetsReceived === 'number') {
              packetsReceived += report.packetsReceived;
            }
            if (typeof report.packetsLost === 'number') {
              totalPacketsLost += report.packetsLost;
            }
            if (typeof report.framesDecoded === 'number') {
              framesDecoded += report.framesDecoded;
            }
            if (typeof report.framesDropped === 'number') {
              framesDropped += report.framesDropped;
            }
            if (report.kind === 'audio' && typeof report.jitter === 'number') {
              audioJitterMs = Math.round(report.jitter * 1000);
            }
            if (report.kind === 'video' && typeof report.jitter === 'number') {
              videoJitterMs = Math.round(report.jitter * 1000);
            }
          }

          // Outbound RTP (Host side)
          if (report.type === 'outbound-rtp') {
            if (typeof report.bytesSent === 'number') {
              totalBytesSent += report.bytesSent;
            }
            if (typeof report.packetsSent === 'number') {
              packetsSent += report.packetsSent;
            }
            if (typeof report.framesSent === 'number') {
              framesSent += report.framesSent;
            }
          }
        });

        // Compute bitrate
        const now = Date.now();
        if (this.prevStatsTimestamp > 0) {
          const deltaSec = (now - this.prevStatsTimestamp) / 1000;
          if (deltaSec > 0) {
            if (this.role === 'viewer') {
              const deltaBytes = totalBytesReceived - this.prevBytesReceived;
              bitrateKbps = Math.max(0, Math.round(((deltaBytes * 8) / deltaSec) / 1000));
            } else {
              const deltaBytes = totalBytesSent - this.prevBytesSent;
              bitrateKbps = Math.max(0, Math.round(((deltaBytes * 8) / deltaSec) / 1000));
            }
          }
        }

        this.prevBytesReceived = totalBytesReceived;
        this.prevBytesSent = totalBytesSent;
        this.prevStatsTimestamp = now;

        // Packet loss calculation
        totalPacketsExpected = packetsReceived + totalPacketsLost;
        if (totalPacketsExpected > 0 && totalPacketsLost > 0) {
          packetLossPercent = Math.min(100, Math.round((totalPacketsLost / totalPacketsExpected) * 1000) / 10);
        }

        const report: WebRTCStatsReport = {
          timestamp: now,
          connectionState: this.pc.connectionState || 'uninitialized',
          iceConnectionState: this.pc.iceConnectionState || 'uninitialized',
          signalingState: this.pc.signalingState || 'uninitialized',
          dataChannelState: this.dataChannel ? this.dataChannel.readyState : 'closed',
          connectionPath,
          localCandidateType,
          remoteCandidateType,
          localCandidateProtocol,
          remoteCandidateProtocol,
          localCandidateAddress,
          remoteCandidateAddress,
          rttMs,
          bitrateKbps,
          packetsSent,
          packetsReceived,
          packetLossPercent,
          framesDecoded,
          framesDropped,
          framesSent,
          audioJitterMs,
          videoJitterMs,
          syncOffsetMs: 0,
        };

        this.callbacks.onStatsReport(report);
      } catch (err) {
        // Ignore background stats errors
      }
    }, 1000);
  }

  private stopStatsPolling(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = undefined;
    }
  }

  public isDataChannelOpen(): boolean {
    return this.dataChannel !== null && this.dataChannel.readyState === 'open';
  }

  public close(clearLocalStream = true): void {
    this.isClosed = true;
    this.stopStatsPolling();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {}
      this.dataChannel = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch {}
      this.pc = null;
    }

    this.remoteStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    this.remoteStream = new MediaStream();
    if (clearLocalStream) {
      this.localStream = null;
    }
  }
}
