/**
 * Terminal I/O handler for WebSocket messages
 * Handles pane operations: resize, create, close, split, focus, broadcast
 */

import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type {
  ResizeMessage,
  CreateMessage,
  CloseMessage,
  SplitMessage,
  FocusMessage,
  BroadcastMessage,
  PaneCreatedMessage,
  PaneClosedMessage,
  PaneExitedMessage,
  LayoutUpdatedMessage,
  WindowClosedMessage,
  ErrorMessage,
  FlowPauseMessage,
  FlowResumeMessage,
} from '@webterm/shared/messages';
import type { Layout, Pane, ShellType } from '@webterm/shared/models';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/index.js';
import { NotFoundError, PaneLimitError } from '../../utils/errors.js';
import { ptyManager } from '../../services/pty-service.js';
import { sessionService } from '../../services/session-service.js';
import { encodeBinaryMessage, MessageType } from '../protocol.js';
import {
  splitLayout,
  splitLayoutMainVertical,
  removePane as removePaneFromLayout,
  countPanes,
  validatePaneLimit,
  createLeafLayout,
  MAX_PANES_PER_WINDOW,
} from '../../services/layout-service.js';

/** Flow control watermarks in bytes */
const HIGH_WATER_MARK = 64 * 1024; // 64KB
const LOW_WATER_MARK = 16 * 1024;  // 16KB

/** Broadcast mode state per session */
interface BroadcastState {
  enabled: boolean;
  paneIds: Set<string>;
}

/** Output buffer for disconnected clients */
interface OutputBuffer {
  paneId: string;
  data: Uint8Array[];
  totalSize: number;
  paused: boolean;
}

/** Terminal handler context */
export interface TerminalHandlerContext {
  sessionId: string;
  ws: WebSocket;
  /** Current window ID being operated on */
  windowId: string | null;
  /** Current layout tree for the active window */
  layout: Layout | null;
  focusedPaneId: string | null;
  broadcastState: BroadcastState;
  outputBuffers: Map<string, OutputBuffer>;
}

/**
 * Create a new terminal handler context for a session
 */
export function createTerminalContext(sessionId: string, ws: WebSocket): TerminalHandlerContext {
  return {
    sessionId,
    ws,
    windowId: null,
    layout: null,
    focusedPaneId: null,
    broadcastState: { enabled: false, paneIds: new Set() },
    outputBuffers: new Map(),
  };
}

/**
 * Set the window context (called when initial window is created or window is switched)
 */
export function setWindowContext(ctx: TerminalHandlerContext, windowId: string, layout: Layout): void {
  ctx.windowId = windowId;
  ctx.layout = layout;
}

/**
 * Handle resize message - resize PTY dimensions
 */
export async function handleResize(
  ctx: TerminalHandlerContext,
  message: ResizeMessage
): Promise<void> {
  const { paneId, cols, rows } = message.payload;

  logger.debug('Resizing pane', { paneId, cols, rows });

  try {
    const success = ptyManager.resize(paneId, cols, rows);
    if (!success) {
      sendError(ctx.ws, 'PANE_NOT_FOUND', `Pane ${paneId} not found`, paneId);
      return;
    }

    logger.info('Pane resized', { paneId, cols, rows });
  } catch (error) {
    logger.error('Failed to resize pane', { paneId, error });
    sendError(ctx.ws, 'PANE_NOT_FOUND', `Pane ${paneId} not found`, paneId);
  }
}

/**
 * Handle create message - create new pane in window
 */
export async function handleCreate(
  ctx: TerminalHandlerContext,
  message: CreateMessage
): Promise<void> {
  const { windowId, shell, cwd } = message.payload;

  logger.debug('Creating pane', { windowId, shell, cwd });

  try {
    // Check pane limit if we have a layout
    if (ctx.layout && !validatePaneLimit(ctx.layout)) {
      sendError(ctx.ws, 'MAX_PANES_EXCEEDED', `Maximum of ${MAX_PANES_PER_WINDOW} panes per window`);
      return;
    }

    const paneId = randomUUID();

    // Spawn PTY for the pane
    const spawnOpts: import('../../services/pty-service.js').PtySpawnOptions = {
      shell: shell ?? 'default',
      cols: 80,
      rows: 24,
      sessionId: ctx.sessionId,
    };
    if (cwd) spawnOpts.cwd = cwd;
    const ptyInstance = ptyManager.spawn(paneId, spawnOpts);

    const pane: Pane = {
      id: paneId,
      windowId: ctx.windowId ?? windowId,
      shell: (shell ?? 'default') as ShellType,
      cwd: ptyInstance.cwd,
      cols: ptyInstance.cols,
      rows: ptyInstance.rows,
      connectionState: 'connected',
      exitCode: null,
      createdAt: Date.now(),
      title: '',
      marked: false,
      currentCommand: null,
    };

    // If we have an existing layout with a focused pane, split it vertically
    // Otherwise create a leaf layout (for initial pane creation)
    let newLayout: Layout;
    if (ctx.layout && ctx.focusedPaneId) {
      const split = splitLayout(ctx.layout, ctx.focusedPaneId, 'v', paneId);
      newLayout = split ?? createLeafLayout(paneId);
      ctx.layout = newLayout;
    } else if (ctx.layout) {
      // No focused pane, just create a leaf (shouldn't happen normally)
      newLayout = createLeafLayout(paneId);
      ctx.layout = newLayout;
    } else {
      newLayout = createLeafLayout(paneId);
      ctx.layout = newLayout;
    }

    // Persist layout to DB
    if (ctx.windowId) {
      sessionService.updateWindowLayout(ctx.windowId, newLayout);
    }

    sendPaneCreated(ctx.ws, pane, newLayout);
    logger.info('Pane created', { paneId: pane.id, windowId, shell: ptyInstance.shell });
  } catch (error) {
    logger.error('Failed to create pane', { windowId, error });
    if (error instanceof PaneLimitError) {
      sendError(ctx.ws, 'MAX_PANES_EXCEEDED', error.message);
    } else {
      sendError(ctx.ws, 'PTY_SPAWN_FAILED', 'Failed to create pane');
    }
  }
}

