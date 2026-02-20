/**
 * Session management handler for WebSocket messages
 * Handles window operations: createWindow, closeWindow, switchWindow
 */

import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type {
  CreateWindowMessage,
  CloseWindowMessage,
  SwitchWindowMessage,
  WindowCreatedMessage,
  WindowClosedMessage,
  ErrorMessage,
} from '@webterm/shared/messages';
import type { WindowWithPanes, Layout, Pane } from '@webterm/shared/models';
import { logger } from '../../utils/logger.js';
import { NotFoundError } from '../../utils/errors.js';

/** Session handler context */
export interface SessionHandlerContext {
  sessionId: string;
  ws: WebSocket;
  activeWindowId: string | null;
}

/**
 * Create a new session handler context
 */
export function createSessionContext(sessionId: string, ws: WebSocket): SessionHandlerContext {
  return {
    sessionId,
    ws,
    activeWindowId: null,
  };
}

/**
 * Handle createWindow message - create new window in session
 */
export async function handleCreateWindow(
  ctx: SessionHandlerContext,
  message: CreateWindowMessage
): Promise<void> {
  const { sessionId, name } = message.payload;
  
  logger.debug('Creating window', { sessionId, name });
  
  try {
    // TODO: Create window through session service
    // const window = await sessionService.createWindow(sessionId, name);
    
    // Create initial pane for the window
    const paneId = randomUUID();
    const windowId = randomUUID();
    
    const pane: Pane = {
      id: paneId,
      windowId,
      shell: 'default',
      cwd: null,
      cols: 80,
      rows: 24,
      connectionState: 'connecting',
      exitCode: null,
      createdAt: Date.now(),
    };
    
    const layout: Layout = { type: 'leaf', paneId };
    
    const window: WindowWithPanes = {
      id: windowId,
      sessionId,
      name: name ?? `Window ${Date.now()}`,
      index: 0,
      createdAt: Date.now(),
      layout,
      panes: [pane],
    };
    
    // Update active window
    ctx.activeWindowId = windowId;
    
    sendWindowCreated(ctx.ws, window);
    logger.info('Window created', { windowId, sessionId });
  } catch (error) {
    logger.error('Failed to create window', { sessionId, error });
    sendError(ctx.ws, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`);
  }
}

/**
 * Handle closeWindow message - close window and all its panes
 */
export async function handleCloseWindow(
  ctx: SessionHandlerContext,
  message: CloseWindowMessage
): Promise<void> {
  const { windowId } = message.payload;
  
  logger.debug('Closing window', { windowId });
  
  try {
    // TODO: Close window through session service
    // await sessionService.closeWindow(windowId);
    
    // Clear active window if it was the closed one
    if (ctx.activeWindowId === windowId) {
      ctx.activeWindowId = null;
    }
    
    sendWindowClosed(ctx.ws, windowId);
    logger.info('Window closed', { windowId });
  } catch (error) {
    logger.error('Failed to close window', { windowId, error });
    sendError(ctx.ws, 'WINDOW_NOT_FOUND', `Window ${windowId} not found`);
  }
}

/**
 * Handle switchWindow message - switch active window
 */
export async function handleSwitchWindow(
  ctx: SessionHandlerContext,
  message: SwitchWindowMessage
): Promise<void> {
  const { windowId } = message.payload;
  
  logger.debug('Switching window', { windowId, sessionId: ctx.sessionId });
  
  try {
    // TODO: Validate window exists
    // const window = await sessionService.getWindow(windowId);
    
    ctx.activeWindowId = windowId;
    
    // TODO: Update session's active window in database
    // await sessionService.setActiveWindow(ctx.sessionId, windowId);
    
    logger.info('Window switched', { windowId, sessionId: ctx.sessionId });
    
    // Note: Client should request window state if needed
  } catch (error) {
    logger.error('Failed to switch window', { windowId, error });
    sendError(ctx.ws, 'WINDOW_NOT_FOUND', `Window ${windowId} not found`);
  }
}

// ============================================================================
// Message Senders
// ============================================================================

function sendJson(ws: WebSocket, message: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendWindowCreated(ws: WebSocket, window: WindowWithPanes): void {
  const message: WindowCreatedMessage = {
    type: 'windowCreated',
    payload: { window },
  };
  sendJson(ws, message);
}

function sendWindowClosed(ws: WebSocket, windowId: string): void {
  const message: WindowClosedMessage = {
    type: 'windowClosed',
    payload: { windowId },
  };
  sendJson(ws, message);
}

function sendError(ws: WebSocket, code: string, message: string): void {
  const errorMessage: ErrorMessage = {
    type: 'error',
    payload: { code, message },
  };
  sendJson(ws, errorMessage);
}

/**
 * Send session reconnected message with missed output pane IDs
 */
export function sendReconnected(
  ws: WebSocket,
  sessionId: string,
  missedOutputPanes: string[]
): void {
  const message = {
    type: 'reconnected',
    payload: { sessionId, missedOutputPanes },
  };
  sendJson(ws, message);
}
