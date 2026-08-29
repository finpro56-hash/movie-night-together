import crypto from 'crypto';
import type { WebSocket } from 'ws';
import { Role } from '../src/types/protocol';

export interface RoomPeer {
  role: Role;
  ws: WebSocket;
  joinedAt: number;
  lastPingAt: number;
}

export interface Room {
  id: string;
  hostToken: string; // Private capability token for host authorization
  createdAt: number;
  lastActivityAt: number;
  host: RoomPeer | null;
  viewer: RoomPeer | null;
  hostReady: boolean;
  cleanupTimer?: NodeJS.Timeout;
  lifetimeTimer?: NodeJS.Timeout;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private wsToRoom: Map<WebSocket, { roomId: string; role: Role }> = new Map();
  private maxLifetimeMs: number;
  private emptyRoomGraceMs: number;

  constructor(options?: { maxLifetimeMs?: number; emptyRoomGraceMs?: number }) {
    this.maxLifetimeMs = options?.maxLifetimeMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.emptyRoomGraceMs = options?.emptyRoomGraceMs ?? 15 * 60 * 1000; // 15 mins if empty
  }

  /**
   * Generates a cryptographically secure random alphanumeric room ID
   * Formatted like "room-xxxx-xxxx" or a clean 9-char string
   */
  public generateRoomId(): string {
    const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // Base32-like, avoid ambiguous chars 0,1,l,o
    let result = '';
    const bytes = crypto.randomBytes(9);
    for (let i = 0; i < 9; i++) {
      result += chars[bytes[i] % chars.length];
      if (i === 2 || i === 5) {
        result += '-';
      }
    }
    return result; // e.g. "a9x-k4b-7yt"
  }

  /**
   * Generates a cryptographically strong host capability token
   */
  public generateHostToken(): string {
    return crypto.randomBytes(24).toString('base64url');
  }

  /**
   * Creates a new ephemeral room for a host
   */
  public createRoom(hostWs: WebSocket): { room: Room; hostToken: string } {
    let roomId = this.generateRoomId();
    while (this.rooms.has(roomId)) {
      roomId = this.generateRoomId();
    }

    const hostToken = this.generateHostToken();
    const now = Date.now();

    const room: Room = {
      id: roomId,
      hostToken,
      createdAt: now,
      lastActivityAt: now,
      host: {
        role: 'host',
        ws: hostWs,
        joinedAt: now,
        lastPingAt: now,
      },
      viewer: null,
      hostReady: false,
    };

    this.rooms.set(roomId, room);
    this.wsToRoom.set(hostWs, { roomId, role: 'host' });

    const lifetimeTimer = setTimeout(() => this.destroyRoom(roomId), this.maxLifetimeMs);
    if (lifetimeTimer.unref) lifetimeTimer.unref();
    room.lifetimeTimer = lifetimeTimer;

    return { room, hostToken };
  }

