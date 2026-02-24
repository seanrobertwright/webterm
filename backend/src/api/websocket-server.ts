/**
 * WebSocket server for WebTerm terminal I/O
 * Handles real-time communication for terminal input/output
 */

import { randomUUID } from 'node:crypto';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  decodeBinaryMessage,
  encodeBinaryMessage,
  MessageType,
} from './protocol.js';
import { ptyManager } from '../services/pty-service.js';
import { sessionService } from '../services/session-service.js';
import { commandService } from '../services/command-service.js';
import { pasteBufferService } from '../services/paste-buffer-service.js';
import { defaultRegistry } from '../../../shared/tmux/command-defs.js';
import { hookService } from '../services/hook-service.js';
import { getPaneIds } from '../services/layout-service.js';
import type { Pane, Layout, WindowWithPanes } from '@webterm/shared/models';
import {
  createTerminalContext,
  setWindowContext,
  handleResize,
  handleCreate,
  handleClose,
  handleSplit,
  handleFocus,
  handleBroadcast,
  routeInput,
  sendError,
  type TerminalHandlerContext,
} from './handlers/terminal-handler.js';
import {
  createSessionContext,
  handleCreateWindow,
  handleCloseWindow,
  handleSwitchWindow,
  sendReconnected,
  type SessionHandlerContext,
} from './handlers/session-handler.js';
import type {
  ClientMessage,
  ConnectedMessage,
} from '@webterm/shared/messages';
import type { Session } from '@webterm/shared/models';

/** Client connection state */
interface ClientConnection {
  ws: WebSocket;
  clientId: string;
  sessionId: string;
  terminalCtx: TerminalHandlerContext;
  sessionCtx: SessionHandlerContext;
  isAlive: boolean;
  readOnly: boolean;
  connectedAt: number;
}

/** Output buffer for disconnected sessions */
interface DisconnectedBuffer {
  sessionId: string;
  data: Map<string, Uint8Array[]>; // paneId -> output chunks
  disconnectedAt: number;
}

/** WebSocket server state */
interface WebSocketServerState {
  wss: WebSocketServer;
  clients: Map<string, Set<ClientConnection>>; // sessionId -> set of connections
  disconnectedBuffers: Map<string, DisconnectedBuffer>;
  heartbeatInterval: NodeJS.Timeout | null;
}

let serverState: WebSocketServerState | null = null;

/** Per-window silence timers — fires when no PTY output for monitorSilence seconds */
const silenceTimers: Map<string, NodeJS.Timeout> = new Map();

/** In-memory window monitoring flags (transient, cleared on window switch) */
const windowFlags: Map<string, { activity: boolean; bell: boolean; silence: boolean }> = new Map();

/**
 * Get or create the flags entry for a window
 */
function getWindowFlags(windowId: string): { activity: boolean; bell: boolean; silence: boolean } {
  let flags = windowFlags.get(windowId);
  if (!flags) {
    flags = { activity: false, bell: false, silence: false };
    windowFlags.set(windowId, flags);
  }
  return flags;
}

/**
 * Clear monitoring flags for a window (called when user switches to it)
 */
export function clearWindowFlags(windowId: string): void {
  const flags = windowFlags.get(windowId);
  if (flags) {
    flags.activity = false;
    flags.bell = false;
    flags.silence = false;
  }
}

/**
 * Send an activity/bell/silence alert to the client
 */
function sendActivityAlert(
  ws: WebSocket,
  windowId: string,
  alertType: 'activity' | 'bell' | 'silence',
  message: string
): void {
  sendJson(ws, {
    type: 'activityAlert',
    payload: { windowId, alertType, message },
  });
}

/**
 * Check if a pane's window is the active window for its session
 * Returns { windowId, sessionId, isActive, window } or null if pane/window not found
 */
function getPaneWindowContext(paneId: string): {
  windowId: string;
  sessionId: string;
  isActive: boolean;
  windowName: string;
  monitorActivity: boolean;
  monitorSilence: number;
  monitorBell: boolean;
} | null {
  const pane = sessionService.getPane(paneId);
  if (!pane) return null;

  const window = sessionService.getWindow(pane.windowId);
  if (!window) return null;

  const session = sessionService.getSession(window.sessionId);
  if (!session) return null;

  return {
    windowId: window.id,
    sessionId: session.id,
    isActive: session.activeWindowId === window.id,
    windowName: window.name,
    monitorActivity: window.monitorActivity,
    monitorSilence: window.monitorSilence,
    monitorBell: window.monitorBell,
  };
}

