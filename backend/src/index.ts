/**
 * WebTerm Backend Entry Point
 */

import http from 'http';
import { config } from './config/index.js';
import { runMigrations } from './db/migrate.js';
import { closeDatabase } from './db/database.js';
import { logger } from './utils/logger.js';
import { createWebSocketServer } from './api/websocket-server.js';
import { createRestRouter } from './api/rest-router.js';

/** HTTP server instance */
let server: http.Server | null = null;

/**
 * Start the server
 */
async function start(): Promise<void> {
  logger.info('Starting WebTerm backend...');

  // Run database migrations
  runMigrations();

  // Create HTTP server with REST router
  const restRouter = createRestRouter();
  server = http.createServer(restRouter);

  // Attach WebSocket server
  createWebSocketServer(server);

  // Start listening
  server.listen(config.port, config.host, () => {
    logger.info(`Server listening on http://${config.host}:${config.port}`);
    logger.info(`WebSocket available at ws://${config.host}:${config.port}/ws`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Graceful shutdown
 */
function shutdown(): void {
  logger.info('Shutting down...');

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed');
    });
  }

  closeDatabase();
  
  logger.info('Goodbye!');
  process.exit(0);
}

// Start the server
start().catch((error) => {
  logger.error('Failed to start server', error instanceof Error ? { message: error.message, stack: error.stack } : error);
  process.exit(1);
});
