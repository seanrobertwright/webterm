/**
 * PTY spawning and management service
 * Handles node-pty lifecycle and communication
 */

import * as pty from '@lydell/node-pty';
import * as fs from 'node:fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDefaultShell, resolveShellPath } from './shell-service.js';
import { logger } from '../utils/logger.js';
import type { ShellType } from '../../../shared/types/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Directory containing the tmux shim script */
const TMUX_SHIM_DIR = path.resolve(__dirname, '..', 'tmux-shim');

/** Options for spawning a new PTY */
export interface PtySpawnOptions {
  /** Shell type or path */
  shell?: ShellType | string;
  /** Working directory */
  cwd?: string;
  /** Terminal columns */
  cols?: number;
  /** Terminal rows */
  rows?: number;
  /** Environment variables to add */
  env?: Record<string, string>;
  /** Session ID (used for TMUX env var) */
  sessionId?: string;
}

/** PTY instance with metadata */
export interface PtyInstance {
  pty: pty.IPty;
  paneId: string;
  shell: string;
  cwd: string;
  cols: number;
  rows: number;
  createdAt: number;
}

/** Event handlers for PTY events */
export interface PtyEventHandlers {
  onData?: (paneId: string, data: string) => void;
  onExit?: (paneId: string, exitCode: number, signal?: number) => void;
  onTitleChange?: (paneId: string, title: string) => void;
  onBell?: (paneId: string) => void;
}

/** Default terminal dimensions */
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

/**
 * PTY Manager - manages all active PTY instances
 */
export class PtyManager {
  private terminals: Map<string, PtyInstance> = new Map();
  private eventHandlers: PtyEventHandlers = {};
  private paneCounter = 0;

  /** Map pane UUID -> tmux-style pane index (the N in %N) */
  private paneIndexMap: Map<string, number> = new Map();
  /** Reverse map: tmux pane index -> pane UUID */
  private indexToPaneMap: Map<number, string> = new Map();

  /**
   * Set event handlers for PTY events
   */
  setEventHandlers(handlers: PtyEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Get environment variables for PTY
   */
  private getEnvironment(additionalEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ...additionalEnv,
    };

    // Remove Claude Code env vars so spawned shells don't think
    // they're inside a Claude Code instance
    delete env['CLAUDECODE'];
    delete env['CLAUDE_CODE_SSE_PORT'];
    delete env['CLAUDE_CODE_ENTRYPOINT'];

    // On Windows, ensure SystemRoot is set (required for PowerShell)
    if (os.platform() === 'win32') {
      if (!env['SystemRoot']) {
        env['SystemRoot'] = process.env['SystemRoot'] ?? 'C:\\Windows';
      }
      // Also ensure system PATH entries are present
      if (!env['Path'] && process.env['PATH']) {
        env['Path'] = process.env['PATH'];
      }
    }

    return env;
  }