/**
 * Reset or start the silence timer for a window.
 * When the timer fires (no output for monitorSilence seconds), sends a silence alert.
 */
function resetSilenceTimer(windowId: string, windowName: string, silenceSeconds: number): void {
  // Clear existing timer
  const existing = silenceTimers.get(windowId);
  if (existing) {
    clearTimeout(existing);
  }

  if (silenceSeconds <= 0) {
    silenceTimers.delete(windowId);
    return;
  }

  const timer = setTimeout(() => {
    silenceTimers.delete(windowId);
    const flags = getWindowFlags(windowId);
    if (!flags.silence) {
      flags.silence = true;
      // Find all clients for this window's session
      const win = sessionService.getWindow(windowId);
      if (win) {
        const clients = serverState?.clients.get(win.sessionId);
        if (clients) {
          for (const client of clients) {
            if (client.ws.readyState === client.ws.OPEN) {
              sendActivityAlert(
                client.ws,
                windowId,
                'silence',
                `Silence in window '${windowName}' (${String(silenceSeconds)}s)`
              );
            }
          }
        }
      }
    }
  }, silenceSeconds * 1000);

  silenceTimers.set(windowId, timer);
}

/**
 * Create and attach WebSocket server to HTTP server
 */
export function createWebSocketServer(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
  });

  serverState = {
    wss,
    clients: new Map(),
    disconnectedBuffers: new Map(),
    heartbeatInterval: null,
  };

  // Handle HTTP upgrade requests for WebSocket
  httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = getPathname(request);

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Handle new WebSocket connections
  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    handleConnection(ws, request);
  });

  // Start heartbeat
  startHeartbeat();

  logger.info('WebSocket server created');

  return wss;
}

/**
 * Get pathname from incoming request
 */
function getPathname(request: IncomingMessage): string {
  try {
    const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
    return url.pathname;
  } catch {
    return '';
  }
}

/**
 * Parse query parameters from request URL
 */
function parseQueryParams(request: IncomingMessage): Map<string, string> {
  try {
    const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
    const params = new Map<string, string>();
    url.searchParams.forEach((value, key) => params.set(key, value));
    return params;
  } catch {
    return new Map();
  }
}

/**
 * Handle new WebSocket connection
 */
