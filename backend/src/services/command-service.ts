/**
 * Command execution dispatch engine
 *
 * Receives a ParsedCommand from the shared CommandRegistry, routes it to the
 * appropriate handler by command name, and returns a result or error.
 *
 * Phase 2 (foundational): most handlers are skeleton stubs returning success.
 * Working implementations: list-sessions, set-option, show-options, list-keys,
 * list-buffers.
 */

import fs from 'node:fs';
import { logger } from '../utils/logger.js';
import { sessionService } from './session-service.js';
import { optionService } from './option-service.js';
import { pasteBufferService } from './paste-buffer-service.js';
import { keybindingService } from './keybinding-service.js';
import { hookService } from './hook-service.js';
import { ptyManager } from './pty-service.js';
import {
  applyPresetLayout,
  extractPane,
  findAdjacentPane,
  getPaneIds,
  insertPaneIntoLayout,
  PRESET_LAYOUT_ORDER,
  rotatePaneIds,
  splitLayout,
  swapPanesInLayout,
  validatePaneLimit,
} from './layout-service.js';
import { defaultRegistry } from '../../../shared/tmux/command-defs.js';
import type { ParsedCommand } from '../../../shared/tmux/command-registry.js';
import type { OptionScope, Pane, PresetLayoutName, ShellType, SplitDirection } from '../../../shared/types/models.js';
import { broadcastToSession, getConnectedSessions, getSessionClients } from '../api/websocket-server.js';

/**
 * Module-level map tracking which preset layout index each window is currently at.
 * Used by next-layout / previous-layout to cycle through presets.
 */
const windowLayoutIndex = new Map<string, number>();

// ============================================================================
// Types
// ============================================================================

export interface CommandContext {
  sessionId: string;
  windowId: string;
  paneId: string;
}

export interface CommandResult {
  output: string;
  success: boolean;
}

// ============================================================================
// CommandService
// ============================================================================