  /**
   * Spawn a new PTY instance
   */
  spawn(paneId: string, options: PtySpawnOptions = {}): PtyInstance {
    const {
      shell,
      cols = DEFAULT_COLS,
      rows = DEFAULT_ROWS,
      env,
      sessionId,
    } = options;

    let cwd = options.cwd ?? os.homedir();

    // Safety net: fall back to home directory if configured cwd is invalid
    if (cwd && cwd !== os.homedir() && !fs.existsSync(cwd)) {
      logger.warn(`Configured cwd does not exist: ${cwd}, falling back to home directory`);
      cwd = os.homedir();
    }

    // Resolve shell path
    let shellPath: string;
    if (!shell) {
      shellPath = getDefaultShell();
    } else if (['powershell', 'pwsh', 'cmd', 'bash', 'zsh', 'sh', 'default'].includes(shell)) {
      shellPath = resolveShellPath(shell as ShellType);
    } else {
      shellPath = shell;
    }

    // Assign a pane index for TMUX_PANE env var
    const paneIndex = this.paneCounter++;

    // Track the mapping between pane UUID and tmux-style %N index
    this.paneIndexMap.set(paneId, paneIndex);
    this.indexToPaneMap.set(paneIndex, paneId);

    // Build TMUX environment variables so child processes know they're inside a
    // tmux-compatible multiplexer.
    const tmuxEnv: Record<string, string> = {
      TMUX: `/tmp/webterm-${sessionId ?? 'unknown'},${process.pid},0`,
      TMUX_PANE: `%${paneIndex}`,
      WEBTERM_PANE_ID: paneId,
      WEBTERM_SESSION_ID: sessionId ?? '',
      WEBTERM_PORT: String(process.env['PORT'] ?? '9174'),
    };

    // Prepend the tmux shim directory to PATH so `tmux` commands from child
    // processes are intercepted by our shim rather than a real tmux binary.
    const pathSep = os.platform() === 'win32' ? ';' : ':';
    const pathKey = os.platform() === 'win32' ? 'Path' : 'PATH';
    const currentPath = env?.[pathKey] ?? process.env[pathKey] ?? process.env['PATH'] ?? '';
    tmuxEnv[pathKey] = `${TMUX_SHIM_DIR}${pathSep}${currentPath}`;

    logger.info(`Spawning PTY for pane ${paneId}: ${shellPath} (${cols}x${rows}) in ${cwd}`);

    // Prepare shell arguments
    let shellArgs: string[] = [];
    
    // PowerShell-specific args: inject custom prompt that emits OSC title with CWD
    // ConPTY doesn't translate SetConsoleTitle to OSC sequences, so we emit them explicitly.
    if (shellPath.includes('powershell') || shellPath.includes('pwsh')) {
      const promptFn = [
        'function prompt {',
        '  $p = $executionContext.SessionState.Path.CurrentLocation.Path;',
        '  Write-Host -NoNewline "$([char]27)]0;$p$([char]7)";',
        '  "PS $p> "',
        '}',
      ].join(' ');
      shellArgs = ['-NoLogo', '-NoExit', '-Command', promptFn];
    }

    // Spawn the PTY
    const ptyProcess = pty.spawn(shellPath, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: this.getEnvironment({ ...env, ...tmuxEnv }),
    });

    // Store the instance
    const instance: PtyInstance = {
      pty: ptyProcess,
      paneId,
      shell: shellPath,
      cwd,
      cols,
      rows,
      createdAt: Date.now(),
    };

    this.terminals.set(paneId, instance);

    // Note: PowerShell OSC title setup is handled via -Command args above,
    // so no post-spawn write is needed.

    // Set up event handlers
    ptyProcess.onData((data) => {
      // Detect OSC 0/2 title sequences: \x1b]0;title\x07 or \x1b]2;title\x07
      if (this.eventHandlers.onTitleChange) {
        const oscMatch = /\x1b\](?:0|2);([^\x07]*)\x07/.exec(data);
        if (oscMatch && oscMatch[1] !== undefined) {
          this.eventHandlers.onTitleChange(paneId, oscMatch[1]);
        }
      }

      // Detect standalone BEL characters (not part of OSC sequences)
      if (this.eventHandlers.onBell) {
        // Strip all OSC sequences (ESC ] ... BEL or ESC ] ... ST) first
        const stripped = data.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
        if (stripped.includes('\x07')) {
          this.eventHandlers.onBell(paneId);
        }
      }

      if (this.eventHandlers.onData) {
        this.eventHandlers.onData(paneId, data);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      logger.info(`PTY exited for pane ${paneId}: code=${exitCode}, signal=${signal}`);

      // Remove from map
      this.terminals.delete(paneId);

      // Clean up pane index mappings
      const exitIdx = this.paneIndexMap.get(paneId);
      if (exitIdx !== undefined) {
        this.indexToPaneMap.delete(exitIdx);
      }
      this.paneIndexMap.delete(paneId);

      if (this.eventHandlers.onExit) {
        this.eventHandlers.onExit(paneId, exitCode, signal);
      }
    });