async function handleConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
  const params = parseQueryParams(request);
  const requestedSessionId = params.get('sessionId');

  let sessionId: string;
  let session: Session;
  let isReconnect = false;

  if (requestedSessionId) {
    // Attempt to resume existing session from database
    const existingSession = sessionService.getSession(requestedSessionId);
    if (existingSession) {
      session = {
        id: existingSession.id,
        name: existingSession.name,
        createdAt: existingSession.createdAt,
        updatedAt: existingSession.updatedAt,
        activeWindowId: existingSession.activeWindowId,
        lastWindowId: existingSession.lastWindowId ?? null,
      };
      sessionId = requestedSessionId;
      isReconnect = true;
      logger.info('Session resumed from DB', { sessionId });
    } else {
      logger.warn('Session not found, creating new', { requestedSessionId });
      sessionId = randomUUID();
      session = createNewSession(sessionId);
    }
  } else {
    // Create new session
    sessionId = randomUUID();
    session = createNewSession(sessionId);
    logger.info('New session created', { sessionId });
  }

  // Multi-client: we no longer close existing connections when a new one arrives

  // Create handler contexts
  const terminalCtx = createTerminalContext(sessionId, ws);
  const sessionCtx = createSessionContext(sessionId, ws);

  // Set up PTY event handlers for this session
  ptyManager.setEventHandlers({
    onData: (paneId, data) => {
      // Broadcast binary output to all clients connected to this session
      const outputBuffer = Buffer.from(data, 'utf-8');
      const message = encodeBinaryMessage(MessageType.OUTPUT, paneId, new Uint8Array(outputBuffer));
      broadcastBinaryToSession(sessionId, message);

      // Activity and silence monitoring
      const ctx = getPaneWindowContext(paneId);
      if (ctx) {
        // Reset silence timer whenever output is received (regardless of active window)
        if (ctx.monitorSilence > 0) {
          resetSilenceTimer(ctx.windowId, ctx.windowName, ctx.monitorSilence);
        }

        // Activity monitoring: only alert for non-active windows
        if (!ctx.isActive && ctx.monitorActivity) {
          const flags = getWindowFlags(ctx.windowId);
          if (!flags.activity) {
            flags.activity = true;
            broadcastJsonToSession(sessionId, {
              type: 'activityAlert',
              payload: {
                windowId: ctx.windowId,
                alertType: 'activity',
                message: `Activity in window '${ctx.windowName}'`,
              },
            });
          }
        }
      }
    },
    onExit: (paneId, exitCode) => {
      // Broadcast pane exited message to all clients
      broadcastJsonToSession(sessionId, {
        type: 'paneExited',
        payload: { paneId, exitCode },
      });
    },
    onTitleChange: (paneId, title) => {
      // Update pane title in DB
      sessionService.updatePaneTitle(paneId, title);

      // Broadcast paneTitleChanged to all clients
      broadcastJsonToSession(sessionId, {
        type: 'paneTitleChanged',
        payload: { paneId, title },
      });

      // If the pane's window has auto-rename enabled, update the window name
      const pane = sessionService.getPane(paneId);
      if (pane) {
        const window = sessionService.getWindow(pane.windowId);
        if (window && window.autoRename) {
          sessionService.renameWindow(window.id, title);
          broadcastJsonToSession(sessionId, {
            type: 'windowRenamed',
            payload: { windowId: window.id, name: title },
          });
        }
      }
    },
    onBell: (paneId) => {
      // Bell monitoring: alert for non-active windows with monitorBell enabled
      const ctx = getPaneWindowContext(paneId);
      if (ctx && !ctx.isActive && ctx.monitorBell) {
        const flags = getWindowFlags(ctx.windowId);
        if (!flags.bell) {
          flags.bell = true;
          broadcastJsonToSession(sessionId, {
            type: 'activityAlert',
            payload: {
              windowId: ctx.windowId,
              alertType: 'bell',
              message: `Bell in window '${ctx.windowName}'`,
            },
          });
        }
      }
    },
  });

  // Create client connection
  const client: ClientConnection = {
    ws,
    clientId: randomUUID(),
    sessionId,
    terminalCtx,
    sessionCtx,
    isAlive: true,
    readOnly: false,
    connectedAt: Date.now(),
  };

  // Add client to the session's connection set
  if (serverState) {
    let clientSet = serverState.clients.get(sessionId);
    if (!clientSet) {
      clientSet = new Set();
      serverState.clients.set(sessionId, clientSet);
    }
    clientSet.add(client);
  }

  // Set up WebSocket event handlers
  setupWebSocketHandlers(client);

  // Send connected message
  sendConnected(ws, sessionId, session);

  // Create initial window if this is a new session
  if (!isReconnect) {
    // Use sessionService.createSession to persist to DB immediately
    const dbSession = sessionService.createSession({ name: session.name });

    // The DB assigned its own IDs — update our sessionId mapping
    // We need to re-map the client connection to the DB session ID
    if (dbSession.id !== sessionId) {
      // Move the entire client set to the new session ID
      const existingSet = serverState?.clients.get(sessionId);
      if (existingSet) {
        serverState?.clients.delete(sessionId);
        sessionId = dbSession.id;
        client.sessionId = sessionId;
        terminalCtx.sessionId = sessionId;
        sessionCtx.sessionId = sessionId;
        serverState?.clients.set(sessionId, existingSet);
      } else {
        sessionId = dbSession.id;
        client.sessionId = sessionId;
        terminalCtx.sessionId = sessionId;
        sessionCtx.sessionId = sessionId;
      }
      // Re-send connected with the correct session ID
      sendConnected(ws, sessionId, {
        id: dbSession.id,
        name: dbSession.name,
        createdAt: dbSession.createdAt,
        updatedAt: dbSession.updatedAt,
        activeWindowId: dbSession.activeWindowId,
        lastWindowId: dbSession.lastWindowId ?? null,
      });
    }

    const dbWindow = dbSession.windows[0];
    if (dbWindow) {
      const dbPane = dbWindow.panes[0];
      if (dbPane) {
        // Spawn PTY for the initial pane
        ptyManager.spawn(dbPane.id, {
          shell: dbPane.shell,
          cols: dbPane.cols,
          rows: dbPane.rows,
        });

        // Update pane connection state in DB
        sessionService.updatePaneConnectionState(dbPane.id, 'connected');

        // Update pane object for the client message
        dbPane.connectionState = 'connected';
      }

      // Set window context on terminal handler so split/close have layout access
      setWindowContext(terminalCtx, dbWindow.id, dbWindow.layout);

      // Send window created message to initialize the client
      sendWindowCreated(ws, dbWindow);
      logger.info('Initial window created', { windowId: dbWindow.id, sessionId, paneId: dbPane?.id });
    }
  }

  // If reconnecting, restore windows/layout and send buffered output
  if (isReconnect) {
    const restoredSession = sessionService.getSession(sessionId);
    if (restoredSession) {
      // Send each window's layout to the client and set up terminal context
      for (const win of restoredSession.windows) {
        // Re-spawn PTYs for panes that aren't already running
        for (const pane of win.panes) {
          if (!ptyManager.hasPty(pane.id)) {
            const spawnOpts: { shell: typeof pane.shell; cols: number; rows: number; cwd?: string } = {
              shell: pane.shell,
              cols: pane.cols,
              rows: pane.rows,
            };
            if (pane.cwd !== null) {
              spawnOpts.cwd = pane.cwd;
            }
            ptyManager.spawn(pane.id, spawnOpts);
          }
        }

        sendWindowCreated(ws, win);
      }

      // Set terminal context to the active window
      const activeWin = restoredSession.windows.find(w => w.id === restoredSession.activeWindowId)
        ?? restoredSession.windows[0];
      if (activeWin) {
        setWindowContext(terminalCtx, activeWin.id, activeWin.layout);
      }

      logger.info('Session restored from DB', {
        sessionId,
        windowCount: restoredSession.windows.length,
      });
    }

    // Send buffered output
    const buffer = serverState?.disconnectedBuffers.get(sessionId);
    if (buffer && buffer.data.size > 0) {
      const missedPaneIds = Array.from(buffer.data.keys());
      sendReconnected(ws, sessionId, missedPaneIds);

      for (const [paneId, chunks] of buffer.data) {
        for (const chunk of chunks) {
          sendBinaryOutput(ws, paneId, chunk);
        }
      }

      serverState?.disconnectedBuffers.delete(sessionId);
      logger.info('Sent buffered output', { sessionId, paneCount: missedPaneIds.length });
    }
  }
}

