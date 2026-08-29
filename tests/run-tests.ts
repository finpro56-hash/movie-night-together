import { RoomManager } from '../server/rooms';
import { validateSignalingMessage } from '../server/protocol';
import { RateLimiter } from '../server/rateLimit';
import { SyncManager } from '../src/services/syncManager';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failedCount++;
  }
}

function runTests() {
  console.log('\n========================================');
  console.log('  RUNNING WATCHTOGETHER AUTOMATED TESTS');
  console.log('========================================\n');

  // ----------------------------------------------------
  // Test Suite 1: RoomManager Lifecycle & Security
  // ----------------------------------------------------
  console.log('📁 Test Suite 1: RoomManager Lifecycle & Security');
  const roomManager = new RoomManager();

  // Mock WebSockets
  const mockHostWs: any = { readyState: 1, send: () => {} };
  const mockViewerWs: any = { readyState: 1, send: () => {} };
  const mockExtraWs: any = { readyState: 1, send: () => {} };

  const { room, hostToken } = roomManager.createRoom(mockHostWs);
  assert(Boolean(room.id && room.id.length >= 7), 'Room ID is generated with high entropy');
  assert(Boolean(hostToken && hostToken.length >= 16), 'Cryptographic host token is generated');
  assert(roomManager.isAuthorizedHost(room.id, mockHostWs, hostToken), 'Host WebSocket is authorized');
  assert(!roomManager.isAuthorizedHost(room.id, mockViewerWs, 'fake-token'), 'Imposter is rejected');

  // Join room as Viewer
  const joinResult = roomManager.joinRoom(room.id, mockViewerWs);
  assert(joinResult.success === true, 'Viewer successfully joins available room');

  // Reject 3rd peer (max 1 host, 1 viewer)
  const fullResult = roomManager.joinRoom(room.id, mockExtraWs);
  assert(fullResult.success === false && fullResult.error === 'ROOM_FULL', '3rd peer is rejected with ROOM_FULL');

  // Viewer disconnects -> Host remains
  const viewerDisc = roomManager.handleDisconnect(mockViewerWs);
  assert(viewerDisc !== null && viewerDisc.role === 'viewer', 'Viewer disconnect is cleanly handled');
  assert(roomManager.getRoom(room.id)?.viewer === null, 'Room viewer slot is freed');

  // Viewer can reconnect into the freed slot
  const rejoinViewerWs: any = { readyState: 1, send: () => {} };
  const rejoinViewer = roomManager.rejoinRoom(room.id, rejoinViewerWs, 'viewer');
  assert(rejoinViewer.success === true, 'Viewer can rejoin an existing room after signaling reconnect');

  // Host can reconnect with the capability token after a transport drop.
  const hostDisc = roomManager.handleDisconnect(mockHostWs);
  assert(hostDisc !== null && hostDisc.role === 'host', 'Host transport disconnect is handled');
  const rejoinHostWs: any = { readyState: 1, send: () => {} };
  const rejoinHost = roomManager.rejoinRoom(room.id, rejoinHostWs, 'host', hostToken);
  assert(rejoinHost.success === true, 'Host can rejoin with the original capability token');
  const badRejoinHostWs: any = { readyState: 1, send: () => {} };
  const badRejoinHost = roomManager.rejoinRoom(room.id, badRejoinHostWs, 'host', 'wrong-token');
  assert(badRejoinHost.success === false && badRejoinHost.error === 'UNAUTHORIZED', 'Host rejoin with a wrong token is rejected');
  roomManager.handleDisconnect(rejoinHostWs);
  roomManager.handleDisconnect(rejoinViewerWs);

  // Host disconnects -> Room cleanup
  roomManager.destroyRoom(room.id);
  assert(roomManager.getRoom(room.id) === undefined, 'Room is destroyed on host exit');

  // ----------------------------------------------------
  // Test Suite 2: Protocol Validation & Message Sanitization
  // ----------------------------------------------------
  console.log('\n📁 Test Suite 2: Protocol Validation');

  const validCreate = validateSignalingMessage({ type: 'CREATE_ROOM', payload: {} });
  assert(validCreate.valid && validCreate.message?.type === 'CREATE_ROOM', 'CREATE_ROOM message validates');

  const validJoin = validateSignalingMessage({ type: 'JOIN_ROOM', payload: { roomId: 'abc-123' } });
  assert(validJoin.valid && (validJoin.message as any).payload.roomId === 'abc-123', 'JOIN_ROOM message validates');

  const emptyJoin = validateSignalingMessage({ type: 'JOIN_ROOM', payload: { roomId: '' } });
  assert(!emptyJoin.valid && emptyJoin.errorCode === 'INVALID_ROOM', 'Empty roomId in JOIN_ROOM is rejected');

  const validRejoin = validateSignalingMessage({ type: 'REJOIN_ROOM', payload: { roomId: 'abc-123', role: 'viewer' } });
  assert(validRejoin.valid && validRejoin.message?.type === 'REJOIN_ROOM', 'REJOIN_ROOM message validates');

  const malformedJson = validateSignalingMessage('{ invalid json');
  assert(!malformedJson.valid && malformedJson.errorCode === 'INVALID_MESSAGE', 'Malformed JSON string is rejected');

  const unknownType = validateSignalingMessage({ type: 'UNKNOWN_HACK_TYPE' });
  assert(!unknownType.valid && unknownType.errorCode === 'INVALID_MESSAGE', 'Unknown message type is rejected');

  // ----------------------------------------------------
  // Test Suite 3: Rate Limiter
  // ----------------------------------------------------
  console.log('\n📁 Test Suite 3: Sliding Window Rate Limiter');

  const limiter = new RateLimiter(1000, 3); // 3 requests max per second
  const ip = '192.168.1.50';

  assert(limiter.isAllowed(ip), 'Request 1 is allowed');
  assert(limiter.isAllowed(ip), 'Request 2 is allowed');
  assert(limiter.isAllowed(ip), 'Request 3 is allowed');
  assert(!limiter.isAllowed(ip), 'Request 4 is blocked (rate limit exceeded)');
  limiter.destroy();

  // ----------------------------------------------------
  // Test Suite 4: Clock Synchronization & Drift Correction
  // ----------------------------------------------------
  console.log('\n📁 Test Suite 4: SyncManager & Drift Evaluation');

  const syncManager = new SyncManager({
    syncIntervalMs: 500,
    smallDriftMs: 80,
    largeDriftMs: 750,
  });

  const now = Date.now();
  const mockSyncMsg = {
    type: 'SYNC' as const,
    state: 'playing' as const,
    time: 120.0,
    playbackRate: 1.0,
    sentAt: now - 50, // 50ms transit
  };

  // Expected host time with 50ms one-way transit
  const expectedHostTime = syncManager.calculateExpectedHostTime(mockSyncMsg, now);
  assert(expectedHostTime >= 120.0, 'Expected host time compensates for network transit');

  // Case 1: In sync (<80ms)
  const syncEval1 = syncManager.evaluateDrift(120.1, 120.0);
  assert(syncEval1.action === 'GENTLE_SPEED_UP' && syncEval1.recommendedRate === 1.03, '100ms drift triggers gentle correction with 1.03x rate');

  // Case 2: Viewer slightly ahead (+400ms) -> Gentle slow down
  const syncEval2 = syncManager.evaluateDrift(120.4, 120.0);
  assert(syncEval2.action === 'GENTLE_SLOW_DOWN' && syncEval2.recommendedRate === 0.97, 'Drift +400ms triggers gentle slow down (0.97x)');

  // Case 3: Viewer slightly behind (-400ms) -> Gentle speed up
  const syncEval3 = syncManager.evaluateDrift(119.6, 120.0);
  assert(syncEval3.action === 'GENTLE_SPEED_UP' && syncEval3.recommendedRate === 1.03, 'Drift -400ms triggers gentle speed up (1.03x)');

  // Case 4: Major drift (+2000ms) -> Hard sync
  const syncEval4 = syncManager.evaluateDrift(122.0, 120.0);
  assert(syncEval4.action === 'HARD_SYNC', 'Large drift (>750ms) triggers hard sync alignment');

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log('\n========================================');
  console.log(`  TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