export class CommandService {
  /**
   * Execute a parsed command in the given context.
   *
   * Routes to the appropriate handler by command name.
   */
  execute(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    try {
      switch (parsed.command) {
        // ================================================================
        // Session commands
        // ================================================================
        case 'new-session':
          return this.handleNewSession(parsed, ctx);
        case 'rename-session':
          return this.handleRenameSession(parsed, ctx);
        case 'detach-client':
          return this.handleDetachClient();
        case 'switch-client':
          return this.handleSwitchClient(parsed, ctx);
        case 'list-sessions':
          return this.handleListSessions();
        case 'list-clients':
          return this.handleListClients();
        case 'has-session':
          return this.handleHasSession(parsed);
        case 'kill-session':
          return this.handleKillSession(parsed);
        case 'send-keys':
          return this.handleSendKeys(parsed, ctx);

        // ================================================================
        // Window commands
        // ================================================================
        case 'new-window':
          return this.handleNewWindow(parsed, ctx);
        case 'kill-window':
          return this.handleKillWindow(parsed, ctx);
        case 'rename-window':
          return this.handleRenameWindow(parsed, ctx);
        case 'select-window':
          return this.handleSelectWindow(parsed, ctx);
        case 'last-window':
          return this.handleLastWindow(ctx);
        case 'next-window':
          return this.handleNextWindow(ctx);
        case 'previous-window':
          return this.handlePreviousWindow(ctx);
        case 'swap-window':
          return this.handleSwapWindow(parsed, ctx);
        case 'move-window':
          return this.handleMoveWindow(parsed, ctx);
        case 'find-window':
          return this.handleFindWindow(parsed, ctx);

        // ================================================================
        // Pane commands
        // ================================================================
        case 'split-window':
          return this.handleSplitWindow(parsed, ctx);
        case 'kill-pane':
          return this.handleKillPane(parsed, ctx);
        case 'select-pane':
          return this.handleSelectPane(parsed, ctx);
        case 'swap-pane':
          return this.handleSwapPane(parsed, ctx);
        case 'break-pane':
          return this.handleBreakPane(parsed, ctx);
        case 'join-pane':
          return this.handleJoinPane(parsed, ctx);
        case 'resize-pane':
          return this.handleResizePane(parsed, ctx);
        case 'rotate-window':
          return this.handleRotateWindow(parsed, ctx);
        case 'display-panes':
          return this.handleDisplayPanes(ctx);
        case 'respawn-pane':
          return this.handleRespawnPane(parsed, ctx);

        // ================================================================
        // Layout commands
        // ================================================================
        case 'select-layout':
          return this.handleSelectLayout(parsed, ctx);
        case 'next-layout':
          return this.handleNextLayout(ctx);
        case 'previous-layout':
          return this.handlePreviousLayout(ctx);

        // ================================================================
        // Key binding commands
        // ================================================================
        case 'bind-key':
          return this.handleBindKey(parsed);
        case 'unbind-key':
          return this.handleUnbindKey(parsed);
        case 'list-keys':
          return this.handleListKeys(parsed);

        // ================================================================
        // Option commands
        // ================================================================
        case 'set-option':
          return this.handleSetOption(parsed, ctx);
        case 'show-options':
          return this.handleShowOptions(parsed, ctx);
        case 'source-file':
          return this.handleSourceFile(parsed, ctx);

        // ================================================================
        // Buffer commands
        // ================================================================
        case 'list-buffers':
          return this.handleListBuffers();
        case 'show-buffer':
          return this.handleShowBuffer(parsed);
        case 'delete-buffer':
          return this.handleDeleteBuffer(parsed);
        case 'paste-buffer':
          return this.handlePasteBuffer(parsed, ctx);
        case 'set-buffer':
          return this.handleSetBuffer(parsed);

        // ================================================================
        // Hook commands
        // ================================================================
        case 'set-hook':
          return this.handleSetHook(parsed);
        case 'show-hooks':
          return this.handleShowHooks();

        // ================================================================
        // Display commands
        // ================================================================
        case 'display-message':
          return this.handleDisplayMessage(parsed, ctx);
        case 'display-popup':
          return this.handleDisplayPopup(parsed);
        case 'clock-mode':
          return this.handleClockMode(parsed, ctx);
        case 'capture-pane':
          return this.handleCapturePane(parsed, ctx);

        // ================================================================
        // Interactive mode commands
        // ================================================================
        case 'choose-tree':
          return this.handleChooseTree(parsed);
        case 'choose-buffer':
          return this.handleChooseBuffer();

        default:
          return {
            output: `Unknown command: ${parsed.command}`,
            success: false,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Command execution failed: ${parsed.command}`, { error: message });
      return { output: message, success: false };
    }
  }

  // ==========================================================================
  // Working handlers
  // ==========================================================================

  /**
   * detach-client: Detach the current client from the session.
   *
   * Returns a special output marker that the WebSocket handler intercepts
   * to send a `sessionDetached` message to the client. The session and its
   * PTYs remain running; only the client connection is cleaned up.
   */
  private handleDetachClient(): CommandResult {
    return { output: '__DETACH__', success: true };
  }

  /**
   * switch-client: Switch the current client to a different session.
   *
   * Flags: -n (next session), -p (previous session), -t (target by name/ID)
   *
   * Returns a special output marker `__SWITCH__:{sessionId}` that the
   * WebSocket handler intercepts to send a `sessionSwitched` message.
   */
  private handleSwitchClient(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const nextFlag = parsed.flags.get('n') === true;
    const prevFlag = parsed.flags.get('p') === true;
    const targetFlag = parsed.flags.get('t');

    const sessions = sessionService.getAllSessions();
    if (sessions.length === 0) {
      return { output: 'No sessions', success: false };
    }

    // -t: Look up by name or ID
    if (typeof targetFlag === 'string') {
      const target = sessions.find(
        (s) => s.id === targetFlag || s.name === targetFlag,
      );
      if (!target) {
        return { output: `Session not found: ${targetFlag}`, success: false };
      }
      return { output: `__SWITCH__:${target.id}`, success: true };
    }

    // -n or -p: Find current session index and navigate
    const currentIndex = sessions.findIndex((s) => s.id === ctx.sessionId);
    if (currentIndex === -1) {
      return { output: 'Current session not found in session list', success: false };
    }

    if (sessions.length < 2) {
      return { output: 'No other sessions', success: false };
    }

    let targetIndex: number;
    if (nextFlag) {
      targetIndex = (currentIndex + 1) % sessions.length;
    } else if (prevFlag) {
      targetIndex = (currentIndex - 1 + sessions.length) % sessions.length;
    } else {
      return { output: 'No target specified (use -n, -p, or -t)', success: false };
    }

    const targetSession = sessions[targetIndex];
    if (!targetSession) {
      return { output: 'Target session not found', success: false };
    }

    return { output: `__SWITCH__:${targetSession.id}`, success: true };
  }

  /**
   * list-sessions: List all sessions in a table-like format.
   */
  private handleListSessions(): CommandResult {
    try {
      const sessions = sessionService.getAllSessions();

      if (sessions.length === 0) {
        return { output: 'No sessions.', success: true };
      }

      const lines = sessions.map((s) => {
        const created = new Date(s.createdAt).toISOString().slice(0, 19).replace('T', ' ');
        return `${s.name}: ${s.windowCount} windows (created ${created})`;
      });

      return { output: lines.join('\n'), success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: message, success: false };
    }
  }

  /**
   * list-clients: List all connected clients with session, read-only flag, and duration.
   */
  private handleListClients(): CommandResult {
    try {
      const sessionIds = getConnectedSessions();

      if (sessionIds.length === 0) {
        return { output: 'No clients.', success: true };
      }

      const lines: string[] = [];

      for (const sessionId of sessionIds) {
        const session = sessionService.getSession(sessionId);
        const sessionName = session?.name ?? 'unknown';
        const clients = getSessionClients(sessionId);

        for (const client of clients) {
          const durationMs = Date.now() - client.connectedAt;
          const durationSec = Math.floor(durationMs / 1000);
          const hours = Math.floor(durationSec / 3600);
          const minutes = Math.floor((durationSec % 3600) / 60);
          const seconds = durationSec % 60;
          const duration = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          const flags = client.readOnly ? ' (ro)' : '';

          lines.push(`${client.clientId}: ${sessionName} [${duration}]${flags}`);
        }
      }

      if (lines.length === 0) {
        return { output: 'No clients.', success: true };
      }

      return { output: lines.join('\n'), success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: message, success: false };
    }
  }

  /**
   * set-option: Set or unset an option at the appropriate scope.
   *
   * Scope flags: -g (global-session), -w (global-window), -p (pane), -s (session).
   * The -u flag triggers unset instead of set.
   */
  private handleSetOption(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    try {
      const isGlobal = parsed.flags.get('g') === true;
      const isWindow = parsed.flags.get('w') === true;
      const isPane = parsed.flags.get('p') === true;
      const isSession = parsed.flags.get('s') === true;
      const isUnset = parsed.flags.get('u') === true;

      // Determine scope and scopeId
      const { scope, scopeId } = this.resolveOptionScope(
        { isGlobal, isWindow, isPane, isSession },
        ctx,
      );

      const optionName = parsed.positional[0];
      if (optionName === undefined) {
        return { output: 'Missing option name', success: false };
      }

      if (isUnset) {
        const removed = optionService.unset(optionName, scope, scopeId);
        if (removed) {
          return { output: '', success: true };
        }
        return { output: '', success: true };
      }

      const value = parsed.positional[1];
      if (value === undefined) {
        return { output: 'Missing option value', success: false };
      }

      optionService.set(optionName, value, scope, scopeId);
      return { output: '', success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: message, success: false };
    }
  }

  /**
   * show-options: Display option values at the given scope.
   *
   * Scope flags: -g (global-session), -w (global-window), -p (pane), -s (session).
   */
  private handleShowOptions(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    try {
      const isGlobal = parsed.flags.get('g') === true;
      const isWindow = parsed.flags.get('w') === true;
      const isPane = parsed.flags.get('p') === true;
      const isSession = parsed.flags.get('s') === true;

      // If no scope flag, show all options
      const hasScope = isGlobal || isWindow || isPane || isSession;
      if (!hasScope) {
        const results = optionService.showAll();
        const lines = results.map((r) => `${r.name} ${r.value}`);
        return { output: lines.join('\n'), success: true };
      }

      const { scope, scopeId } = this.resolveOptionScope(
        { isGlobal, isWindow, isPane, isSession },
        ctx,
      );

      const results = optionService.showAll(scope, scopeId);
      const lines = results.map((r) => `${r.name} ${r.value}`);
      return { output: lines.join('\n'), success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { output: message, success: false };
    }
  }

  /**
   * source-file: Read and execute commands from a file.
   *
   * Each non-empty, non-comment line (lines starting with #) is parsed and
   * executed in order. Errors are collected with line numbers.
   *
   * Positional: file path
   */
  private handleSourceFile(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const filePath = parsed.positional[0];
    if (!filePath) {
      return { output: 'Missing file path', success: false };
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { output: `Cannot read file: ${msg}`, success: false };
    }

    const lines = content.split('\n');
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '' || line.startsWith('#')) continue;

      const parseResult = defaultRegistry.parse(line);
      if (!parseResult.ok) {
        errors.push(`${filePath}:${i + 1}: ${parseResult.error}`);
        continue;
      }

      const result = this.execute(parseResult.value, ctx);
      if (!result.success) {
        errors.push(`${filePath}:${i + 1}: ${result.output}`);
      }
    }

    if (errors.length > 0) {
      return { output: errors.join('\n'), success: false };
    }
    return { output: '', success: true };
  }

  /**
   * bind-key: Bind a key to a command.
   *
   * Flags: -T (key table, default "prefix"), -n (shorthand for -T root)
   * Positional: key, command [args...]
   */
  private handleBindKey(parsed: ParsedCommand): CommandResult {
    const isRoot = parsed.flags.get('n') === true;
    const tableFlag = parsed.flags.get('T');
    const keyTable = isRoot
      ? 'root'
      : typeof tableFlag === 'string'
        ? tableFlag
        : 'prefix';

    const key = parsed.positional[0];
    if (key === undefined) {
      return { output: 'Missing key argument', success: false };
    }

    const commandParts = parsed.positional.slice(1);
    if (commandParts.length === 0) {
      return { output: 'Missing command argument', success: false };
    }

    const command = commandParts.join(' ');
    keybindingService.bind(keyTable, key, command);
    return { output: '', success: true };
  }

  /**
   * unbind-key: Remove a key binding.
   *
   * Flags: -T (key table, default "prefix"), -n (shorthand for -T root), -a (unbind all)
   * Positional: key
   */
  private handleUnbindKey(parsed: ParsedCommand): CommandResult {
    const unbindAll = parsed.flags.get('a') === true;
    if (unbindAll) {
      keybindingService.reset();
      return { output: '', success: true };
    }

    const isRoot = parsed.flags.get('n') === true;
    const tableFlag = parsed.flags.get('T');
    const keyTable = isRoot
      ? 'root'
      : typeof tableFlag === 'string'
        ? tableFlag
        : 'prefix';

    const key = parsed.positional[0];
    if (key === undefined) {
      return { output: 'Missing key argument', success: false };
    }

    keybindingService.unbind(keyTable, key);
    return { output: '', success: true };
  }

  /**
   * list-keys: List all key bindings, optionally filtered by table.
   *
   * Flags: -T (key table to filter)
   */
  private handleListKeys(parsed: ParsedCommand): CommandResult {
    const tableFlag = parsed.flags.get('T');
    const bindings = typeof tableFlag === 'string'
      ? keybindingService.getByTable(tableFlag)
      : keybindingService.getAll();

    if (bindings.length === 0) {
      return { output: 'No key bindings.', success: true };
    }

    const lines = bindings.map((b) => `bind-key -T ${b.keyTable} ${b.key} ${b.command}`);
    return { output: lines.join('\n'), success: true };
  }

  /**
   * list-buffers: List all paste buffers with name, size, and preview.
   */
  private handleListBuffers(): CommandResult {
    const buffers = pasteBufferService.list();
    if (buffers.length === 0) {
      return { output: 'No buffers.', success: true };
    }

    const lines = buffers.map((b) => {
      const preview = b.content.length > 50 ? b.content.slice(0, 50) + '...' : b.content;
      const escaped = preview.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      return `${b.name}: ${b.size} bytes: "${escaped}"`;
    });

    return { output: lines.join('\n'), success: true };
  }

  /**
   * show-buffer: Display contents of a paste buffer.
   *
   * Flags: -b (buffer name, optional — defaults to most recent)
   */
  private handleShowBuffer(parsed: ParsedCommand): CommandResult {
    const bufferName = parsed.flags.get('b');

    let buffer;
    if (typeof bufferName === 'string') {
      buffer = pasteBufferService.getByName(bufferName);
      if (!buffer) {
        return { output: `No buffer: ${bufferName}`, success: false };
      }
    } else {
      buffer = pasteBufferService.getMostRecent();
      if (!buffer) {
        return { output: 'No buffers.', success: false };
      }
    }

    return { output: buffer.content, success: true };
  }

  /**
   * delete-buffer: Delete a paste buffer by name.
   *
   * Flags: -b (buffer name, required)
   */
  private handleDeleteBuffer(parsed: ParsedCommand): CommandResult {
    const bufferName = parsed.flags.get('b');

    if (typeof bufferName !== 'string') {
      return { output: 'Missing buffer name (-b flag)', success: false };
    }

    const deleted = pasteBufferService.delete(bufferName);
    if (!deleted) {
      return { output: `No buffer: ${bufferName}`, success: false };
    }

    return { output: '', success: true };
  }

  /**
   * paste-buffer: Paste buffer content into the active pane's PTY.
   *
   * Flags: -b (buffer name, optional — defaults to most recent)
   *        -d (delete buffer after pasting)
   */
  private handlePasteBuffer(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const bufferName = parsed.flags.get('b');
    const deleteAfter = parsed.flags.get('d') === true;

    let buffer;
    if (typeof bufferName === 'string') {
      buffer = pasteBufferService.getByName(bufferName);
      if (!buffer) {
        return { output: `No buffer: ${bufferName}`, success: false };
      }
    } else {
      buffer = pasteBufferService.getMostRecent();
      if (!buffer) {
        return { output: 'No buffers.', success: false };
      }
    }

    if (!ctx.paneId) {
      return { output: 'No active pane', success: false };
    }

    ptyManager.write(ctx.paneId, buffer.content);

    if (deleteAfter) {
      pasteBufferService.delete(buffer.name);
    }

    return { output: '', success: true };
  }

  /**
   * set-buffer: Set or create a named paste buffer with given content.
   *
   * Flags: -b (buffer name, optional — auto-generated if omitted)
   * Positional: data (buffer content)
   */
  private handleSetBuffer(parsed: ParsedCommand): CommandResult {
    const bufferFlag = parsed.flags.get('b');
    const content = parsed.positional[0];

    if (content === undefined) {
      return { output: 'Missing buffer content argument', success: false };
    }

    if (typeof bufferFlag === 'string') {
      pasteBufferService.set(bufferFlag, content);
    } else {
      pasteBufferService.add(content);
    }

    return { output: '', success: true };
  }

  // ==========================================================================
  // Window operation handlers
  // ==========================================================================

  /**
   * select-window: Select a window by index using -t :N notation.
   *
   * Flags: -t (target window, e.g. ":0", ":1", ":2")
   * Returns: the selected window's ID as output
   */
  private handleSelectWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');

    if (typeof targetFlag !== 'string') {
      return { output: 'Missing target window (-t flag)', success: false };
    }

    // Parse :N notation to extract window index
    const match = /^:(\d+)$/.exec(targetFlag);
    if (!match) {
      return { output: `Invalid target format: ${targetFlag} (expected :N)`, success: false };
    }

    const windowIndex = parseInt(match[1]!, 10);

    const session = sessionService.getSession(ctx.sessionId);
    if (!session) {
      return { output: 'Session not found', success: false };
    }

    const targetWindow = session.windows.find((w) => w.index === windowIndex);
    if (!targetWindow) {
      return { output: `No window at index ${windowIndex}`, success: false };
    }

    return { output: targetWindow.id, success: true };
  }

  /**
   * rename-window: Rename a window.
   *
   * Positional: new name
   * Flags: -t (target window ID, optional — defaults to current)
   */
  private handleRenameWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');
    const windowId = typeof targetFlag === 'string' ? targetFlag : ctx.windowId;

    const newName = parsed.positional[0];
    if (newName === undefined) {
      return { output: 'Missing window name argument', success: false };
    }

    const updated = sessionService.renameWindow(windowId, newName);
    if (!updated) {
      return { output: `Window not found: ${windowId}`, success: false };
    }

    return { output: '', success: true };
  }

  /**
   * swap-window: Swap the indices of the current window and target window.
   *
   * Flags: -t (target window ID)
   */
  private handleSwapWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');

    if (typeof targetFlag !== 'string') {
      return { output: 'Missing target window (-t flag)', success: false };
    }

    const swapped = sessionService.swapWindowIndices(ctx.windowId, targetFlag);
    if (!swapped) {
      return { output: 'Failed to swap windows: one or both not found', success: false };
    }

    return { output: '', success: true };
  }

  /**
   * move-window: Move the current window to a target index position.
   *
   * Flags: -t (target index)
   */
  private handleMoveWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');

    if (typeof targetFlag !== 'string') {
      return { output: 'Missing target index (-t flag)', success: false };
    }

    const targetIndex = parseInt(targetFlag, 10);
    if (isNaN(targetIndex) || targetIndex < 0) {
      return { output: `Invalid target index: ${targetFlag}`, success: false };
    }

    const moved = sessionService.moveWindowToIndex(ctx.windowId, targetIndex);
    if (!moved) {
      return { output: `Window not found: ${ctx.windowId}`, success: false };
    }

    return { output: '', success: true };
  }

  /**
   * last-window: Switch to the last selected window.
   *
   * Uses session.lastWindowId to determine the previous window.
   * Returns the window ID as output.
   */
  private handleLastWindow(ctx: CommandContext): CommandResult {
    const session = sessionService.getSession(ctx.sessionId);
    if (!session) {
      return { output: 'Session not found', success: false };
    }

    if (!session.lastWindowId) {
      return { output: 'No last window', success: false };
    }

    // Verify the last window still exists
    const lastWindow = sessionService.getWindow(session.lastWindowId);
    if (!lastWindow) {
      return { output: 'Last window no longer exists', success: false };
    }

    return { output: session.lastWindowId, success: true };
  }

  /**
   * find-window: Search for windows matching a string.
   *
   * Positional: search string
   * Searches window names and pane titles across all windows in the session.
   * Returns matching window list as formatted output.
   */
  private handleFindWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const searchString = parsed.positional[0];
    if (searchString === undefined) {
      return { output: 'Missing search string argument', success: false };
    }

    const session = sessionService.getSession(ctx.sessionId);
    if (!session) {
      return { output: 'Session not found', success: false };
    }

    const needle = searchString.toLowerCase();
    const matches: string[] = [];

    for (const window of session.windows) {
      let matched = false;

      // Check window name
      if (window.name.toLowerCase().includes(needle)) {
        matched = true;
      }

      // Check pane titles
      if (!matched) {
        for (const pane of window.panes) {
          if (pane.title.toLowerCase().includes(needle)) {
            matched = true;
            break;
          }
        }
      }

      if (matched) {
        const paneCount = window.panes.length;
        const paneSuffix = paneCount === 1 ? 'pane' : 'panes';
        matches.push(`${window.index}: ${window.name} (${paneCount} ${paneSuffix}) [${window.id}]`);
      }
    }

    if (matches.length === 0) {
      return { output: `No windows matching: ${searchString}`, success: true };
    }

    return { output: matches.join('\n'), success: true };
  }

  // ==========================================================================
  // Pane operation handlers
  // ==========================================================================

  /**
   * swap-pane: Swap two panes in the layout tree.
   *
   * Flags: -D (swap with next pane in tree order), -U (swap with previous),
   *        -s (source pane), -t (target pane)
   */
  private handleSwapPane(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const swapDown = parsed.flags.get('D') === true;
    const swapUp = parsed.flags.get('U') === true;
    const sourceFlag = parsed.flags.get('s');
    const targetFlag = parsed.flags.get('t');

    const sourcePaneId = this.resolvePaneTarget(sourceFlag, ctx.paneId);

    const window = sessionService.getWindow(ctx.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    let targetPaneId: string | undefined;

    if (typeof targetFlag === 'string') {
      targetPaneId = this.resolvePaneTarget(targetFlag, ctx.paneId);
    } else if (swapDown || swapUp) {
      // Find next/previous pane in tree order
      const paneIds = getPaneIds(window.layout);
      const currentIndex = paneIds.indexOf(sourcePaneId);
      if (currentIndex === -1) {
        return { output: 'Pane not found in layout', success: false };
      }

      if (swapDown) {
        // Next pane (wraps around)
        const nextIndex = (currentIndex + 1) % paneIds.length;
        targetPaneId = paneIds[nextIndex];
      } else {
        // Previous pane (wraps around)
        const prevIndex = (currentIndex - 1 + paneIds.length) % paneIds.length;
        targetPaneId = paneIds[prevIndex];
      }
    }

    if (!targetPaneId) {
      return { output: 'No target pane specified', success: false };
    }

    if (sourcePaneId === targetPaneId) {
      return { output: '', success: true };
    }

    const newLayout = swapPanesInLayout(window.layout, sourcePaneId, targetPaneId);
    if (!newLayout) {
      return { output: 'Failed to swap panes: pane not found in layout', success: false };
    }

    sessionService.updateWindowLayout(ctx.windowId, newLayout);
    return { output: '', success: true };
  }

  /**
   * break-pane: Remove a pane from the current window and create a new window
   * containing only that pane.
   *
   * Flags: -t (target pane), -n (new window name)
   */
  private handleBreakPane(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');
    const nameFlag = parsed.flags.get('n');
    const paneId = this.resolvePaneTarget(targetFlag, ctx.paneId);
    const windowName = typeof nameFlag === 'string' ? nameFlag : 'Window';

    const window = sessionService.getWindow(ctx.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    const paneIds = getPaneIds(window.layout);
    if (paneIds.length <= 1) {
      return { output: 'Cannot break the only pane in a window', success: false };
    }

    // Extract the pane from the current layout
    const result = extractPane(window.layout, paneId);
    if (!result.extracted) {
      return { output: 'Pane not found in layout', success: false };
    }

    if (!result.remainingLayout) {
      return { output: 'Cannot break pane: would leave empty layout', success: false };
    }

    // Update the current window's layout (pane removed)
    sessionService.updateWindowLayout(ctx.windowId, result.remainingLayout);

    // Create a new window in the same session for the broken-out pane
    const newWindow = sessionService.createWindow(ctx.sessionId, windowName);
    if (!newWindow) {
      return {
        output: 'Failed to create new window for broken-out pane',
        success: false,
      };
    }

    // The new window was created with its own default pane. We need to:
    // 1. Delete the auto-created pane
    // 2. Move our pane to the new window
    // 3. Update the new window's layout to reference our pane
    const autoCreatedPane = newWindow.panes[0];
    if (autoCreatedPane) {
      sessionService.deletePane(autoCreatedPane.id);
    }

    sessionService.movePaneToWindow(paneId, newWindow.id);

    const leafLayout = { type: 'leaf' as const, paneId };
    sessionService.updateWindowLayout(newWindow.id, leafLayout);

    return { output: '', success: true };
  }

  /**
   * join-pane: Move a pane from its current location into the target pane's
   * window as a split.
   *
   * Flags: -s (source pane), -t (target pane), -h (horizontal), -v (vertical)
   */
  private handleJoinPane(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const sourceFlag = parsed.flags.get('s');
    const targetFlag = parsed.flags.get('t');
    const isHorizontal = parsed.flags.get('h') === true;

    const sourcePaneId = this.resolvePaneTarget(sourceFlag, ctx.paneId);

    if (typeof targetFlag !== 'string') {
      return { output: 'Target pane (-t) is required for join-pane', success: false };
    }

    const targetPaneId = this.resolvePaneTarget(targetFlag, ctx.paneId);

    if (sourcePaneId === targetPaneId) {
      return { output: 'Source and target pane are the same', success: false };
    }

    // Find which window the source pane belongs to
    const sourcePane = sessionService.getPane(sourcePaneId);
    if (!sourcePane) {
      return { output: `Source pane not found: ${sourcePaneId}`, success: false };
    }

    // Find which window the target pane belongs to
    const targetPane = sessionService.getPane(targetPaneId);
    if (!targetPane) {
      return { output: `Target pane not found: ${targetPaneId}`, success: false };
    }

    const sourceWindow = sessionService.getWindow(sourcePane.windowId);
    if (!sourceWindow) {
      return { output: 'Source window not found', success: false };
    }

    const targetWindow = sessionService.getWindow(targetPane.windowId);
    if (!targetWindow) {
      return { output: 'Target window not found', success: false };
    }

    // Extract the source pane from its current layout
    const extractResult = extractPane(sourceWindow.layout, sourcePaneId);
    if (!extractResult.extracted) {
      return { output: 'Source pane not found in layout', success: false };
    }

    // Update source window's layout (or delete the window if it's now empty)
    if (extractResult.remainingLayout) {
      sessionService.updateWindowLayout(sourceWindow.id, extractResult.remainingLayout);
    } else {
      // Source window is now empty (had only one pane), delete it
      sessionService.deleteWindow(sourceWindow.id);
    }

    // Insert the pane into the target window's layout
    const direction: SplitDirection = isHorizontal ? 'h' : 'v';
    const newLayout = insertPaneIntoLayout(
      targetWindow.layout,
      targetPaneId,
      sourcePaneId,
      direction,
    );

    if (!newLayout) {
      return { output: 'Failed to insert pane into target layout', success: false };
    }

    // Move the pane DB record to the target window
    sessionService.movePaneToWindow(sourcePaneId, targetWindow.id);

    // Update the target window's layout
    sessionService.updateWindowLayout(targetWindow.id, newLayout);

    return { output: '', success: true };
  }

  /**
   * rotate-window: Rotate pane IDs within the layout tree.
   *
   * Flags: -D (forward rotation, default), -U (reverse rotation)
   */
  private handleRotateWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const reverse = parsed.flags.get('U') === true;

    const window = sessionService.getWindow(ctx.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    const newLayout = rotatePaneIds(window.layout, reverse);
    sessionService.updateWindowLayout(ctx.windowId, newLayout);

    return { output: '', success: true };
  }

  /**
   * select-pane: Select a pane by direction or mark/unmark it.
   *
   * Flags: -t (target pane), -L (left), -R (right), -U (up), -D (down),
   *        -m (mark), -M (unmark)
   */
  private handleSelectPane(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');
    const goLeft = parsed.flags.get('L') === true;
    const goRight = parsed.flags.get('R') === true;
    const goUp = parsed.flags.get('U') === true;
    const goDown = parsed.flags.get('D') === true;
    const markPane = parsed.flags.get('m') === true;
    const unmarkPane = parsed.flags.get('M') === true;

    // Handle mark/unmark on the current pane (or target)
    const targetPaneId = this.resolvePaneTarget(targetFlag, ctx.paneId);

    if (markPane) {
      sessionService.updatePaneMarked(targetPaneId, true);
      return { output: '', success: true };
    }

    if (unmarkPane) {
      sessionService.updatePaneMarked(targetPaneId, false);
      return { output: '', success: true };
    }

    // If a direct target was provided, select it
    if (typeof targetFlag === 'string') {
      // Verify pane exists
      const pane = sessionService.getPane(targetPaneId);
      if (!pane) {
        return { output: `Pane not found: ${targetPaneId}`, success: false };
      }
      return { output: targetPaneId, success: true };
    }

    // Direction-based selection
    const hasDirection = goLeft || goRight || goUp || goDown;
    if (!hasDirection) {
      // No direction or target: just return the current pane
      return { output: ctx.paneId, success: true };
    }

    const window = sessionService.getWindow(ctx.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    const direction = goLeft ? 'left' : goRight ? 'right' : goUp ? 'up' : 'down';
    const adjacentPaneId = findAdjacentPane(window.layout, ctx.paneId, direction);

    if (!adjacentPaneId) {
      return { output: `No pane ${direction} of current pane`, success: false };
    }

    return { output: adjacentPaneId, success: true };
  }

  /**
   * respawn-pane: Kill the existing PTY process and spawn a new shell
   * in the same pane.
   *
   * Flags: -t (target pane), -k (kill existing process first)
   */
  private handleRespawnPane(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');
    const killExisting = parsed.flags.get('k') === true;

    const paneId = this.resolvePaneTarget(targetFlag, ctx.paneId);

    const pane = sessionService.getPane(paneId);
    if (!pane) {
      return { output: `Pane not found: ${paneId}`, success: false };
    }

    const hasPty = ptyManager.hasPty(paneId);

    if (hasPty && !killExisting) {
      return {
        output: 'Pane still has an active process; use -k to kill it first',
        success: false,
      };
    }

    // Kill the existing PTY if present
    if (hasPty) {
      ptyManager.kill(paneId);
    }

    // Spawn a new PTY in the same pane with its existing settings
    const spawnOptions: { shell: typeof pane.shell; cwd?: string; cols: number; rows: number } = {
      shell: pane.shell,
      cols: pane.cols,
      rows: pane.rows,
    };
    if (pane.cwd !== null) {
      spawnOptions.cwd = pane.cwd;
    }
    ptyManager.spawn(paneId, spawnOptions);

    sessionService.updatePaneConnectionState(paneId, 'connected');

    return { output: '', success: true };
  }

  /**
   * capture-pane: Capture visible pane content.
   *
   * This returns a special output prefix "__CAPTURE__:" that the WebSocket
   * handler uses to signal the client to read its terminal buffer and send
   * the content back to the paste buffer service.
   *
   * Flags: -t (target pane), -p (start line), -b (buffer name)
   */
  private handleCapturePane(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');
    const bufferFlag = parsed.flags.get('b');
    const paneId = this.resolvePaneTarget(targetFlag, ctx.paneId);
    const bufferName = typeof bufferFlag === 'string' ? bufferFlag : undefined;

    // Signal the WebSocket handler to request capture from the client
    const meta = bufferName ? `${paneId}:${bufferName}` : paneId;
    return { output: `__CAPTURE__:${meta}`, success: true };
  }

  /**
   * display-panes: Show pane indices as overlays.
   *
   * Returns pane index data as JSON for the client to render.
   */
  private handleDisplayPanes(ctx: CommandContext): CommandResult {
    const window = sessionService.getWindow(ctx.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    const paneIds = getPaneIds(window.layout);
    const panes = paneIds.map((id, index) => ({ id, index }));

    return { output: `__DISPLAY_PANES__:${JSON.stringify(panes)}`, success: true };
  }

  // ==========================================================================
  // Layout operation handlers
  // ==========================================================================

  /**
   * select-layout: Apply a named preset layout to the current window.
   *
   * Positional: layout name (e.g., "even-horizontal", "main-vertical")
   */
  private handleSelectLayout(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const layoutName = parsed.positional[0];
    if (layoutName === undefined) {
      return { output: 'Missing layout name argument', success: false };
    }

    // Validate layout name
    const validNames: readonly string[] = PRESET_LAYOUT_ORDER;
    if (!validNames.includes(layoutName)) {
      return {
        output: `Unknown layout: ${layoutName}. Valid layouts: ${PRESET_LAYOUT_ORDER.join(', ')}`,
        success: false,
      };
    }

    const presetName = layoutName as PresetLayoutName;

    const window = sessionService.getWindow(ctx.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    const paneIds = getPaneIds(window.layout);
    if (paneIds.length === 0) {
      return { output: 'No panes in window', success: false };
    }

    const newLayout = applyPresetLayout(presetName, paneIds);
    sessionService.updateWindowLayout(ctx.windowId, newLayout);

    // Track the selected index for next/previous cycling
    const idx = PRESET_LAYOUT_ORDER.indexOf(presetName);
    windowLayoutIndex.set(ctx.windowId, idx);

    return { output: '', success: true };
  }

  /**
   * next-layout: Cycle forward through preset layouts.
   *
   * Advances to the next preset in PRESET_LAYOUT_ORDER (wraps around).
   */
  private handleNextLayout(ctx: CommandContext): CommandResult {
    const window = sessionService.getWindow(ctx.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    const paneIds = getPaneIds(window.layout);
    if (paneIds.length === 0) {
      return { output: 'No panes in window', success: false };
    }

    const currentIndex = windowLayoutIndex.get(ctx.windowId) ?? -1;
    const nextIndex = (currentIndex + 1) % PRESET_LAYOUT_ORDER.length;
    const presetName = PRESET_LAYOUT_ORDER[nextIndex]!;

    const newLayout = applyPresetLayout(presetName, paneIds);
    sessionService.updateWindowLayout(ctx.windowId, newLayout);
    windowLayoutIndex.set(ctx.windowId, nextIndex);

    return { output: '', success: true };
  }

  /**
   * previous-layout: Cycle backward through preset layouts.
   *
   * Goes to the previous preset in PRESET_LAYOUT_ORDER (wraps around).
   */
  private handlePreviousLayout(ctx: CommandContext): CommandResult {
    const window = sessionService.getWindow(ctx.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    const paneIds = getPaneIds(window.layout);
    if (paneIds.length === 0) {
      return { output: 'No panes in window', success: false };
    }

    const currentIndex = windowLayoutIndex.get(ctx.windowId) ?? 1;
    const prevIndex =
      (currentIndex - 1 + PRESET_LAYOUT_ORDER.length) % PRESET_LAYOUT_ORDER.length;
    const presetName = PRESET_LAYOUT_ORDER[prevIndex]!;

    const newLayout = applyPresetLayout(presetName, paneIds);
    sessionService.updateWindowLayout(ctx.windowId, newLayout);
    windowLayoutIndex.set(ctx.windowId, prevIndex);

    return { output: '', success: true };
  }

  // ==========================================================================
  // Hook handlers
  // ==========================================================================

  /**
   * set-hook: Register or unregister an event hook.
   *
   * Flags: -u (unregister all hooks for the event)
   * Positional: event name, command (required unless -u)
   */
  private handleSetHook(parsed: ParsedCommand): CommandResult {
    const isUnset = parsed.flags.get('u') === true;
    const event = parsed.positional[0];

    if (!event) {
      return { output: 'Missing event name', success: false };
    }

    if (isUnset) {
      hookService.unregister(event);
      return { output: '', success: true };
    }

    const command = parsed.positional.slice(1).join(' ');
    if (!command) {
      return { output: 'Missing command argument', success: false };
    }

    hookService.register(event, command);
    return { output: '', success: true };
  }

  /**
   * show-hooks: List all registered hooks.
   */
  private handleShowHooks(): CommandResult {
    const hooks = hookService.listAll();
    if (hooks.length === 0) {
      return { output: 'No hooks.', success: true };
    }
    const lines = hooks.map((h) => `${h.event} -> ${h.command}`);
    return { output: lines.join('\n'), success: true };
  }

  // ==========================================================================
  // Display command handlers
  // ==========================================================================

  /**
   * display-message: Show a message or print formatted output.
   *
   * Flags: -p (print to stdout), -t (target pane)
   * Positional: message/format text
   *
   * When -p is given, format strings like #{pane_id}, #{session_name},
   * #{window_index}, #{window_name} are replaced with actual values.
   */
  private handleDisplayMessage(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const message = parsed.positional[0] ?? '';
    const printFlag = parsed.flags.get('p') === true;
    const targetFlag = parsed.flags.get('t');

    // Resolve target pane for context
    const paneId = this.resolvePaneTarget(targetFlag, ctx.paneId);

    // If target pane resolves to a different window, update context
    let effectiveCtx = ctx;
    if (paneId !== ctx.paneId) {
      const pane = sessionService.getPane(paneId);
      if (pane) {
        const win = sessionService.getWindow(pane.windowId);
        if (win) {
          effectiveCtx = { ...ctx, paneId, windowId: win.id };
        }
      }
    }

    if (printFlag) {
      // Replace format strings
      const formatted = this.formatTmuxString(message, paneId, effectiveCtx);
      return { output: formatted, success: true };
    }

    return { output: message, success: true };
  }

  /**
   * display-popup: Display a popup window overlay.
   *
   * Flags: -w (width), -h (height), -E (close on exit)
   * Positional: command text to display in popup
   *
   * Returns a special output marker `__POPUP__:w:h:content` that the
   * WebSocket handler intercepts to send a popup message to the client.
   */
  private handleDisplayPopup(parsed: ParsedCommand): CommandResult {
    const command = parsed.positional[0] ?? '';
    const width = parsed.flags.get('w');
    const height = parsed.flags.get('h');
    const w = typeof width === 'string' ? parseInt(width, 10) : 80;
    const h = typeof height === 'string' ? parseInt(height, 10) : 24;
    return { output: `__POPUP__:${w}:${h}:${command}`, success: true };
  }

  // ==========================================================================
  // Interactive mode handlers
  // ==========================================================================

  /**
   * choose-tree: Launch interactive session/window tree browser.
   *
   * Returns a special marker so the WebSocket handler sends tree data.
   * Flags: -s (start at sessions), -w (start at windows)
   */
  private handleChooseTree(parsed: ParsedCommand): CommandResult {
    const startAtWindows = parsed.flags.get('w') === true;
    const mode = startAtWindows ? 'windows' : 'sessions';
    return { output: `__CHOOSE_TREE__:${mode}`, success: true };
  }

  /**
   * choose-buffer: Launch interactive buffer selection browser.
   *
   * Returns buffer list as JSON so the client can render the picker.
   */
  private handleChooseBuffer(): CommandResult {
    const buffers = pasteBufferService.list();
    const data = buffers.map((b) => ({
      name: b.name,
      size: b.size,
      preview: b.content.length > 50 ? b.content.slice(0, 50) + '...' : b.content,
      content: b.content,
    }));
    return { output: `__CHOOSE_BUFFER__:${JSON.stringify(data)}`, success: true };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Resolve a pane target that may be a tmux-style %N ID, a UUID, or undefined.
   * Returns the pane UUID, or the fallback if target is not provided.
   */
  private resolvePaneTarget(target: string | boolean | undefined, fallback: string): string {
    if (typeof target !== 'string') return fallback;
    // Try tmux-style %N format
    if (target.startsWith('%')) {
      const resolved = ptyManager.resolveTmuxPaneId(target);
      if (resolved) return resolved;
    }
    return target;
  }

  /**
   * Format a tmux-style format string by replacing variables.
   * Supported: #{pane_id}, #{session_name}, #{window_index}, #{window_name}, #{window_id}, #{session_id}
   */
  private formatTmuxString(format: string, paneId: string, ctx: CommandContext): string {
    let result = format;

    // #{pane_id} -> %N
    if (result.includes('#{pane_id}')) {
      const tmuxId = ptyManager.getPaneTmuxId(paneId) ?? paneId;
      result = result.replace(/#{pane_id}/g, tmuxId);
    }

    // #{session_name}
    if (result.includes('#{session_name}')) {
      const session = sessionService.getSession(ctx.sessionId);
      result = result.replace(/#{session_name}/g, session?.name ?? '');
    }

    // #{session_id}
    if (result.includes('#{session_id}')) {
      result = result.replace(/#{session_id}/g, ctx.sessionId);
    }

    // #{window_index}
    if (result.includes('#{window_index}')) {
      const window = sessionService.getWindow(ctx.windowId);
      result = result.replace(/#{window_index}/g, String(window?.index ?? 0));
    }

    // #{window_name}
    if (result.includes('#{window_name}')) {
      const window = sessionService.getWindow(ctx.windowId);
      result = result.replace(/#{window_name}/g, window?.name ?? '');
    }

    // #{window_id}
    if (result.includes('#{window_id}')) {
      result = result.replace(/#{window_id}/g, ctx.windowId);
    }

    return result;
  }

  /**
   * Resolve option scope flags into an OptionScope and optional scopeId.
   *
   * Priority when multiple flags are set:
   *   -p (pane) > -w (window) > -s (session) > -g (global-session)
   * Default (no flags): session scope with current session.
   */
  private resolveOptionScope(
    flags: { isGlobal: boolean; isWindow: boolean; isPane: boolean; isSession: boolean },
    ctx: CommandContext,
  ): { scope: OptionScope; scopeId: string | undefined } {
    if (flags.isPane) {
      return { scope: 'pane', scopeId: ctx.paneId };
    }
    if (flags.isWindow) {
      if (flags.isGlobal) {
        return { scope: 'global-window', scopeId: undefined };
      }
      return { scope: 'window', scopeId: ctx.windowId };
    }
    if (flags.isSession) {
      return { scope: 'session', scopeId: ctx.sessionId };
    }
    if (flags.isGlobal) {
      return { scope: 'global-session', scopeId: undefined };
    }
    // Default: session scope
    return { scope: 'session', scopeId: ctx.sessionId };
  }

  // ==========================================================================
  // Split & Window creation handlers
  // ==========================================================================

  /**
   * split-window: Split the target pane horizontally or vertically.
   *
   * Flags: -h (horizontal), -v (vertical, default), -t (target pane), -l (size)
   *
   * Spawns a new PTY, updates the layout tree, persists to DB, and broadcasts
   * a `paneCreated` message so all connected clients update their view.
   */
  private handleSplitWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const isHorizontal = parsed.flags.get('h') === true;
    // Default to vertical split (like tmux) unless -h is specified
    const direction: SplitDirection = isHorizontal ? 'h' : 'v';

    const targetPaneId = this.resolvePaneTarget(parsed.flags.get('t'), ctx.paneId);

    if (!targetPaneId) {
      return { output: 'No target pane specified', success: false };
    }

    // Resolve window from target pane if it's not in the current window
    let windowId = ctx.windowId;
    const targetPane = sessionService.getPane(targetPaneId);
    if (targetPane) {
      windowId = targetPane.windowId;
    }

    // Get the window to validate and check limits
    const window = sessionService.getWindow(windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    if (!validatePaneLimit(window.layout)) {
      return { output: 'Maximum pane limit reached', success: false };
    }

    // Generate new pane ID
    const newPaneId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    // Determine working directory
    const cwdFlag = parsed.flags.get('c');
    const cwd = typeof cwdFlag === 'string' ? cwdFlag : undefined;

    // Spawn a new PTY for the new pane
    const ptyInstance = ptyManager.spawn(newPaneId, {
      shell: 'default',
      cols: 80,
      rows: 24,
      sessionId: ctx.sessionId,
      ...(cwd ? { cwd } : {}),
    });

    // Update the layout tree
    const newLayout = splitLayout(window.layout, targetPaneId, direction, newPaneId);
    if (!newLayout) {
      // Target pane not found — kill the PTY we just spawned
      ptyManager.kill(newPaneId);
      return { output: `Pane ${targetPaneId} not found in layout`, success: false };
    }

    // Persist layout to DB
    sessionService.updateWindowLayout(windowId, newLayout);

    // Build the Pane object for broadcast
    const newPane: Pane = {
      id: newPaneId,
      windowId,
      shell: 'default' as ShellType,
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

    // Broadcast paneCreated to all WebSocket clients in this session
    broadcastToSession(ctx.sessionId, {
      type: 'paneCreated',
      payload: { pane: newPane, layout: newLayout },
    });

    logger.info('split-window: pane split', {
      targetPaneId,
      newPaneId,
      direction,
      windowId,
    });

    // Handle -P -F format output
    const printFlag = parsed.flags.get('P') === true;
    const formatFlag = parsed.flags.get('F');

    if (printFlag && typeof formatFlag === 'string') {
      const formatted = this.formatTmuxString(formatFlag, newPaneId, { ...ctx, windowId });
      return { output: formatted, success: true };
    }

    if (printFlag) {
      // Default -P output: tmux pane id
      const tmuxId = ptyManager.getPaneTmuxId(newPaneId) ?? newPaneId;
      return { output: tmuxId, success: true };
    }

    // Return the new pane ID so callers (like Claude Code) can reference it
    return { output: newPaneId, success: true };
  }

  /**
   * new-window: Create a new window in the current session.
   *
   * Flags: -n (window name), -t (target window)
   *
   * Creates a new window with an initial pane, spawns a PTY, and broadcasts
   * a `windowCreated` message to all connected clients.
   */
  private handleNewWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const nameFlag = parsed.flags.get('n');
    const windowName = typeof nameFlag === 'string' ? nameFlag : `Window ${Date.now()}`;
    const cwdFlag = parsed.flags.get('c');
    const cwd = typeof cwdFlag === 'string' ? cwdFlag : undefined;

    // Create window via session service (persists to DB, creates initial pane)
    const window = sessionService.createWindow(ctx.sessionId, windowName, 'default', cwd);
    if (!window) {
      return { output: `Failed to create window in session ${ctx.sessionId}`, success: false };
    }

    // Spawn PTY for the initial pane
    const initialPane = window.panes[0];
    if (initialPane) {
      ptyManager.spawn(initialPane.id, {
        shell: 'default',
        cols: initialPane.cols,
        rows: initialPane.rows,
        sessionId: ctx.sessionId,
        ...(cwd ? { cwd } : {}),
      });
      initialPane.connectionState = 'connected';
    }

    // Broadcast windowCreated to all WebSocket clients in this session
    broadcastToSession(ctx.sessionId, {
      type: 'windowCreated',
      payload: { window },
    });

    logger.info('new-window: window created', {
      windowId: window.id,
      sessionId: ctx.sessionId,
      name: windowName,
    });

    // Handle -P -F format output
    const printFlag = parsed.flags.get('P') === true;
    const formatFlag = parsed.flags.get('F');
    const paneId = initialPane?.id ?? '';

    if (printFlag && typeof formatFlag === 'string') {
      const formatted = this.formatTmuxString(formatFlag, paneId, { ...ctx, windowId: window.id });
      return { output: formatted, success: true };
    }

    if (printFlag) {
      const tmuxId = ptyManager.getPaneTmuxId(paneId) ?? paneId;
      return { output: tmuxId, success: true };
    }

    // Return the window ID (and initial pane ID) for callers
    return { output: `${window.id}:${paneId}`, success: true };
  }

  // ==========================================================================
  // New command handlers
  // ==========================================================================

  /**
   * has-session: Check if a session exists by name or ID.
   *
   * Flags: -t (target session name or ID)
   */
  private handleHasSession(parsed: ParsedCommand): CommandResult {
    const targetFlag = parsed.flags.get('t');
    if (typeof targetFlag !== 'string') {
      return { output: 'Missing target session (-t flag)', success: false };
    }

    const sessions = sessionService.getAllSessions();
    const found = sessions.find(
      (s) => s.id === targetFlag || s.name === targetFlag,
    );

    if (found) {
      return { output: '', success: true };
    }
    return { output: `session not found: ${targetFlag}`, success: false };
  }

  /**
   * kill-session: Kill a session and all its windows/panes/PTYs.
   *
   * Flags: -t (target session name or ID)
   */
  private handleKillSession(parsed: ParsedCommand): CommandResult {
    const targetFlag = parsed.flags.get('t');
    if (typeof targetFlag !== 'string') {
      return { output: 'Missing target session (-t flag)', success: false };
    }

    // Find session by name or ID
    const sessions = sessionService.getAllSessions();
    const found = sessions.find(
      (s) => s.id === targetFlag || s.name === targetFlag,
    );

    if (!found) {
      return { output: `session not found: ${targetFlag}`, success: false };
    }

    const deleted = sessionService.deleteSession(found.id);
    if (!deleted) {
      return { output: `Failed to delete session: ${targetFlag}`, success: false };
    }

    logger.info('kill-session: session killed', { sessionId: found.id, name: found.name });
    return { output: '', success: true };
  }

  /**
   * send-keys: Send keystrokes to a target pane's PTY.
   *
   * Flags: -t (target pane), -l (literal keys)
   * Positional: keys to send (remaining args)
   *
   * Special key names: Enter (\r), Space ( ), Escape (\x1b), Tab (\t),
   * BSpace (\x7f), C-c (\x03), C-d (\x04), C-z (\x1a)
   */
  private handleSendKeys(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const paneId = this.resolvePaneTarget(parsed.flags.get('t'), ctx.paneId);

    if (!paneId) {
      return { output: 'No target pane specified', success: false };
    }

    if (!ptyManager.hasPty(paneId)) {
      return { output: `Pane not found or no PTY: ${paneId}`, success: false };
    }

    // Collect all positional args as the keys to send
    const keys = parsed.positional;
    if (keys.length === 0) {
      return { output: '', success: true };
    }

    // Special key name mapping
    const SPECIAL_KEYS: Record<string, string> = {
      'Enter': '\r',
      'Space': ' ',
      'Escape': '\x1b',
      'Tab': '\t',
      'BSpace': '\x7f',
      'C-c': '\x03',
      'C-d': '\x04',
      'C-z': '\x1a',
      'C-l': '\x0c',
      'C-a': '\x01',
      'C-e': '\x05',
      'C-k': '\x0b',
      'C-u': '\x15',
      'C-w': '\x17',
    };

    // Build the data to write: process each key
    const parts: string[] = [];
    for (const key of keys) {
      const special = SPECIAL_KEYS[key];
      if (special !== undefined) {
        parts.push(special);
      } else {
        parts.push(key);
      }
    }

    const data = parts.join('');
    ptyManager.write(paneId, data);

    logger.info('send-keys: sent to pane', { paneId, keyCount: keys.length });
    return { output: '', success: true };
  }

  /**
   * kill-pane: Kill a pane's PTY and remove it from the layout.
   *
   * Flags: -t (target pane)
   *
   * If the killed pane is the last in a window, the window is also killed.
   */
  private handleKillPane(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const paneId = this.resolvePaneTarget(parsed.flags.get('t'), ctx.paneId);

    if (!paneId) {
      return { output: 'No target pane specified', success: false };
    }

    // Find the pane's window
    const pane = sessionService.getPane(paneId);
    if (!pane) {
      return { output: `Pane not found: ${paneId}`, success: false };
    }

    const window = sessionService.getWindow(pane.windowId);
    if (!window) {
      return { output: 'Window not found', success: false };
    }

    // Kill the PTY
    if (ptyManager.hasPty(paneId)) {
      ptyManager.kill(paneId);
    }

    const paneIds = getPaneIds(window.layout);

    if (paneIds.length <= 1) {
      // Last pane in window — kill the window
      sessionService.deleteWindow(window.id);

      broadcastToSession(ctx.sessionId, {
        type: 'windowClosed',
        payload: { windowId: window.id },
      });

      logger.info('kill-pane: last pane killed, window closed', { paneId, windowId: window.id });
    } else {
      // Extract pane from layout
      const result = extractPane(window.layout, paneId);
      if (result.extracted && result.remainingLayout) {
        sessionService.updateWindowLayout(window.id, result.remainingLayout);
      }

      // Delete the pane record
      sessionService.deletePane(paneId);

      broadcastToSession(ctx.sessionId, {
        type: 'paneClosed',
        payload: { paneId, layout: result.remainingLayout ?? window.layout },
      });

      logger.info('kill-pane: pane killed', { paneId, windowId: window.id });
    }

    return { output: '', success: true };
  }

  /**
   * resize-pane: Resize a pane by adjusting layout sizes.
   *
   * Flags: -t (target pane), -x (width), -y (height), -Z (toggle zoom)
   */
  private handleResizePane(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const paneId = this.resolvePaneTarget(parsed.flags.get('t'), ctx.paneId);
    const xFlag = parsed.flags.get('x');
    const yFlag = parsed.flags.get('y');
    const zoomFlag = parsed.flags.get('Z') === true;

    if (!paneId) {
      return { output: 'No target pane specified', success: false };
    }

    if (zoomFlag) {
      // Toggle zoom is a stub for now
      return { output: '', success: true };
    }

    // For -x and -y with percentage values, we'd need to adjust layout sizes
    // For now, acknowledge the resize request (layout engine handles actual sizing)
    if (typeof xFlag === 'string' || typeof yFlag === 'string') {
      // Parse the values (may be percentage like "30%" or absolute like "80")
      logger.info('resize-pane: resize requested', { paneId, x: xFlag, y: yFlag });
      return { output: '', success: true };
    }

    return { output: '', success: true };
  }

  /**
   * new-session: Create a new session.
   *
   * Flags: -d (detached), -s (name), -n (window name), -P (print),
   *        -F (format), -c (cwd), -A (attach-or-create), -x (width), -y (height)
   * Positional: command to run (after -- separator)
   */
  private handleNewSession(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const nameFlag = parsed.flags.get('s');
    const windowNameFlag = parsed.flags.get('n');
    const cwdFlag = parsed.flags.get('c');
    const printFlag = parsed.flags.get('P') === true;
    const formatFlag = parsed.flags.get('F');
    const attachOrCreate = parsed.flags.get('A') === true;

    const sessionName = typeof nameFlag === 'string' ? nameFlag : `Session ${Date.now()}`;
    const windowName = typeof windowNameFlag === 'string' ? windowNameFlag : undefined;
    const cwd = typeof cwdFlag === 'string' ? cwdFlag : undefined;

    // -A flag: if session already exists with this name, return its info
    if (attachOrCreate) {
      const sessions = sessionService.getAllSessions();
      const existing = sessions.find((s) => s.name === sessionName);
      if (existing) {
        const fullSession = sessionService.getSession(existing.id);
        if (fullSession) {
          // Find the active pane
          const activeWindow = fullSession.windows.find(
            (w) => w.id === fullSession.activeWindowId,
          ) ?? fullSession.windows[0];
          const activePaneId = activeWindow?.panes[0]?.id ?? '';

          if (printFlag && typeof formatFlag === 'string') {
            const formatted = this.formatTmuxString(formatFlag, activePaneId, {
              sessionId: fullSession.id,
              windowId: activeWindow?.id ?? '',
              paneId: activePaneId,
            });
            return { output: formatted, success: true };
          }

          if (printFlag) {
            const tmuxId = ptyManager.getPaneTmuxId(activePaneId) ?? activePaneId;
            return { output: tmuxId, success: true };
          }

          return { output: fullSession.id, success: true };
        }
      }
    }

    // Create new session
    const createOpts: { name: string; cwd?: string } = { name: sessionName };
    if (cwd !== undefined) createOpts.cwd = cwd;
    const session = sessionService.createSession(createOpts);

    // Rename the initial window if -n was provided
    if (windowName && session.windows[0]) {
      sessionService.renameWindow(session.windows[0].id, windowName);
    }

    // Spawn PTY for the initial pane
    const initialWindow = session.windows[0];
    const initialPane = initialWindow?.panes[0];
    if (initialPane) {
      ptyManager.spawn(initialPane.id, {
        shell: 'default',
        cols: initialPane.cols,
        rows: initialPane.rows,
        sessionId: session.id,
        ...(cwd ? { cwd } : {}),
      });
    }

    // If there's a command to run (positional args after --), send it to the pane
    if (parsed.positional.length > 0 && initialPane) {
      const cmd = parsed.positional.join(' ');
      // Give the shell a moment to start, then send the command
      setTimeout(() => {
        ptyManager.write(initialPane.id, cmd + '\r');
      }, 100);
    }

    // Broadcast session creation
    broadcastToSession(session.id, {
      type: 'windowCreated',
      payload: { window: initialWindow },
    });

    logger.info('new-session: session created', {
      sessionId: session.id,
      name: sessionName,
    });

    // Handle -P -F output
    const paneId = initialPane?.id ?? '';
    const windowId = initialWindow?.id ?? '';

    if (printFlag && typeof formatFlag === 'string') {
      const formatted = this.formatTmuxString(formatFlag, paneId, {
        sessionId: session.id,
        windowId,
        paneId,
      });
      return { output: formatted, success: true };
    }

    if (printFlag) {
      const tmuxId = ptyManager.getPaneTmuxId(paneId) ?? paneId;
      return { output: tmuxId, success: true };
    }

    return { output: session.id, success: true };
  }

  /**
   * rename-session: Rename the current or target session.
   *
   * Positional: new name
   * Flags: -t (target session)
   */
  private handleRenameSession(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');
    let sessionId = ctx.sessionId;

    if (typeof targetFlag === 'string') {
      const sessions = sessionService.getAllSessions();
      const found = sessions.find((s) => s.id === targetFlag || s.name === targetFlag);
      if (!found) {
        return { output: `session not found: ${targetFlag}`, success: false };
      }
      sessionId = found.id;
    }

    const newName = parsed.positional[0];
    if (newName === undefined) {
      return { output: 'Missing session name argument', success: false };
    }

    const updated = sessionService.updateSession(sessionId, { name: newName });
    if (!updated) {
      return { output: `Session not found: ${sessionId}`, success: false };
    }

    broadcastToSession(sessionId, {
      type: 'sessionRenamed',
      payload: { sessionId, name: newName },
    });

    logger.info('rename-session: session renamed', { sessionId, newName });
    return { output: '', success: true };
  }

  /**
   * kill-window: Kill a window and all its panes.
   *
   * Flags: -t (target window), -a (kill all other windows)
   */
  private handleKillWindow(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');
    const killAllOthers = parsed.flags.get('a') === true;

    const session = sessionService.getSession(ctx.sessionId);
    if (!session) {
      return { output: 'Session not found', success: false };
    }

    if (killAllOthers) {
      // Kill all windows except the target/current
      const keepWindowId = typeof targetFlag === 'string' ? targetFlag : ctx.windowId;
      for (const win of session.windows) {
        if (win.id !== keepWindowId) {
          sessionService.deleteWindow(win.id);
          broadcastToSession(ctx.sessionId, {
            type: 'windowClosed',
            payload: { windowId: win.id },
          });
        }
      }
      logger.info('kill-window: killed all windows except', { keepWindowId });
      return { output: '', success: true };
    }

    const windowId = typeof targetFlag === 'string' ? targetFlag : ctx.windowId;
    const window = sessionService.getWindow(windowId);
    if (!window) {
      return { output: `Window not found: ${windowId}`, success: false };
    }

    // Kill all PTYs in this window
    const paneIds = getPaneIds(window.layout);
    for (const pid of paneIds) {
      if (ptyManager.hasPty(pid)) {
        ptyManager.kill(pid);
      }
    }

    sessionService.deleteWindow(windowId);

    broadcastToSession(ctx.sessionId, {
      type: 'windowClosed',
      payload: { windowId },
    });

    logger.info('kill-window: window killed', { windowId });
    return { output: '', success: true };
  }

  /**
   * next-window: Switch to the next window in the session.
   */
  private handleNextWindow(ctx: CommandContext): CommandResult {
    const session = sessionService.getSession(ctx.sessionId);
    if (!session) {
      return { output: 'Session not found', success: false };
    }

    if (session.windows.length <= 1) {
      return { output: '', success: true };
    }

    const currentIdx = session.windows.findIndex((w) => w.id === ctx.windowId);
    const nextIdx = (currentIdx + 1) % session.windows.length;
    const nextWindow = session.windows[nextIdx];

    if (!nextWindow) {
      return { output: 'No next window', success: false };
    }

    return { output: nextWindow.id, success: true };
  }

  /**
   * previous-window: Switch to the previous window in the session.
   */
  private handlePreviousWindow(ctx: CommandContext): CommandResult {
    const session = sessionService.getSession(ctx.sessionId);
    if (!session) {
      return { output: 'Session not found', success: false };
    }

    if (session.windows.length <= 1) {
      return { output: '', success: true };
    }

    const currentIdx = session.windows.findIndex((w) => w.id === ctx.windowId);
    const prevIdx = (currentIdx - 1 + session.windows.length) % session.windows.length;
    const prevWindow = session.windows[prevIdx];

    if (!prevWindow) {
      return { output: 'No previous window', success: false };
    }

    return { output: prevWindow.id, success: true };
  }

  /**
   * clock-mode: Display a large clock in the target pane.
   *
   * Broadcasts a clockMode message to the session so the frontend
   * can show the ClockMode component overlay on the target pane.
   */
  private handleClockMode(parsed: ParsedCommand, ctx: CommandContext): CommandResult {
    const targetFlag = parsed.flags.get('t');
    const paneId = this.resolvePaneTarget(targetFlag, ctx.paneId);

    broadcastToSession(ctx.sessionId, {
      type: 'clockMode',
      payload: { paneId },
    });

    return { output: '', success: true };
  }

  /**
   * Return a success stub for unimplemented commands.
   */
  private stubSuccess(): CommandResult {
    return { output: '', success: true };
  }
}

/** Singleton instance */
export const commandService = new CommandService();