/**
 * Create a new session object
 */
function createNewSession(sessionId: string): Session {
  return {
    id: sessionId,
    name: 'Default Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activeWindowId: null,
    lastWindowId: null,
  };
}

/**
 * Set up event handlers for a WebSocket connection
 */
function setupWebSocketHandlers(client: ClientConnection): void {
  const { ws, sessionId, terminalCtx, sessionCtx } = client;

  ws.on('message', async (data: Buffer, isBinary: boolean) => {
    try {
      if (isBinary) {
        await handleBinaryMessage(terminalCtx, data);
      } else {
        await handleJsonMessage(terminalCtx, sessionCtx, data.toString());
      }
    } catch (error) {
      logger.error('Error handling message', { sessionId, error });
      sendError(ws, 'INVALID_MESSAGE', 'Failed to process message');
    }
  });

  // Also handle protocol-level pong (direct connections, not proxied)
  ws.on('pong', () => {
    client.isAlive = true;
  });

  ws.on('close', (code: number, reason: Buffer) => {
    handleDisconnect(client, code, reason.toString());
  });

  ws.on('error', (error: Error) => {
    logger.error('WebSocket error', { sessionId, error: error.message });
  });
}

/**
 * Handle binary message (terminal input)
 */
async function handleBinaryMessage(
  ctx: TerminalHandlerContext,
  data: Buffer
): Promise<void> {
  const decoded = decodeBinaryMessage(data);

  if (decoded.type !== MessageType.INPUT) {
    logger.warn('Unexpected binary message type', { type: decoded.type });
    return;
  }

  const { paneId, payload } = decoded;

  // Route input to appropriate panes (handles broadcast mode)
  const targetPanes = routeInput(ctx, paneId, payload);

  // Import ptyManager to send input to PTYs
  const { ptyManager } = await import('../services/pty-service.js');

  for (const targetPaneId of targetPanes) {
    // Convert Uint8Array to string and write to PTY
    const inputData = Buffer.from(payload).toString('utf-8');
    ptyManager.write(targetPaneId, inputData);
    logger.debug('Input routed to pane', { paneId: targetPaneId, bytes: payload.length });
  }
}

