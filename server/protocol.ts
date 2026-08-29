import { SignalingMessage, ErrorCode, SignalingMessageType } from '../src/types/protocol';

const VALID_MESSAGE_TYPES: Set<string> = new Set([
  'CREATE_ROOM',
  'ROOM_CREATED',
  'JOIN_ROOM',
  'REJOIN_ROOM',
  'ROOM_JOINED',
  'VIEWER_JOINED',
  'HOST_READY',
  'OFFER',
  'ANSWER',
  'ICE_CANDIDATE',
  'PEER_LEFT',
  'ROOM_CLOSED',
  'ERROR',
  'PING',
  'PONG',
]);

export interface ValidationResult<T = SignalingMessage> {
  valid: boolean;
  message?: T;
  errorCode?: ErrorCode;
  errorDetail?: string;
}

/**
 * Validates incoming WebSocket string or parsed JSON into a valid SignalingMessage
 */
export function validateSignalingMessage(raw: unknown): ValidationResult {
  let parsed: any = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {
        valid: false,
        errorCode: 'INVALID_MESSAGE',
        errorDetail: 'Malformed JSON payload',
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      errorCode: 'INVALID_MESSAGE',
      errorDetail: 'Message payload must be a non-null object',
    };
  }

  const { type, payload } = parsed;

  if (!type || typeof type !== 'string' || !VALID_MESSAGE_TYPES.has(type)) {
    return {
      valid: false,
      errorCode: 'INVALID_MESSAGE',
      errorDetail: `Invalid or unknown message type: "${type}"`,
    };
  }

  // Type-specific validations
  switch (type as SignalingMessageType) {
    case 'CREATE_ROOM':
      return { valid: true, message: { type: 'CREATE_ROOM', payload: payload || {} } };

    case 'JOIN_ROOM':
      if (!payload || typeof payload.roomId !== 'string' || payload.roomId.trim().length === 0 || payload.roomId.trim().length > 64) {
        return {
          valid: false,
          errorCode: 'INVALID_ROOM',
          errorDetail: 'JOIN_ROOM requires a roomId string up to 64 characters',
        };
      }
      return {
        valid: true,
        message: { type: 'JOIN_ROOM', payload: { roomId: payload.roomId.trim().toLowerCase() } },
      };

    case 'REJOIN_ROOM':
      if (!payload || typeof payload.roomId !== 'string' || payload.roomId.trim().length === 0 || payload.roomId.trim().length > 64 || !['host', 'viewer'].includes(payload.role)) {
        return {
          valid: false,
          errorCode: 'INVALID_MESSAGE',
          errorDetail: 'REJOIN_ROOM requires roomId and role',
        };
      }
      return {
        valid: true,
        message: {
          type: 'REJOIN_ROOM',
          payload: {
            roomId: payload.roomId.trim().toLowerCase(),
            role: payload.role,
            hostToken: typeof payload.hostToken === 'string' ? payload.hostToken : undefined,
          },
        },
      };

    case 'HOST_READY':
      if (!payload || typeof payload.roomId !== 'string') {
        return {
          valid: false,
          errorCode: 'INVALID_MESSAGE',
          errorDetail: 'HOST_READY requires roomId',
        };
      }
      return {
        valid: true,
        message: {
          type: 'HOST_READY',
          payload: {
            roomId: payload.roomId.trim().toLowerCase(),
            hostToken: typeof payload.hostToken === 'string' ? payload.hostToken : undefined,
          },
        },
      };

    case 'OFFER':
      if (
        !payload ||
        typeof payload.roomId !== 'string' ||
        !payload.sdp ||
        typeof payload.sdp !== 'object' ||
        typeof payload.sdp.type !== 'string' ||
        typeof payload.sdp.sdp !== 'string'
      ) {
        return {
          valid: false,
          errorCode: 'INVALID_MESSAGE',
          errorDetail: 'OFFER requires valid roomId and RTCSessionDescriptionInit sdp',
        };
      }
      return {
        valid: true,
        message: {
          type: 'OFFER',
          payload: {
            roomId: payload.roomId.trim().toLowerCase(),
            sdp: payload.sdp,
            hostToken: typeof payload.hostToken === 'string' ? payload.hostToken : undefined,
          },
        },
      };

    case 'ANSWER':
      if (
        !payload ||
        typeof payload.roomId !== 'string' ||
        !payload.sdp ||
        typeof payload.sdp !== 'object' ||
        typeof payload.sdp.type !== 'string' ||
        typeof payload.sdp.sdp !== 'string'
      ) {
        return {
          valid: false,
          errorCode: 'INVALID_MESSAGE',
          errorDetail: 'ANSWER requires valid roomId and RTCSessionDescriptionInit sdp',
        };
      }
      return {
        valid: true,
        message: {
          type: 'ANSWER',
          payload: {
            roomId: payload.roomId.trim().toLowerCase(),
            sdp: payload.sdp,
          },
        },
      };

    case 'ICE_CANDIDATE':
      if (
        !payload ||
        typeof payload.roomId !== 'string' ||
        !payload.candidate ||
        typeof payload.candidate !== 'object'
      ) {
        return {
          valid: false,
          errorCode: 'INVALID_MESSAGE',
          errorDetail: 'ICE_CANDIDATE requires valid roomId and candidate object',
        };
      }
      return {
        valid: true,
        message: {
          type: 'ICE_CANDIDATE',
          payload: {
            roomId: payload.roomId.trim().toLowerCase(),
            candidate: payload.candidate,
            hostToken: typeof payload.hostToken === 'string' ? payload.hostToken : undefined,
          },
        },
      };

    case 'PING':
      return {
        valid: true,
        message: {
          type: 'PING',
          payload: { timestamp: typeof payload?.timestamp === 'number' ? payload.timestamp : Date.now() },
        },
      };

    case 'PEER_LEFT':
      return {
        valid: true,
        message: {
          type: 'PEER_LEFT',
          payload: {
            roomId: typeof payload?.roomId === 'string' ? payload.roomId.trim().toLowerCase() : '',
            role: payload?.role === 'viewer' ? 'viewer' : 'host',
            reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
          },
        },
      };

    default:
      return {
        valid: false,
        errorCode: 'INVALID_MESSAGE',
        errorDetail: `Unsupported client message type: "${type}"`,
      };
  }
}