/**
 * Handle close message - close pane
 */
export async function handleClose(
  ctx: TerminalHandlerContext,
  message: CloseMessage
): Promise<void> {
  const { paneId } = message.payload;

  logger.debug('Closing pane', { paneId });

  try {
    // Kill the PTY
    ptyManager.kill(paneId);

    // Clean up output buffer
    ctx.outputBuffers.delete(paneId);

    // Remove from broadcast if present
    ctx.broadcastState.paneIds.delete(paneId);

    // Update layout tree
    let newLayout: Layout | null = null;
    if (ctx.layout) {
      newLayout = removePaneFromLayout(ctx.layout, paneId);
      if (newLayout) {
        ctx.layout = newLayout;
      }
    }

    // If layout is null, the last pane was closed — auto-close the window
    if (!newLayout && ctx.windowId) {
      sessionService.deleteWindow(ctx.windowId);
      sendWindowClosed(ctx.ws, ctx.windowId);
      logger.info('Window auto-closed (last pane)', { windowId: ctx.windowId, paneId });
      ctx.windowId = null;
      ctx.layout = null;
      return;
    }

    // Persist layout to DB
    if (ctx.windowId && newLayout) {
      sessionService.updateWindowLayout(ctx.windowId, newLayout);
    }

    const layoutToSend = newLayout ?? { type: 'leaf' as const, paneId: '' };
    sendPaneClosed(ctx.ws, paneId, layoutToSend);
    logger.info('Pane closed', { paneId });
  } catch (error) {
    logger.error('Failed to close pane', { paneId, error });
    sendError(ctx.ws, 'PANE_NOT_FOUND', `Pane ${paneId} not found`, paneId);
  }
}

/**
 * Handle split message - split existing pane
 */
export async function handleSplit(
  ctx: TerminalHandlerContext,
  message: SplitMessage
): Promise<void> {
  const { paneId, direction, shell } = message.payload;

  logger.debug('Splitting pane', { paneId, direction, shell });

  try {
    // Validate we have a layout context
    if (!ctx.layout || !ctx.windowId) {
      sendError(ctx.ws, 'NO_LAYOUT', 'No active window layout', paneId);
      return;
    }

    // Check pane limit
    if (!validatePaneLimit(ctx.layout)) {
      sendError(ctx.ws, 'MAX_PANES_EXCEEDED', `Maximum of ${MAX_PANES_PER_WINDOW} panes per window`, paneId);
      return;
    }

    const newPaneId = randomUUID();

    // Spawn PTY for the new pane
    const ptyInstance = ptyManager.spawn(newPaneId, {
      shell: shell ?? 'default',
      cols: 80,
      rows: 24,
      sessionId: ctx.sessionId,
    });

    // Use main-vertical layout: main pane stays left, new panes stack on the right
    const newLayout = splitLayoutMainVertical(ctx.layout, newPaneId);

    // Update context with the new layout
    ctx.layout = newLayout;

    const newPane: Pane = {
      id: newPaneId,
      windowId: ctx.windowId,
      shell: (shell ?? 'default') as ShellType,
      cwd: ptyInstance.cwd,
      cols: ptyInstance.cols,
      rows: ptyInstance.rows,
      connectionState: 'connected',
      exitCode: null,
      createdAt: Date.now(),
      title: '',
      marked: false,
      currentCommand: null,
    };

    // Persist pane to DB so it survives reconnection
    sessionService.insertPane(ctx.windowId, newPane);

    // Persist layout to DB
    sessionService.updateWindowLayout(ctx.windowId, newLayout);

    sendPaneCreated(ctx.ws, newPane, newLayout);
    logger.info('Pane split', { paneId, newPaneId, direction, paneCount: countPanes(newLayout) });
  } catch (error) {
    logger.error('Failed to split pane', { paneId, error });
    sendError(ctx.ws, 'PTY_SPAWN_FAILED', 'Failed to split pane', paneId);
  }
}

/**
 * Handle focus message - track focused pane
 */
export function handleFocus(
  ctx: TerminalHandlerContext,
  message: FocusMessage
): void {
  const { paneId } = message.payload;
  
  ctx.focusedPaneId = paneId;
  logger.debug('Pane focused', { paneId, sessionId: ctx.sessionId });
}