/**
 * Handle JSON message (control operations)
 */
async function handleJsonMessage(
  terminalCtx: TerminalHandlerContext,
  sessionCtx: SessionHandlerContext,
  data: string
): Promise<void> {
  let message: ClientMessage;

  try {
    message = JSON.parse(data) as ClientMessage;
  } catch {
    sendError(terminalCtx.ws, 'INVALID_MESSAGE', 'Invalid JSON message');
    return;
  }

  logger.debug('Received message', { type: message.type });

  switch (message.type) {
    // Heartbeat
    case 'pong': {
      // Find the specific client by ws reference and mark as alive
      const clientSet = serverState?.clients.get(terminalCtx.sessionId);
      if (clientSet) {
        for (const c of clientSet) {
          if (c.ws === terminalCtx.ws) {
            c.isAlive = true;
            break;
          }
        }
      }
      return;
    }

    // Terminal operations
    case 'resize':
      await handleResize(terminalCtx, message);
      break;
    case 'create':
      await handleCreate(terminalCtx, message);
      break;
    case 'close':
      await handleClose(terminalCtx, message);
      break;
    case 'split':
      await handleSplit(terminalCtx, message);
      break;
    case 'focus':
      handleFocus(terminalCtx, message);
      break;
    case 'broadcast':
      handleBroadcast(terminalCtx, message);
      break;

    // Session operations
    case 'createWindow':
      await handleCreateWindow(sessionCtx, message);
      fireHooks('after-new-window', terminalCtx.sessionId, terminalCtx.windowId ?? '', terminalCtx.focusedPaneId ?? '');
      break;
    case 'closeWindow': {
      // Clean up silence timer and flags for the closed window
      const closingWindowId = message.payload.windowId;
      const existingTimer = silenceTimers.get(closingWindowId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        silenceTimers.delete(closingWindowId);
      }
      windowFlags.delete(closingWindowId);
      await handleCloseWindow(sessionCtx, message);
      fireHooks('after-kill-window', terminalCtx.sessionId, closingWindowId, terminalCtx.focusedPaneId ?? '');
      break;
    }
    case 'switchWindow':
      // Clear monitoring flags for the window being switched to
      clearWindowFlags(message.payload.windowId);
      await handleSwitchWindow(sessionCtx, message);
      break;

    // Command execution
    case 'executeCommand': {
      const { command } = message.payload;
      const parseResult = defaultRegistry.parse(command);

      if (!parseResult.ok) {
        sendJson(terminalCtx.ws, {
          type: 'commandError',
          payload: {
            message: parseResult.error,
            command,
          },
        });
        return;
      }

      // Build command context from terminal handler state
      let windowId = terminalCtx.windowId ?? '';
      let paneId = terminalCtx.focusedPaneId ?? '';

      // Look up session for fallback values
      const session = sessionService.getSession(terminalCtx.sessionId);

      // Fall back to session's active window if not tracked on context
      if (!windowId && session?.activeWindowId) {
        windowId = session.activeWindowId;
      }

      // Fall back to first pane in active window if no focused pane
      if (!paneId && windowId && session) {
        const win = session.windows.find((w) => w.id === windowId);
        if (win && win.panes.length > 0) {
          paneId = win.panes[0]!.id;
        }
      }

      const ctx = {
        sessionId: terminalCtx.sessionId,
        windowId,
        paneId,
      };

      const result = commandService.execute(parseResult.value, ctx);

      if (result.success) {
        // Handle special output markers from command handlers
        if (result.output === '__DETACH__') {
          // Send detach confirmation to client, then close the connection.
          // Session and PTYs remain running for later reconnection.
          sendJson(terminalCtx.ws, {
            type: 'sessionDetached',
            payload: {
              sessionId: terminalCtx.sessionId,
              reason: 'detach-client',
            },
          });
          // Close the WebSocket gracefully after a short delay so the
          // sessionDetached message has time to be sent.
          setTimeout(() => {
            const detachSet = serverState?.clients.get(terminalCtx.sessionId);
            if (detachSet) {
              // Find and remove only the requesting client
              for (const c of detachSet) {
                if (c.ws === terminalCtx.ws) {
                  c.ws.close(1000, 'Client detached');
                  detachSet.delete(c);
                  break;
                }
              }
              // Clean up empty set
              if (detachSet.size === 0) {
                serverState?.clients.delete(terminalCtx.sessionId);
              }
            }
          }, 100);
          break;
        }

        if (result.output.startsWith('__SWITCH__:')) {
          const targetSessionId = result.output.slice('__SWITCH__:'.length);
          const targetSession = sessionService.getSession(targetSessionId);
          if (targetSession) {
            sendJson(terminalCtx.ws, {
              type: 'sessionSwitched',
              payload: {
                sessionId: targetSession.id,
                session: {
                  id: targetSession.id,
                  name: targetSession.name,
                  createdAt: targetSession.createdAt,
                  updatedAt: targetSession.updatedAt,
                  activeWindowId: targetSession.activeWindowId,
                  lastWindowId: targetSession.lastWindowId,
                },
              },
            });
          } else {
            sendJson(terminalCtx.ws, {
              type: 'commandError',
              payload: {
                message: `Session not found: ${targetSessionId}`,
                command,
              },
            });
          }
          break;
        }

        if (result.output.startsWith('__CHOOSE_TREE__:')) {
          // Trigger choose-tree data flow (same as requestChooseTree)
          const allSessions = sessionService.getAllSessions();
          const connectedSessionIds = new Set(getConnectedSessions());

          const sessions = allSessions.map((s) => {
            const fullSession = sessionService.getSession(s.id);
            const windows = (fullSession?.windows ?? []).map((win) => {
              const paneIds = getPaneIds(win.layout);
              const panes = win.panes.map((pane, idx) => ({
                id: pane.id,
                index: idx,
                active: pane.id === (paneIds[0] ?? ''),
                title: pane.title || pane.shell,
                currentCommand: pane.currentCommand,
                size: `${String(pane.cols)}x${String(pane.rows)}`,
              }));

              return {
                id: win.id,
                index: win.index,
                name: win.name,
                active: win.id === fullSession?.activeWindowId,
                panes,
              };
            });

            return {
              id: s.id,
              name: s.name,
              attached: connectedSessionIds.has(s.id) ? 1 : 0,
              windows,
            };
          });

          sendJson(terminalCtx.ws, {
            type: 'chooseTreeData',
            payload: { sessions },
          });
          break;
        }

        if (result.output.startsWith('__CHOOSE_BUFFER__:')) {
          const data = result.output.slice('__CHOOSE_BUFFER__:'.length);
          sendJson(terminalCtx.ws, {
            type: 'commandResult',
            payload: { output: `CHOOSE_BUFFER:${data}`, success: true },
          });
          break;
        }

        sendJson(terminalCtx.ws, {
          type: 'commandResult',
          payload: {
            output: result.output,
            success: true,
          },
        });

        // After successful set-option, broadcast optionChanged to the client
        if (parseResult.value.command === 'set-option') {
          const optName = parseResult.value.positional[0];
          const optValue = parseResult.value.positional[1] ?? '';
          const isUnset = parseResult.value.flags.get('u') === true;
          if (optName && !isUnset) {
            sendJson(terminalCtx.ws, {
              type: 'optionChanged',
              payload: { name: optName, value: optValue, scope: 'session' },
            });
          }
        }
      } else {
        sendJson(terminalCtx.ws, {
          type: 'commandError',
          payload: {
            message: result.output,
            command,
          },
        });
      }
      break;
    }

    // Paste buffer operations
    case 'yankToBuffer': {
      const { content, bufferName } = message.payload;
      const name = pasteBufferService.add(content, bufferName);
      sendJson(terminalCtx.ws, {
        type: 'commandResult',
        payload: {
          output: name,
          success: true,
        },
      });
      logger.debug('Yanked to paste buffer', { bufferName: name, size: content.length });
      break;
    }

    // Choose-tree data request
    case 'requestChooseTree': {
      const allSessions = sessionService.getAllSessions();
      const connectedSessionIds = new Set(getConnectedSessions());

      const sessions = allSessions.map((s) => {
        const fullSession = sessionService.getSession(s.id);
        const windows = (fullSession?.windows ?? []).map((win) => {
          const paneIds = getPaneIds(win.layout);
          const panes = win.panes.map((pane, idx) => ({
            id: pane.id,
            index: idx,
            active: pane.id === (paneIds[0] ?? ''),
            title: pane.title || pane.shell,
            currentCommand: pane.currentCommand,
            size: `${String(pane.cols)}x${String(pane.rows)}`,
          }));

          return {
            id: win.id,
            index: win.index,
            name: win.name,
            active: win.id === fullSession?.activeWindowId,
            panes,
          };
        });

        return {
          id: s.id,
          name: s.name,
          attached: connectedSessionIds.has(s.id) ? 1 : 0,
          windows,
        };
      });

      sendJson(terminalCtx.ws, {
        type: 'chooseTreeData',
        payload: { sessions },
      });
      break;
    }

    default:
      logger.warn('Unknown message type', { type: (message as { type: string }).type });
      sendError(terminalCtx.ws, 'INVALID_MESSAGE', `Unknown message type: ${(message as { type: string }).type}`);
  }
}