  /**
   * Gets a room by ID
   */
  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toLowerCase());
  }

  /**
   * Validates if a WebSocket is the authenticated host for a room
   */
  public isAuthorizedHost(roomId: string, ws: WebSocket, hostToken?: string): boolean {
    const room = this.getRoom(roomId);
    if (!room || !room.host) return false;
    if (room.host.ws === ws) return true;
    if (hostToken && room.hostToken === hostToken) return true;
    return false;
  }

  /**
   * Adds a viewer to an existing room
   */
  public joinRoom(
    roomId: string,
    viewerWs: WebSocket
  ): { success: true; room: Room } | { success: false; error: 'ROOM_NOT_FOUND' | 'ROOM_FULL' } {
    const room = this.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'ROOM_NOT_FOUND' };
    }

    // Check if room already has an active viewer
    if (room.viewer && room.viewer.ws !== viewerWs && room.viewer.ws.readyState === 1) {
      return { success: false, error: 'ROOM_FULL' };
    }

    const now = Date.now();
    room.viewer = {
      role: 'viewer',
      ws: viewerWs,
      joinedAt: now,
      lastPingAt: now,
    };
    room.lastActivityAt = now;

    this.wsToRoom.set(viewerWs, { roomId: room.id, role: 'viewer' });

    // Cancel any scheduled empty room cleanup
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = undefined;
    }

    return { success: true, room };
  }

  /**
   * Re-associates a newly connected WebSocket with an existing room.
   * This is used for short signaling reconnects without creating a new room.
   */
  public rejoinRoom(
    roomId: string,
    ws: WebSocket,
    role: Role,
    hostToken?: string
  ): { success: true; room: Room } | { success: false; error: 'ROOM_NOT_FOUND' | 'UNAUTHORIZED' | 'ROOM_FULL' } {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };

    if (role === 'host') {
      if (!hostToken || hostToken !== room.hostToken) {
        return { success: false, error: 'UNAUTHORIZED' };
      }
      if (room.host && room.host.ws !== ws && room.host.ws.readyState === 1) {
        return { success: false, error: 'ROOM_FULL' };
      }
      room.host = { role: 'host', ws, joinedAt: Date.now(), lastPingAt: Date.now() };
    } else {
      if (room.viewer && room.viewer.ws !== ws && room.viewer.ws.readyState === 1) {
        return { success: false, error: 'ROOM_FULL' };
      }
      room.viewer = { role: 'viewer', ws, joinedAt: Date.now(), lastPingAt: Date.now() };
    }

    room.lastActivityAt = Date.now();
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = undefined;
    }
    this.wsToRoom.set(ws, { roomId: room.id, role });
    return { success: true, room };
  }

  /**
   * Sets host ready state
   */
  public setHostReady(roomId: string, isReady: boolean): boolean {
    const room = this.getRoom(roomId);
    if (!room) return false;
    room.hostReady = isReady;
    room.lastActivityAt = Date.now();
    return true;
  }

  /**
   * Finds peer connection info from a WebSocket
   */
  public getPeerInfo(ws: WebSocket): { roomId: string; role: Role } | undefined {
    return this.wsToRoom.get(ws);
  }

  /**
   * Handles peer disconnection
   */
  public handleDisconnect(ws: WebSocket): {
    roomId: string;
    role: Role;
    otherPeerWs: WebSocket | null;
    roomDestroyed: boolean;
  } | null {
    const info = this.wsToRoom.get(ws);
    if (!info) return null;

    this.wsToRoom.delete(ws);
    const { roomId, role } = info;
    const room = this.getRoom(roomId);

    if (!room) {
      return { roomId, role, otherPeerWs: null, roomDestroyed: true };
    }

    let otherPeerWs: WebSocket | null = null;

    if (role === 'host') {
      if (room.host?.ws === ws) {
        room.host = null;
        room.hostReady = false;
      }
      otherPeerWs = room.viewer?.ws ?? null;

      // When Host disconnects, close room after short grace or immediately if viewer absent
      if (!room.viewer) {
        this.destroyRoom(roomId);
        return { roomId, role, otherPeerWs: null, roomDestroyed: true };
      } else {
        // Schedule cleanup if host does not reconnect
        this.scheduleRoomCleanup(roomId, 60000); // 1 minute
      }
    } else {
      // Viewer left
      if (room.viewer?.ws === ws) {
        room.viewer = null;
      }
      otherPeerWs = room.host?.ws ?? null;

      // If host is absent too, destroy. Otherwise keep the room briefly so
      // the host can invite another viewer without leaving stale rooms forever.
      if (!room.host) {
        this.destroyRoom(roomId);
        return { roomId, role, otherPeerWs: null, roomDestroyed: true };
      }
      this.scheduleRoomCleanup(roomId, this.emptyRoomGraceMs);
    }

    room.lastActivityAt = Date.now();
    return { roomId, role, otherPeerWs, roomDestroyed: false };
  }

  /**
   * Schedules delayed cleanup for an inactive room
   */
  private scheduleRoomCleanup(roomId: string, delayMs: number): void {
    const room = this.getRoom(roomId);
    if (!room) return;

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }

    room.cleanupTimer = setTimeout(() => {
      this.destroyRoom(roomId);
    }, delayMs);

    if (room.cleanupTimer.unref) {
      room.cleanupTimer.unref();
    }
  }

  /**
   * Destroys a room and cleans up resources
   */
  public destroyRoom(roomId: string): void {
    const room = this.getRoom(roomId);
    if (!room) return;

    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
    }
    if (room.lifetimeTimer) {
      clearTimeout(room.lifetimeTimer);
    }

    if (room.host?.ws) {
      this.wsToRoom.delete(room.host.ws);
    }
    if (room.viewer?.ws) {
      this.wsToRoom.delete(room.viewer.ws);
    }

    this.rooms.delete(roomId);
  }

  /**
   * Gets total count of active rooms
   */
  public getRoomCount(): number {
    return this.rooms.size;
  }
}
