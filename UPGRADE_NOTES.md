# WatchTogether Upgrade Notes

## What was fixed

### 1. Host stream loss during negotiation
The previous flow could capture the local MediaStream, create the WebRTC manager, and then call `initialize()` during offer creation. `initialize()` closed the existing peer connection, which discarded the captured tracks. The manager is now idempotent and retains/re-attaches the captured stream.

### 2. ICE failure recovery
When ICE reaches `failed`, the Host now attempts an ICE restart and automatically forwards the new SDP offer to the Viewer. This keeps the media connection recoverable without rebuilding the room.

### 3. Signaling reconnect
A temporary WebSocket failure no longer means the session must start over. The client re-associates its new socket with the existing room using `REJOIN_ROOM`. Host authorization still requires the room capability token.

### 4. Synchronization
Playback state is broadcast every 500 ms. Viewer drift policy is:

- <= 80 ms: no correction
- 80–750 ms: gentle 0.97x/1.03x correction
- > 750 ms: hard timestamp correction

RTT is still estimated from DataChannel PING/PONG messages and used for one-way latency compensation.

### 5. Media metadata
Audio is no longer reported as present unconditionally after `loadedmetadata`. Detection remains browser-dependent and conservative.

### 6. Server hardening
- `PORT` is configurable.
- `ROOM_TIMEOUT_MS` is honored.
- Rooms have a hard lifetime timer.
- Empty host rooms receive a short cleanup grace after the viewer leaves.
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_MESSAGES` are honored.
- `ALLOWED_ORIGINS` can restrict WebSocket origins.
- Room IDs have a bounded input length.

## Production requirement: TURN

STUN is not enough to guarantee connectivity across all NAT/firewall combinations. Configure a TURN server for production:

```env
TURN_URL="turn:your-turn-host:3478,turns:your-turn-host:5349"
TURN_USERNAME="temporary-or-configured-username"
TURN_CREDENTIAL="credential"
```

Prefer short-lived TURN credentials when your TURN provider supports them.

## Run locally

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm start
```

The current execution environment used to prepare this archive did not have the npm dependency cache available, so a full dependency install/build could not be executed here. The source-level changes are included in the archive and the existing test suite has been updated for the new synchronization and reconnect behavior.