/**
 * Handle client disconnection
 */
function handleDisconnect(client: ClientConnection, code: number, reason: string): void {
  const { sessionId, terminalCtx } = client;

  logger.info('Client disconnected', { sessionId, clientId: client.clientId, code, reason });

  // Remove this specific client from the session's set
  const clientSet = serverState?.clients.get(sessionId);
  if (clientSet) {
    clientSet.delete(client);
    // If no more clients in this session, clean up the set entry
    if (clientSet.size === 0) {
      serverState?.clients.delete(sessionId);

      // Buffer output for potential reconnection (only when last client leaves)
      if (terminalCtx.outputBuffers.size > 0) {
        const buffer: DisconnectedBuffer = {
          sessionId,
          data: new Map(),
          disconnectedAt: Date.now(),
        };

        for (const [paneId, outputBuffer] of terminalCtx.outputBuffers) {
          buffer.data.set(paneId, [...outputBuffer.data]);
        }

        serverState?.disconnectedBuffers.set(sessionId, buffer);
        logger.debug('Buffered output for reconnection', { sessionId, paneCount: buffer.data.size });
      }

      // Set timeout to clean up disconnected buffer
      setTimeout(() => {
        const buffer = serverState?.disconnectedBuffers.get(sessionId);
        if (buffer && Date.now() - buffer.disconnectedAt > config.ptyBufferSize * 1000) {
          serverState?.disconnectedBuffers.delete(sessionId);
          logger.debug('Cleaned up disconnected buffer', { sessionId });
        }
      }, config.ptyBufferSize * 1000);
    }
  }
}

