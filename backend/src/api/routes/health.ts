/**
 * Health check endpoint
 * GET /health
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../rest-router.js';

/** Server start time for uptime calculation */
const startTime = Date.now();

/**
 * Handle health check request
 * Returns server health status and metrics
 */
export async function handleHealthCheck(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  _body: unknown
): Promise<void> {
  const memoryUsage = process.memoryUsage();

  const response = {
    status: 'healthy',
    timestamp: Date.now(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    activeSessions: 0, // TODO: Get from session service
    activePanes: 0,    // TODO: Get from PTY service
    memoryUsage: {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
    },
  };

  sendJson(res, 200, response);
}
