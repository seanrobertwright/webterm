/**
 * PTY spawning and management service
 * Handles node-pty lifecycle and communication
 */

import * as pty from 'node-pty';
import os from 'os';
import { getDefaultShell, resolveShellPath } from './shell-service.js';
import { logger } from '../utils/logger.js';
import type { ShellType } from '../../../shared/types/models.js';

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
      cwd = os.homedir(),
      cols = DEFAULT_COLS,
      rows = DEFAULT_ROWS,
      env,
    } = options;

    // Resolve shell path
    let shellPath: string;
    if (!shell) {
      shellPath = getDefaultShell();
    } else if (['powershell', 'pwsh', 'cmd', 'bash', 'zsh', 'sh', 'default'].includes(shell)) {
      shellPath = resolveShellPath(shell as ShellType);
    } else {
      shellPath = shell;
    }

    logger.info(`Spawning PTY for pane ${paneId}: ${shellPath} (${cols}x${rows}) in ${cwd}`);

    // Prepare shell arguments
    let shellArgs: string[] = [];
    
    // PowerShell-specific args for better terminal behavior
    if (shellPath.includes('powershell') || shellPath.includes('pwsh')) {
      shellArgs = ['-NoLogo'];
    }

    // Spawn the PTY
    const ptyProcess = pty.spawn(shellPath, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: this.getEnvironment(env),
      useConpty: os.platform() === 'win32', // Use ConPTY on Windows
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

    // Set up event handlers
    ptyProcess.onData((data) => {
      if (this.eventHandlers.onData) {
        this.eventHandlers.onData(paneId, data);
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      logger.info(`PTY exited for pane ${paneId}: code=${exitCode}, signal=${signal}`);
      
      // Remove from map
      this.terminals.delete(paneId);
      
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
}

/** Singleton instance */
export const ptyManager = new PtyManager();