/**
 * Handle broadcast message - toggle broadcast mode
 */
export function handleBroadcast(
  ctx: TerminalHandlerContext,
  message: BroadcastMessage
): void {
  const { enabled, paneIds } = message.payload;
  
  ctx.broadcastState.enabled = enabled;
  ctx.broadcastState.paneIds = new Set(paneIds);
  
  logger.info('Broadcast mode updated', {
    sessionId: ctx.sessionId,
    enabled,
    paneCount: paneIds.length,
  });
}

/**
 * Route input to appropriate panes (handles broadcast mode)
 */
export function routeInput(
  ctx: TerminalHandlerContext,
  paneId: string,
  data: Uint8Array
): string[] {
  if (ctx.broadcastState.enabled && ctx.broadcastState.paneIds.size > 0) {
    // Route to all broadcast panes
    const targetPanes = Array.from(ctx.broadcastState.paneIds);
    logger.debug('Broadcasting input', { paneCount: targetPanes.length });
    return targetPanes;
  }
  
  // Route to single pane
  return [paneId];
}

/**
 * Handle PTY output with flow control
 */
export function handleOutput(
  ctx: TerminalHandlerContext,
  paneId: string,
  data: Uint8Array
): void {
  let buffer = ctx.outputBuffers.get(paneId);
  
  if (!buffer) {
    buffer = {
      paneId,
      data: [],
      totalSize: 0,
      paused: false,
    };
    ctx.outputBuffers.set(paneId, buffer);
  }
  
  buffer.data.push(data);
  buffer.totalSize += data.length;
  
  // Check high water mark for flow control
  if (!buffer.paused && buffer.totalSize >= HIGH_WATER_MARK) {
    buffer.paused = true;
    sendFlowPause(ctx.ws, paneId);
    logger.debug('Flow control: paused', { paneId, bufferSize: buffer.totalSize });
  }
}

/**
 * Flush output buffer (after sending data to client)
 */
export function flushOutputBuffer(
  ctx: TerminalHandlerContext,
  paneId: string,
  bytesSent: number
): void {
  const buffer = ctx.outputBuffers.get(paneId);
  if (!buffer) return;
  
  buffer.totalSize -= bytesSent;
  
  // Check low water mark to resume
  if (buffer.paused && buffer.totalSize <= LOW_WATER_MARK) {
    buffer.paused = false;
    sendFlowResume(ctx.ws, paneId);
    logger.debug('Flow control: resumed', { paneId, bufferSize: buffer.totalSize });
  }
}

/**
 * Handle pane exit notification
 */
export function handlePaneExit(
  ctx: TerminalHandlerContext,
  paneId: string,
  exitCode: number
): void {
  sendPaneExited(ctx.ws, paneId, exitCode);
  ctx.outputBuffers.delete(paneId);
  ctx.broadcastState.paneIds.delete(paneId);
  
  logger.info('Pane exited', { paneId, exitCode });
}

// ============================================================================
// Message Senders
// ============================================================================

function sendJson(ws: WebSocket, message: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendPaneCreated(ws: WebSocket, pane: Pane, layout: Layout): void {
  const message: PaneCreatedMessage = {
    type: 'paneCreated',
    payload: { pane, layout },
  };
  sendJson(ws, message);
}

function sendPaneClosed(ws: WebSocket, paneId: string, layout: Layout): void {
  const message: PaneClosedMessage = {
    type: 'paneClosed',
    payload: { paneId, layout },
  };
  sendJson(ws, message);
}

function sendPaneExited(ws: WebSocket, paneId: string, exitCode: number): void {
  const message: PaneExitedMessage = {
    type: 'paneExited',
    payload: { paneId, exitCode },
  };
  sendJson(ws, message);
}

export function sendLayoutUpdated(ws: WebSocket, windowId: string, layout: Layout): void {
  const message: LayoutUpdatedMessage = {
    type: 'layoutUpdated',
    payload: { windowId, layout },
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

function sendFlowPause(ws: WebSocket, paneId: string): void {
  const message: FlowPauseMessage = {
    type: 'flowPause',
    payload: { paneId },
  };
  sendJson(ws, message);
}

function sendFlowResume(ws: WebSocket, paneId: string): void {
  const message: FlowResumeMessage = {
    type: 'flowResume',
    payload: { paneId },
  };
  sendJson(ws, message);
}

export function sendError(
  ws: WebSocket,
  code: string,
  message: string,
  paneId?: string
): void {
  const payload: ErrorMessage['payload'] = { code, message };
  if (paneId !== undefined) {
    payload.paneId = paneId;
  }
  const errorMessage: ErrorMessage = {
    type: 'error',
    payload,
  };
  sendJson(ws, errorMessage);
}

/**
 * Send output to client (binary message)
 */
export function sendOutputToClient(ws: WebSocket, paneId: string, data: Uint8Array): void {
  if (ws.readyState === ws.OPEN) {
    const message = encodeBinaryMessage(MessageType.OUTPUT, paneId, data);
    ws.send(message);
  }
}
