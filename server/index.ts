import express from 'express';
import http from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { RoomManager } from './rooms';
import { setupWebSocketServer } from './websocket';

dotenv.config();

export async function createWatchTogetherServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const httpServer = http.createServer(app);

  app.use(express.json());

  // Room Manager instance
  const roomManager = new RoomManager({
    maxLifetimeMs: Number(process.env.ROOM_TIMEOUT_MS || 24 * 60 * 60 * 1000),
    emptyRoomGraceMs: 15 * 60 * 1000,
  });

  // Setup WebSocket signaling server
  setupWebSocketServer(httpServer, roomManager);

  // Health endpoint required by platform
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'WatchTogether P2P Signaling',
      activeRooms: roomManager.getRoomCount(),
      timestamp: Date.now(),
    });
  });

  // ICE Server configuration endpoint
  app.get('/api/ice-servers', (req, res) => {
    const rawStun = process.env.STUN_SERVERS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';
    const stunUrls = rawStun.split(',').map((s) => s.trim()).filter(Boolean);

    const iceServers: RTCIceServer[] = [
      {
        urls: stunUrls,
      },
    ];

    // Check optional TURN configuration
    const turnUrl = process.env.TURN_URL;
    const turnUsername = process.env.TURN_USERNAME;
    const turnCredential = process.env.TURN_CREDENTIAL;

    if (turnUrl && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnUrl.split(',').map((u) => u.trim()),
        username: turnUsername,
        credential: turnCredential,
      });
    }

    res.json({
      iceServers,
      hasTurn: Boolean(turnUrl && turnUsername && turnCredential),
    });
  });

  // Client SPA Routing & Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return { app, httpServer, roomManager, PORT };
}