/**
 * Start heartbeat ping/pong
 */
function startHeartbeat(): void {
  if (!serverState) return;

  serverState.heartbeatInterval = setInterval(() => {
    serverState?.clients.forEach((clientSet, sessionId) => {
      for (const client of clientSet) {
        if (!client.isAlive) {
          // Client didn't respond to the previous ping — terminate
          logger.warn('Client heartbeat timeout', { sessionId, clientId: client.clientId });
          client.ws.terminate();
          clientSet.delete(client);
          continue;
        }

        // Mark as dead; the pong handler will set it back to true
        client.isAlive = false;
        // Send application-level ping (works through proxies like Vite dev server)
        if (client.ws.readyState === client.ws.OPEN) {
          client.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }

      // Clean up empty sets
      if (clientSet.size === 0) {
        serverState?.clients.delete(sessionId);
      }
    });
  }, config.wsHeartbeatInterval);

  logger.debug('Heartbeat started', { interval: config.wsHeartbeatInterval });
}

/**
 * Stop heartbeat
 */
function stopHeartbeat(): void {
  if (serverState?.heartbeatInterval) {
    clearInterval(serverState.heartbeatInterval);
    serverState.heartbeatInterval = null;
    logger.debug('Heartbeat stopped');
  }
}

/**
 * Broadcast a JSON message to ALL clients in a session
 */
function broadcastJsonToSession(sessionId: string, message: object): void {
  const clientSet = serverState?.clients.get(sessionId);
  if (!clientSet) return;
  const json = JSON.stringify(message);
  for (const client of clientSet) {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(json);
    }
  }
}

/**
 * Broadcast a pre-encoded binary message to ALL clients in a session
 */
