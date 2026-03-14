/**
 * Command execution REST endpoint
 * POST /api/v1/command
 *
 * Allows external processes (like the tmux shim) to execute tmux-compatible
 * commands against the WebTerm backend.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson, sendError } from '../rest-router.js';
import { logger } from '../../utils/logger.js';
import { defaultRegistry } from '../../../../shared/tmux/command-defs.js';
import { commandService } from '../../services/command-service.js';
import { sessionService } from '../../services/session-service.js';
import { getPaneIds } from '../../services/layout-service.js';

interface CommandRequestBody {
  command: string;
  sessionId?: string;
  windowId?: string;
  paneId?: string;
}

/**
 * POST /api/v1/command
 *
 * Execute a tmux-compatible command. The request body should contain:
 *   - command: the full command string (e.g. "split-window -h")
 *   - sessionId (optional): override context session
 *   - windowId (optional): override context window
 *   - paneId (optional): override context pane
 *
 * If sessionId/windowId/paneId are not provided, the endpoint attempts to
 * resolve them from environment variables set in the PTY (WEBTERM_SESSION_ID,
 * WEBTERM_PANE_ID) or falls back to the first available session.
 */
export async function handleExecuteCommand(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  body: unknown,
): Promise<void> {
  if (!body || typeof body !== 'object') {
    sendError(res, 400, 'INVALID_REQUEST', 'Request body must be a JSON object with a "command" field');
    return;
  }

  const { command, sessionId, windowId, paneId } = body as CommandRequestBody;

  if (!command || typeof command !== 'string') {
    sendError(res, 400, 'INVALID_REQUEST', 'Missing or invalid "command" field');
    return;
  }

  logger.info('REST command execution', { command, sessionId, windowId, paneId });

  // Parse the command
  const parseResult = defaultRegistry.parse(command);
  if (!parseResult.ok) {
    sendJson(res, 400, {
      success: false,
      error: parseResult.error,
    });
    return;
  }

  // Build context — resolve session/window/pane if not explicitly provided
  let resolvedSessionId = sessionId ?? '';
  let resolvedWindowId = windowId ?? '';
  let resolvedPaneId = paneId ?? '';

  // If no session provided, use first available session
  if (!resolvedSessionId) {
    const sessions = sessionService.getAllSessions();
    if (sessions.length > 0 && sessions[0]) {
      resolvedSessionId = sessions[0].id;
    }
  }

  // If no window provided, use session's active window
  if (!resolvedWindowId && resolvedSessionId) {
    const session = sessionService.getSession(resolvedSessionId);
    if (session?.activeWindowId) {
      resolvedWindowId = session.activeWindowId;
    } else if (session && session.windows.length > 0 && session.windows[0]) {
      resolvedWindowId = session.windows[0].id;
    }
  }

  // If no pane provided, use first pane in window
  if (!resolvedPaneId && resolvedWindowId) {
    const window = sessionService.getWindow(resolvedWindowId);
    if (window) {
      const paneIds = getPaneIds(window.layout);
      if (paneIds.length > 0 && paneIds[0]) {
        resolvedPaneId = paneIds[0];
      }
    }
  }

  const ctx = {
    sessionId: resolvedSessionId,
    windowId: resolvedWindowId,
    paneId: resolvedPaneId,
  };

  try {
    const result = commandService.execute(parseResult.value, ctx);

    sendJson(res, result.success ? 200 : 400, {
      success: result.success,
      output: result.output,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('REST command execution failed', { command, error: message });
    sendError(res, 500, 'COMMAND_FAILED', message);
  }
}

/**
 * GET /api/v1/panes
 *
 * List panes for a session. Used by the tmux shim for `list-panes`.
 * Query params: sessionId, windowId
 */
export async function handleListPanes(
  req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  _body: unknown,
): Promise<void> {
  // Parse query params
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const sessionId = url.searchParams.get('sessionId') ?? '';
  const windowId = url.searchParams.get('windowId') ?? '';

  let targetWindowId = windowId;

  // If no window specified, resolve from session
  if (!targetWindowId && sessionId) {
    const session = sessionService.getSession(sessionId);
    if (session?.activeWindowId) {
      targetWindowId = session.activeWindowId;
    } else if (session && session.windows.length > 0 && session.windows[0]) {
      targetWindowId = session.windows[0].id;
    }
  }

  // If still no window, try first session
  if (!targetWindowId && !sessionId) {
    const sessions = sessionService.getAllSessions();
    if (sessions.length > 0 && sessions[0]) {
      const session = sessionService.getSession(sessions[0].id);
      if (session?.activeWindowId) {
        targetWindowId = session.activeWindowId;
      } else if (session && session.windows.length > 0 && session.windows[0]) {
        targetWindowId = session.windows[0].id;
      }
    }
  }

  if (!targetWindowId) {
    sendJson(res, 200, { panes: [] });
    return;
  }

  const window = sessionService.getWindow(targetWindowId);
  if (!window) {
    sendJson(res, 200, { panes: [] });
    return;
  }

  const paneIds = getPaneIds(window.layout);
  const panes = paneIds.map((id, index) => {
    const pane = window.panes.find((p) => p.id === id);
    return {
      id,
      index,
      windowId: targetWindowId,
      active: index === 0,
      title: pane?.title ?? '',
      shell: pane?.shell ?? 'default',
      cols: pane?.cols ?? 80,
      rows: pane?.rows ?? 24,
    };
  });

  sendJson(res, 200, { panes });
}
