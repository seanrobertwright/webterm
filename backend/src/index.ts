/**
 * WebTerm Backend Entry Point
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { config } from './config/index.js';
import { runMigrations } from './db/migrate.js';
import { closeDatabase } from './db/database.js';
import { logger } from './utils/logger.js';
import { createWebSocketServer } from './api/websocket-server.js';
import { createRestRouter } from './api/rest-router.js';

/** HTTP server instance */
let server: http.Server | null = null;

/**
 * Search upward for the frontend/dist directory.
 * Works whether running from the dev build or the published package.
 */
function findFrontendDist(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'frontend', 'dist', 'index.html');
    if (fs.existsSync(candidate)) {
      return path.join(dir, 'frontend', 'dist');
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Start the server
 */
async function start(): Promise<void> {
  logger.info('Starting WebTerm backend...');

  // Run database migrations
  runMigrations();

  // Create HTTP server with REST router
  const restRouter = createRestRouter();

  // In production, serve built frontend as static files
  const isProduction = process.env.NODE_ENV === 'production';
  // In the published package, backend runs from backend/dist/backend/src/
  // so frontend/dist is 4 levels up at the package root.
  // In a dev production build, we also check the 2-level path.
  const frontendDistDir = isProduction
    ? findFrontendDist(import.meta.dirname)
    : null;

  if (isProduction && frontendDistDir && fs.existsSync(frontendDistDir)) {
    logger.info('Production mode: serving frontend from ' + frontendDistDir);
  }

  server = http.createServer((req, res) => {
    // Try REST/API routes first
    const url = req.url ?? '/';

    // API, health, and WebSocket routes go to the REST router
    if (url.startsWith('/api') || url.startsWith('/health') || url.startsWith('/ws')) {
      restRouter(req, res);
      return;
    }

    // In production, serve static frontend files
    if (isProduction && frontendDistDir) {
      const filePath = path.join(frontendDistDir, url === '/' ? 'index.html' : url);
      const normalizedPath = path.resolve(filePath);

      // Prevent directory traversal
      if (!normalizedPath.startsWith(frontendDistDir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      fs.stat(normalizedPath, (err, stats) => {
        if (!err && stats.isFile()) {
          const ext = path.extname(normalizedPath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2',
          };
          res.setHeader('Content-Type', mimeTypes[ext] ?? 'application/octet-stream');
          fs.createReadStream(normalizedPath).pipe(res);
        } else {
          // SPA fallback: serve index.html for client-side routing
          const indexPath = path.join(frontendDistDir, 'index.html');
          res.setHeader('Content-Type', 'text/html');
          fs.createReadStream(indexPath).pipe(res);
        }
      });
      return;
    }

    // In dev mode, non-API routes get a 404 (Vite handles frontend)
    restRouter(req, res);
  });

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
