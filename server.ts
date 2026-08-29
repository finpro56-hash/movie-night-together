import { createWatchTogetherServer } from './server/index';

async function start() {
  const { httpServer, PORT } = await createWatchTogetherServer();

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[WatchTogether] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[WatchTogether] WebSocket signaling available at ws://0.0.0.0:${PORT}/ws`);
  });
}

start().catch((err) => {
  console.error('[WatchTogether] Failed to start server:', err);
  process.exit(1);
});