    return instance;
  }

  /**
   * Write data to a PTY
   */
  write(paneId: string, data: string): boolean {
    const instance = this.terminals.get(paneId);
    if (!instance) {
      logger.warn(`Cannot write to non-existent PTY: ${paneId}`);
      return false;
    }

    instance.pty.write(data);
    return true;
  }

  /**
   * Resize a PTY
   */
  resize(paneId: string, cols: number, rows: number): boolean {
    const instance = this.terminals.get(paneId);
    if (!instance) {
      logger.warn(`Cannot resize non-existent PTY: ${paneId}`);
      return false;
    }

    // Validate dimensions
    if (cols < 1 || cols > 500 || rows < 1 || rows > 200) {
      logger.warn(`Invalid resize dimensions: ${cols}x${rows}`);
      return false;
    }

    logger.debug(`Resizing PTY ${paneId} to ${cols}x${rows}`);
    instance.pty.resize(cols, rows);
    instance.cols = cols;
    instance.rows = rows;
    return true;
  }

  /**
   * Kill a PTY
   */
  kill(paneId: string): boolean {
    const instance = this.terminals.get(paneId);
    if (!instance) {
      logger.warn(`Cannot kill non-existent PTY: ${paneId}`);
      return false;
    }

    logger.info(`Killing PTY: ${paneId}`);
    instance.pty.kill();
    this.terminals.delete(paneId);

    // Clean up pane index mappings
    const idx = this.paneIndexMap.get(paneId);
    if (idx !== undefined) {
      this.indexToPaneMap.delete(idx);
    }
    this.paneIndexMap.delete(paneId);

    return true;
  }

  /**
   * Get a terminal instance by pane ID
   */
  getTerminal(paneId: string): PtyInstance | undefined {
    return this.terminals.get(paneId);
  }

  /**
   * Get all active terminal pane IDs
   */
  getActivePaneIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * Check if a pane has an active PTY
   */
  hasPty(paneId: string): boolean {
    return this.terminals.has(paneId);
  }

  /**
   * Get the count of active PTYs
   */
  getActiveCount(): number {
    return this.terminals.size;
  }

  /**
   * Kill all active PTYs (for cleanup)
   */
  killAll(): void {
    logger.info(`Killing all ${this.terminals.size} PTYs`);
    for (const paneId of this.terminals.keys()) {
      this.kill(paneId);
    }
  }

  /**
   * Pause a PTY output (for flow control)
   */
  pause(paneId: string): boolean {
    const instance = this.terminals.get(paneId);
    if (!instance) return false;
    
    instance.pty.pause();
    return true;
  }

  /**
   * Resume a PTY output (for flow control)
   */
  resume(paneId: string): boolean {
    const instance = this.terminals.get(paneId);
    if (!instance) return false;
    
    instance.pty.resume();
    return true;
  }

  /**
   * Clear the PTY buffer
   */
  clear(paneId: string): boolean {
    const instance = this.terminals.get(paneId);
    if (!instance) return false;

    instance.pty.clear();
    return true;
  }

  /**
   * Get the tmux-style %N pane ID for a given pane UUID.
   * Returns the string like "%5" or undefined if not found.
   */
  getPaneTmuxId(paneId: string): string | undefined {
    const idx = this.paneIndexMap.get(paneId);
    if (idx === undefined) return undefined;
    return `%${idx}`;
  }

  /**
   * Resolve a tmux-style %N pane ID back to a pane UUID.
   * Accepts format "%N" or just "N".
   * Returns the pane UUID or undefined if not found.
   */
  resolveTmuxPaneId(tmuxId: string): string | undefined {
    const numStr = tmuxId.startsWith('%') ? tmuxId.slice(1) : tmuxId;
    const idx = parseInt(numStr, 10);
    if (isNaN(idx)) return undefined;
    return this.indexToPaneMap.get(idx);
  }
}

/** Singleton instance */
export const ptyManager = new PtyManager();
