/**
 * REST API router for WebTerm
 * Routes HTTP requests to appropriate handlers
 */

import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleHealthCheck } from './routes/health.js';
import { handleSystemInfo, handlePickDirectory, handleValidateDirectory } from './routes/system.js';
import {
  handleListSessions,
  handleGetSession,
  handleCreateSession,
  handleUpdateSession,
  handleDeleteSession,
  handleClearAllSessions,
  handleSaveSession,
  handleImportSession,
} from './routes/sessions.js';
import { handleListKeybindings } from './routes/keybindings.js';
import { handleExecuteCommand, handleListPanes } from './routes/commands.js';
import { logger } from '../utils/logger.js';
import { isWebTermError, toErrorResponse, ValidationError } from '../utils/errors.js';

/** Route handler function type */
type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  body: unknown
) => Promise<void>;

/** Route definition */
interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
  maxBodySize?: number;
}

/** Registered routes */
const routes: Route[] = [];

/**
 * Register a route
 */
function registerRoute(method: string, path: string, handler: RouteHandler, options?: { maxBodySize?: number }): void {
  // Convert path pattern to regex
  // /sessions/:id -> /sessions/([^/]+)
  const paramNames: string[] = [];
  const patternStr = path.replace(/:([a-zA-Z]+)/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });

  routes.push({
    method: method.toUpperCase(),
    pattern: new RegExp(`^${patternStr}$`),
    paramNames,
    handler,
    ...(options?.maxBodySize !== undefined ? { maxBodySize: options.maxBodySize } : {}),
  });
}

// ============================================================================
// Route Registration
// ============================================================================

// Health check
registerRoute('GET', '/health', handleHealthCheck);

// System info
registerRoute('GET', '/api/v1/system/info', handleSystemInfo);
registerRoute('POST', '/api/v1/system/pick-directory', handlePickDirectory);
registerRoute('POST', '/api/v1/system/validate-directory', handleValidateDirectory);

// Sessions
registerRoute('GET', '/api/v1/sessions', handleListSessions);
registerRoute('POST', '/api/v1/sessions/import', handleImportSession, { maxBodySize: 10 * 1024 * 1024 });
registerRoute('GET', '/api/v1/sessions/:id', handleGetSession);
registerRoute('POST', '/api/v1/sessions', handleCreateSession);
registerRoute('PATCH', '/api/v1/sessions/:id', handleUpdateSession);
registerRoute('DELETE', '/api/v1/sessions', handleClearAllSessions);
registerRoute('DELETE', '/api/v1/sessions/:id', handleDeleteSession);
registerRoute('POST', '/api/v1/sessions/:id/save', handleSaveSession);

// Keybindings
registerRoute('GET', '/api/v1/keybindings', handleListKeybindings);

// Command execution (used by tmux shim)
registerRoute('POST', '/api/v1/command', handleExecuteCommand);

// Pane listing (used by tmux shim for list-panes)
registerRoute('GET', '/api/v1/panes', handleListPanes);

// ============================================================================
// Request Handler
// ============================================================================

/**
 * Parse URL pathname from request
 */
function getPathname(req: IncomingMessage): string {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    return url.pathname;
  } catch {
    return '/';
  }
}

/**
 * Parse JSON body from request
 */
async function parseJsonBody(req: IncomingMessage, maxSize = 1024 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        reject(new ValidationError('Request body too large', 'body', 'maxSize'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }

      const body = Buffer.concat(chunks).toString('utf8');
      if (!body.trim()) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new ValidationError('Invalid JSON body', 'body', 'json'));
      }
    });

    req.on('error', reject);
  });
}

/**
 * Set CORS headers
 */
function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

/**
 * Send JSON response
 */
export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

/**
 * Send error response
 */
export function sendError(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): void {
  const errorResponse: { error: { code: string; message: string; details?: Record<string, unknown> } } = {
    error: { code, message },
  };
  if (details) {
    errorResponse.error.details = details;
  }
  sendJson(res, statusCode, errorResponse);
}

/**
 * Handle incoming HTTP request
 */
export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method?.toUpperCase() ?? 'GET';
  const pathname = getPathname(req);

  // Set CORS headers
  setCorsHeaders(res);

  // Handle preflight requests
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  logger.debug('HTTP request', { method, pathname });

  // Find matching route
  for (const route of routes) {
    if (route.method !== method) continue;

    const match = pathname.match(route.pattern);
    if (!match) continue;

    // Extract route parameters
    const params: Record<string, string> = {};
    route.paramNames.forEach((name, index) => {
      params[name] = match[index + 1] ?? '';
    });

    try {
      // Parse body for POST/PATCH/DELETE requests
      let body: unknown;
      if (method === 'POST' || method === 'PATCH' || method === 'DELETE') {
        body = await parseJsonBody(req, route.maxBodySize);
      }

      // Call handler
      await route.handler(req, res, params, body);

      logger.debug('HTTP response', { method, pathname, statusCode: res.statusCode });
    } catch (error) {
      handleRouteError(res, error);
    }

    return;
  }

  // No route matched
  sendError(res, 404, 'NOT_FOUND', `${method} ${pathname} not found`);
}

/**
 * Handle route error
 */
function handleRouteError(res: ServerResponse, error: unknown): void {
  if (isWebTermError(error)) {
    logger.warn('Request error', { code: error.code, message: error.message });
    sendJson(res, error.statusCode, toErrorResponse(error));
  } else if (error instanceof Error) {
    logger.error('Internal error', { error: error.message, stack: error.stack });
    sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  } else {
    logger.error('Unknown error', { error });
    sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

/**
 * Create HTTP request handler function
 */
export function createRestRouter(): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    handleRequest(req, res).catch((error) => {
      logger.error('Unhandled request error', { error });
      if (!res.headersSent) {
        sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
      }
    });
  };
}