function broadcastBinaryToSession(sessionId: string, data: Uint8Array): void {
  const clientSet = serverState?.clients.get(sessionId);
  if (!clientSet) return;
  for (const client of clientSet) {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(data);
    }
  }
}

/**
 * Broadcast a JSON message to all clients in a session (public API)
 */
export function broadcastToSession(sessionId: string, message: object): void {
  broadcastJsonToSession(sessionId, message);
}

/**
 * Send a JSON message to client
 */
function sendJson(ws: WebSocket, message: object): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send connected message to client
 */
function sendConnected(ws: WebSocket, sessionId: string, session: Session): void {
  const message: ConnectedMessage = {
    type: 'connected',
    payload: { sessionId, session },
  };

  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * Send binary output to client
 */
function sendBinaryOutput(ws: WebSocket, paneId: string, data: Uint8Array): void {
  if (ws.readyState === ws.OPEN) {
    const message = encodeBinaryMessage(MessageType.OUTPUT, paneId, data);
    ws.send(message);
  }
}

/**
 * Send window created message to client
 */
function sendWindowCreated(ws: WebSocket, window: WindowWithPanes): void {
  if (ws.readyState === ws.OPEN) {
    const message = {
      type: 'windowCreated',
      payload: { window },
    };
    ws.send(JSON.stringify(message));
  }
}

/**
 * Fire hooks for a lifecycle event.
 * Each hook command is parsed and executed via CommandService.
 */
function fireHooks(event: string, sessionId: string, windowId: string, paneId: string): void {
  const commands = hookService.fire(event);
  for (const cmd of commands) {
    const parseResult = defaultRegistry.parse(cmd);
    if (!parseResult.ok) {
      logger.warn(`Hook command parse error for "${event}": ${parseResult.error}`);
      continue;
    }
    commandService.execute(parseResult.value, { sessionId, windowId, paneId });
  }
}

/**
 * Send output to all clients connected to a session
 */
export function sendOutputToSession(sessionId: string, paneId: string, data: Uint8Array): boolean {
  const clientSet = serverState?.clients.get(sessionId);
  let sent = false;

  if (clientSet) {
    for (const client of clientSet) {
      if (client.ws.readyState === client.ws.OPEN) {
        sendBinaryOutput(client.ws, paneId, data);
        sent = true;
      }
    }
  }

  if (sent) {
    return true;
  }

  // Buffer output for disconnected session (no live clients)
  let buffer = serverState?.disconnectedBuffers.get(sessionId);
  if (!buffer) {
    buffer = {
      sessionId,
      data: new Map(),
      disconnectedAt: Date.now(),
    };
    serverState?.disconnectedBuffers.set(sessionId, buffer);
  }

  let paneData = buffer.data.get(paneId);
  if (!paneData) {
    paneData = [];
    buffer.data.set(paneId, paneData);
  }
  paneData.push(data);

  return false;
}

/**
 * Get the first client connection for a session (or a specific one by clientId)
 */
export function getClient(sessionId: string, clientId?: string): ClientConnection | undefined {
  const clientSet = serverState?.clients.get(sessionId);
  if (!clientSet) return undefined;
  if (clientId) {
    for (const client of clientSet) {
      if (client.clientId === clientId) return client;
    }
    return undefined;
  }
  // Return the first client in the set
  for (const client of clientSet) {
    return client;
  }
  return undefined;
}

/**
 * Get all client connections for a session
 */
export function getSessionClients(sessionId: string): ClientConnection[] {
  const clientSet = serverState?.clients.get(sessionId);
  if (!clientSet) return [];
  return Array.from(clientSet);
}

/**
 * Get all connected session IDs
 */
export function getConnectedSessions(): string[] {
  return Array.from(serverState?.clients.keys() ?? []);
}

/**
 * Close WebSocket server
 */
export function closeWebSocketServer(): Promise<void> {
  return new Promise((resolve) => {
    stopHeartbeat();

    // Clean up all silence timers
    for (const timer of silenceTimers.values()) {
      clearTimeout(timer);
    }
    silenceTimers.clear();
    windowFlags.clear();

    if (serverState?.wss) {
      // Close all connections
      serverState.clients.forEach((clientSet) => {
        for (const client of clientSet) {
          client.ws.close(1000, 'Server shutting down');
        }
      });
      serverState.clients.clear();

      serverState.wss.close(() => {
        logger.info('WebSocket server closed');
        serverState = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
