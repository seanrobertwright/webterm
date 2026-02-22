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
  sessionId: string;
  terminalCtx: TerminalHandlerContext;
  sessionCtx: SessionHandlerContext;
  isAlive: boolean;
  lastPing: number;
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
  clients: Map<string, ClientConnection>; // sessionId -> connection
  disconnectedBuffers: Map<string, DisconnectedBuffer>;
  heartbeatInterval: NodeJS.Timeout | null;
}

let serverState: WebSocketServerState | null = null;

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

  // Check if there's already a connection for this session
  const existingConnection = serverState?.clients.get(sessionId);
  if (existingConnection) {
    // Close old connection
    existingConnection.ws.close(1000, 'New connection established');
    serverState?.clients.delete(sessionId);
  }

  // Create handler contexts
  const terminalCtx = createTerminalContext(sessionId, ws);
  const sessionCtx = createSessionContext(sessionId, ws);

  // Set up PTY event handlers for this session
  ptyManager.setEventHandlers({
    onData: (paneId, data) => {
      if (ws.readyState === ws.OPEN) {
        const outputBuffer = Buffer.from(data, 'utf-8');
        const message = encodeBinaryMessage(MessageType.OUTPUT, paneId, new Uint8Array(outputBuffer));
        ws.send(message);
      }
    },
    onExit: (paneId, exitCode) => {
      // Send pane exited message
      const message = {
        type: 'paneExited',
        payload: { paneId, exitCode },
      };
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
  });

  // Create client connection
  const client: ClientConnection = {
    ws,
    sessionId,
    terminalCtx,
    sessionCtx,
    isAlive: true,
    lastPing: Date.now(),
  };

  serverState?.clients.set(sessionId, client);

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
      serverState?.clients.delete(sessionId);
      sessionId = dbSession.id;
      client.sessionId = sessionId;
      terminalCtx.sessionId = sessionId;
      sessionCtx.sessionId = sessionId;
      serverState?.clients.set(sessionId, client);
      // Re-send connected with the correct session ID
      sendConnected(ws, sessionId, {
        id: dbSession.id,
        name: dbSession.name,
        createdAt: dbSession.createdAt,
        updatedAt: dbSession.updatedAt,
        activeWindowId: dbSession.activeWindowId,
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

  ws.on('pong', () => {
    client.isAlive = true;
    client.lastPing = Date.now();
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
      break;
    case 'closeWindow':
      await handleCloseWindow(sessionCtx, message);
      break;
    case 'switchWindow':
      await handleSwitchWindow(sessionCtx, message);
      break;

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

  logger.info('Client disconnected', { sessionId, code, reason });

  // Buffer output for potential reconnection
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

  serverState?.clients.delete(sessionId);

  // Set timeout to clean up disconnected buffer
  setTimeout(() => {
    const buffer = serverState?.disconnectedBuffers.get(sessionId);
    if (buffer && Date.now() - buffer.disconnectedAt > config.ptyBufferSize * 1000) {
      serverState?.disconnectedBuffers.delete(sessionId);
      logger.debug('Cleaned up disconnected buffer', { sessionId });
    }
  }, config.ptyBufferSize * 1000);
}

/**
 * Start heartbeat ping/pong
 */
function startHeartbeat(): void {
  if (!serverState) return;

  serverState.heartbeatInterval = setInterval(() => {
    const now = Date.now();

    serverState?.clients.forEach((client, sessionId) => {
      if (!client.isAlive) {
        // Client didn't respond to ping, terminate
        logger.warn('Client heartbeat timeout', { sessionId });
        client.ws.terminate();
        serverState?.clients.delete(sessionId);
        return;
      }

      // Check if ping timeout exceeded
      if (now - client.lastPing > config.wsHeartbeatTimeout) {
        logger.warn('Client ping timeout', { sessionId });
        client.ws.terminate();
        serverState?.clients.delete(sessionId);
        return;
      }

      client.isAlive = false;
      client.ws.ping();
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
 * Send output to a specific session's client
 */
export function sendOutputToSession(sessionId: string, paneId: string, data: Uint8Array): boolean {
  const client = serverState?.clients.get(sessionId);

  if (client && client.ws.readyState === client.ws.OPEN) {
    sendBinaryOutput(client.ws, paneId, data);
    return true;
  }

  // Buffer output for disconnected client
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
 * Get client connection for a session
 */
export function getClient(sessionId: string): ClientConnection | undefined {
  return serverState?.clients.get(sessionId);
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

    if (serverState?.wss) {
      // Close all connections
      serverState.clients.forEach((client) => {
        client.ws.close(1000, 'Server shutting down');
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
