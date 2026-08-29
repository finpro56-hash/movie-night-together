import type { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { RoomManager } from './rooms';
import { validateSignalingMessage } from './protocol';
import { RateLimiter } from './rateLimit';
import {
  SignalingMessage,
  RoomCreatedMessage,
  RoomJoinedMessage,
  ViewerJoinedMessage,
  HostReadyMessage,
  OfferMessage,
  AnswerMessage,
  IceCandidateMessage,
  PeerLeftMessage,
  RoomClosedMessage,
  ErrorMessage,
  PongMessage,
} from '../src/types/protocol';

interface ExtendedWebSocket extends WebSocket {
  isAlive: boolean;
  clientIp: string;
}

export function setupWebSocketServer(httpServer: HTTPServer, roomManager: RoomManager) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024, // 64 KB maximum for signaling payload
  });

  const rateWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
  const rateMaxMessages = Number(process.env.RATE_LIMIT_MAX_MESSAGES || 200);
  const rateLimiter = new RateLimiter(rateWindowMs, rateMaxMessages);

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Handle HTTP upgrade on /ws endpoint
  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;

    if (pathname === '/ws') {
      const origin = request.headers.origin;
      if (allowedOrigins[0] !== '*' && origin && !allowedOrigins.includes(origin)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  function sendJson(ws: WebSocket, message: SignalingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function sendError(ws: WebSocket, code: any, detail: string): void {
    const errorMsg: ErrorMessage = {
      type: 'ERROR',
      payload: { code, message: detail },
    };
    sendJson(ws, errorMsg);
  }

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const ws = socket as ExtendedWebSocket;
    ws.isAlive = true;

    const forwarded = request.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.socket.remoteAddress || '127.0.0.1';
    ws.clientIp = ip;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        // Enforce strict security requirement: No binary media streams allowed over signaling
        sendError(ws, 'INVALID_MESSAGE', 'Binary data is not allowed over signaling server');
        return;
      }

      // Check rate limit
      if (!rateLimiter.isAllowed(ws.clientIp)) {
        sendError(ws, 'RATE_LIMITED', 'Too many requests. Please slow down.');
        return;
      }

      const text = data.toString('utf-8');
      const validation = validateSignalingMessage(text);

      if (!validation.valid || !validation.message) {
        sendError(ws, validation.errorCode || 'INVALID_MESSAGE', validation.errorDetail || 'Invalid message');
        return;
      }

      const msg = validation.message;

      switch (msg.type) {
        case 'CREATE_ROOM': {
          const { room, hostToken } = roomManager.createRoom(ws);
          const response: RoomCreatedMessage = {
            type: 'ROOM_CREATED',
            payload: {
              roomId: room.id,
              hostToken,
              expiresAt: room.createdAt + 24 * 60 * 60 * 1000,
            },
          };
          sendJson(ws, response);
          break;
        }

        case 'REJOIN_ROOM': {
          const { roomId, role, hostToken } = msg.payload;
          const result = roomManager.rejoinRoom(roomId, ws, role, hostToken);
          if (result.success === false) {
            sendError(
              ws,
              result.error,
              result.error === 'ROOM_NOT_FOUND'
                ? 'Room expired or no longer exists.'
                : result.error === 'UNAUTHORIZED'
                ? 'Invalid host capability token.'
                : 'The room already has an active peer in that role.'
            );
            return;
          }

          const room = result.room;
          const response: RoomJoinedMessage = {
            type: 'ROOM_JOINED',
            payload: { roomId: room.id, role: 'viewer', hostReady: room.hostReady },
          };
          if (role === 'viewer') {
            sendJson(ws, response);
            if (room.host?.ws && room.host.ws !== ws) {
              sendJson(room.host.ws, { type: 'VIEWER_JOINED', payload: { roomId: room.id } });
            }
          } else if (room.viewer?.ws) {
            sendJson(room.viewer.ws, { type: 'VIEWER_JOINED', payload: { roomId: room.id } });
            sendJson(ws, { type: 'HOST_READY', payload: { roomId: room.id } });
          }
          break;
        }

        case 'JOIN_ROOM': {
          const { roomId } = msg.payload;
          const result = roomManager.joinRoom(roomId, ws);

          if (result.success === false) {
            sendError(
              ws,
              result.error,
              result.error === 'ROOM_FULL'
                ? 'This watch room already has a viewer. Only one viewer is allowed.'
                : 'Room not found. Please verify the invitation link.'
            );
            return;
          }

          const room = result.room;
          // Notify viewer they joined successfully
          const response: RoomJoinedMessage = {
            type: 'ROOM_JOINED',
            payload: {
              roomId: room.id,
              role: 'viewer',
              hostReady: room.hostReady,
            },
          };
          sendJson(ws, response);

          // Notify host that a viewer has joined
          if (room.host?.ws) {
            const viewerJoined: ViewerJoinedMessage = {
              type: 'VIEWER_JOINED',
              payload: { roomId: room.id },
            };
            sendJson(room.host.ws, viewerJoined);
          }
          break;
        }

        case 'HOST_READY': {
          const { roomId, hostToken } = msg.payload;
          const room = roomManager.getRoom(roomId);
          if (!room) {
            sendError(ws, 'ROOM_NOT_FOUND', 'Room not found');
            return;
          }

          if (!roomManager.isAuthorizedHost(roomId, ws, hostToken)) {
            sendError(ws, 'UNAUTHORIZED', 'Unauthorized: Only the host can declare ready status');
            return;
          }

          roomManager.setHostReady(roomId, true);

          if (room.viewer?.ws) {
            const hostReadyMsg: HostReadyMessage = {
              type: 'HOST_READY',
              payload: { roomId: room.id },
            };
            sendJson(room.viewer.ws, hostReadyMsg);
          }
          break;
        }

        case 'OFFER': {
          const { roomId, sdp, hostToken } = msg.payload;
          const room = roomManager.getRoom(roomId);
          if (!room) {
            sendError(ws, 'ROOM_NOT_FOUND', 'Room not found');
            return;
          }

          if (!roomManager.isAuthorizedHost(roomId, ws, hostToken)) {
            sendError(ws, 'UNAUTHORIZED', 'Unauthorized: Only host can send SDP offer');
            return;
          }

          if (!room.viewer?.ws) {
            sendError(ws, 'HOST_NOT_READY', 'Viewer is not connected to receive offer');
            return;
          }

          // Forward SDP offer directly to viewer
          const offerMsg: OfferMessage = {
            type: 'OFFER',
            payload: { roomId, sdp },
          };
          sendJson(room.viewer.ws, offerMsg);
          break;
        }

        case 'ANSWER': {
          const { roomId, sdp } = msg.payload;
          const room = roomManager.getRoom(roomId);
          if (!room) {
            sendError(ws, 'ROOM_NOT_FOUND', 'Room not found');
            return;
          }

          // Verify sender is viewer
          if (room.viewer?.ws !== ws) {
            sendError(ws, 'UNAUTHORIZED', 'Unauthorized: Only viewer can send SDP answer');
            return;
          }

          if (!room.host?.ws) {
            sendError(ws, 'HOST_NOT_READY', 'Host is not currently connected');
            return;
          }

          // Forward SDP answer directly to host
          const answerMsg: AnswerMessage = {
            type: 'ANSWER',
            payload: { roomId, sdp },
          };
          sendJson(room.host.ws, answerMsg);
          break;
        }

        case 'ICE_CANDIDATE': {
          const { roomId, candidate, hostToken } = msg.payload;
          const room = roomManager.getRoom(roomId);
          if (!room) return; // Room closed

          const isHost = roomManager.isAuthorizedHost(roomId, ws, hostToken);
          const isViewer = room.viewer?.ws === ws;

          if (isHost && room.viewer?.ws) {
            const iceMsg: IceCandidateMessage = {
              type: 'ICE_CANDIDATE',
              payload: { roomId, candidate },
            };
            sendJson(room.viewer.ws, iceMsg);
          } else if (isViewer && room.host?.ws) {
            const iceMsg: IceCandidateMessage = {
              type: 'ICE_CANDIDATE',
              payload: { roomId, candidate },
            };
            sendJson(room.host.ws, iceMsg);
          }
          break;
        }

        case 'PEER_LEFT': {
          const result = roomManager.handleDisconnect(ws);
          if (result && result.otherPeerWs) {
            const leftMsg: PeerLeftMessage = {
              type: 'PEER_LEFT',
              payload: {
                roomId: result.roomId,
                role: result.role,
                reason: msg.payload.reason || 'Peer departed',
              },
            };
            sendJson(result.otherPeerWs, leftMsg);
          }
          break;
        }

        case 'PING': {
          const pong: PongMessage = {
            type: 'PONG',
            payload: {
              timestamp: msg.payload.timestamp,
              serverTime: Date.now(),
            },
          };
          sendJson(ws, pong);
          break;
        }
      }
    });

    ws.on('close', () => {
      const result = roomManager.handleDisconnect(ws);
      if (result && result.otherPeerWs) {
        const leftMsg: PeerLeftMessage = {
          type: 'PEER_LEFT',
          payload: {
            roomId: result.roomId,
            role: result.role,
            reason: `${result.role === 'host' ? 'Host' : 'Viewer'} disconnected`,
          },
        };
        sendJson(result.otherPeerWs, leftMsg);
      }
    });

    ws.on('error', (err) => {
      console.error('[WebSocket Error]', err);
    });
  });

  // Heartbeat interval to clean up dead sockets (30 seconds)
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as ExtendedWebSocket;
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  if (heartbeatInterval.unref) {
    heartbeatInterval.unref();
  }

  return { wss, rateLimiter };
}
