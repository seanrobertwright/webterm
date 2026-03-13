/**
 * Session management handler for WebSocket messages
 * Handles window operations: createWindow, closeWindow, switchWindow
 */

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
import { sessionService } from '../../services/session-service.js';
import { ptyManager } from '../../services/pty-service.js';

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
  const { sessionId, name, cwd } = message.payload;

  logger.debug('Creating window', { sessionId, name, cwd });

  try {
    // Create window via session service (persists to DB)
    const window = sessionService.createWindow(
      sessionId,
      name ?? `Window ${Date.now()}`,
      'default',
      cwd
    );

    if (!window) {
      sendError(ctx.ws, 'SESSION_NOT_FOUND', `Session ${sessionId} not found`);
      return;
    }

    // Spawn PTY for the initial pane
    const initialPane = window.panes[0];
    if (initialPane) {
      ptyManager.spawn(initialPane.id, {
        shell: 'default',
        cols: initialPane.cols,
        rows: initialPane.rows,
        ...(cwd !== undefined ? { cwd } : {}),
      });
      // Update connection state
      initialPane.connectionState = 'connected';
    }

    // Update active window
    ctx.activeWindowId = window.id;

    sendWindowCreated(ctx.ws, window);
    logger.info('Window created', { windowId: window.id, sessionId });
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
    // Delete window via session service (kills PTYs and removes from DB)
    sessionService.deleteWindow(windowId);

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
    ctx.activeWindowId = windowId;

    // Persist active window to database
    sessionService.updateSession(ctx.sessionId, { activeWindowId: windowId });

    logger.info('Window switched', { windowId, sessionId: ctx.sessionId });
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
