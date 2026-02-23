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

import { logger } from '../utils/logger.js';
import { sessionService } from './session-service.js';
import { optionService } from './option-service.js';
import { pasteBufferService } from './paste-buffer-service.js';
import { ptyManager } from './pty-service.js';
import type { ParsedCommand } from '../../../shared/tmux/command-registry.js';
import type { OptionScope } from '../../../shared/types/models.js';

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
          return this.stubSuccess();
        case 'rename-session':
          return this.stubSuccess();
        case 'detach-client':
          return this.stubSuccess();
        case 'switch-client':
          return this.stubSuccess();
        case 'list-sessions':
          return this.handleListSessions();

        // ================================================================
        // Window commands
        // ================================================================
        case 'new-window':
          return this.stubSuccess();
        case 'kill-window':
          return this.stubSuccess();
        case 'rename-window':
          return this.stubSuccess();
        case 'select-window':
          return this.stubSuccess();
        case 'last-window':
          return this.stubSuccess();
        case 'next-window':
          return this.stubSuccess();
        case 'previous-window':
          return this.stubSuccess();
        case 'swap-window':
          return this.stubSuccess();
        case 'move-window':
          return this.stubSuccess();
        case 'find-window':
          return this.stubSuccess();

        // ================================================================
        // Pane commands
        // ================================================================
        case 'split-window':
          return this.stubSuccess();
        case 'kill-pane':
          return this.stubSuccess();
        case 'select-pane':
          return this.stubSuccess();
        case 'swap-pane':
          return this.stubSuccess();
        case 'break-pane':
          return this.stubSuccess();
        case 'join-pane':
          return this.stubSuccess();
        case 'resize-pane':
          return this.stubSuccess();
        case 'rotate-window':
          return this.stubSuccess();
        case 'display-panes':
          return this.stubSuccess();
        case 'respawn-pane':
          return this.stubSuccess();

        // ================================================================
        // Layout commands
        // ================================================================
        case 'select-layout':
          return this.stubSuccess();
        case 'next-layout':
          return this.stubSuccess();
        case 'previous-layout':
          return this.stubSuccess();

        // ================================================================
        // Key binding commands
        // ================================================================
        case 'bind-key':
          return this.stubSuccess();
        case 'unbind-key':
          return this.stubSuccess();
        case 'list-keys':
          return this.handleListKeys();

        // ================================================================
        // Option commands
        // ================================================================
        case 'set-option':
          return this.handleSetOption(parsed, ctx);
        case 'show-options':
          return this.handleShowOptions(parsed, ctx);
        case 'source-file':
          return this.stubSuccess();

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

        // ================================================================
        // Hook commands
        // ================================================================
        case 'set-hook':
          return this.stubSuccess();
        case 'show-hooks':
          return this.stubSuccess();

        // ================================================================
        // Display commands
        // ================================================================
        case 'display-message':
          return this.stubSuccess();
        case 'clock-mode':
          return this.stubSuccess();
        case 'capture-pane':
          return this.stubSuccess();

        // ================================================================
        // Interactive mode commands
        // ================================================================
        case 'choose-tree':
          return this.stubSuccess();
        case 'choose-buffer':
          return this.stubSuccess();

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
   * list-keys: Placeholder for key binding list.
   */
  private handleListKeys(): CommandResult {
    return { output: 'Key bindings will be listed here', success: true };
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

  // ==========================================================================
  // Helpers
  // ==========================================================================

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

  /**
   * Return a success stub for unimplemented commands.
   */
  private stubSuccess(): CommandResult {
    return { output: '', success: true };
  }
}

/** Singleton instance */
export const commandService = new CommandService();
