/**
 * Terminal runtime class
 * Holds PTY handle and manages scrollback buffer for reconnection replay
 */

import type * as pty from 'node-pty';

/** Default buffer configuration */
export const TERMINAL_BUFFER_CONFIG = {
  /** Maximum number of lines to keep in the replay buffer */
  MAX_BUFFER_LINES: 1000,
  /** Maximum characters per line before truncation */
  MAX_LINE_LENGTH: 2000,
  /** Idle timeout before considering terminal idle (ms) */
  IDLE_TIMEOUT: 30000,
};

/**
 * Terminal class - runtime representation of a terminal emulator instance
 * Note: This is ephemeral and not stored in the database
 */
export class Terminal {
  /** Associated pane ID */
  public readonly paneId: string;
  
  /** node-pty process handle */
  public pty: pty.IPty | null = null;
  
  /** Scrollback buffer for reconnection replay */
  private _buffer: string[] = [];
  
  /** Last output timestamp */
  private _lastOutput: number = Date.now();
  
  /** Maximum buffer lines */
  private readonly maxBufferLines: number;
  
  /** Whether the terminal has exited */
  private _exited: boolean = false;
  
  /** Exit code if exited */
  private _exitCode: number | null = null;

  constructor(paneId: string, ptyProcess?: pty.IPty, maxBufferLines = TERMINAL_BUFFER_CONFIG.MAX_BUFFER_LINES) {
    this.paneId = paneId;
    this.pty = ptyProcess ?? null;
    this.maxBufferLines = maxBufferLines;
  }

  /**
   * Get the scrollback buffer
   */
  get buffer(): readonly string[] {
    return this._buffer;
  }

  /**
   * Get the last output timestamp
   */
  get lastOutput(): number {
    return this._lastOutput;
  }

  /**
   * Check if the terminal has exited
   */
  get exited(): boolean {
    return this._exited;
  }

  /**
   * Get the exit code
   */
  get exitCode(): number | null {
    return this._exitCode;
  }

  /**
   * Check if the terminal is idle
   */
  get isIdle(): boolean {
    return Date.now() - this._lastOutput > TERMINAL_BUFFER_CONFIG.IDLE_TIMEOUT;
  }

  /**
   * Get buffer size in lines
   */
  get bufferSize(): number {
    return this._buffer.length;
  }

  /**
   * Add data to the scrollback buffer
   * Handles line splitting and buffer size management
   */
  addToBuffer(data: string): void {
    this._lastOutput = Date.now();

    // Split data into lines, handling various line endings
    const lines = data.split(/\r?\n/);

    for (const line of lines) {
      // Truncate long lines
      const truncatedLine = line.length > TERMINAL_BUFFER_CONFIG.MAX_LINE_LENGTH
        ? line.substring(0, TERMINAL_BUFFER_CONFIG.MAX_LINE_LENGTH) + '...'
        : line;

      // If buffer has content and last entry doesn't end with newline,
      // append to the last line
      if (this._buffer.length > 0 && lines[0] && !lines[0].startsWith('\n')) {
        const lastIndex = this._buffer.length - 1;
        const lastLine = this._buffer[lastIndex];
        if (lastLine === undefined) continue;
        const combined = lastLine + truncatedLine;
        this._buffer[lastIndex] = combined.length > TERMINAL_BUFFER_CONFIG.MAX_LINE_LENGTH
          ? combined.substring(0, TERMINAL_BUFFER_CONFIG.MAX_LINE_LENGTH) + '...'
          : combined;
      } else {
        this._buffer.push(truncatedLine);
      }
    }

    // Trim buffer if it exceeds maximum size
    while (this._buffer.length > this.maxBufferLines) {
      this._buffer.shift();
    }
  }

  /**
   * Get the replay buffer for reconnection
   * @param lines Number of lines to return (defaults to all)
   */
  getReplayBuffer(lines?: number): string[] {
    if (lines === undefined || lines >= this._buffer.length) {
      return [...this._buffer];
    }

    return this._buffer.slice(-lines);
  }

  /**
   * Get replay buffer as a single string
   */
  getReplayString(lines?: number): string {
    return this.getReplayBuffer(lines).join('\n');
  }

  /**
   * Clear the buffer
   */
  clearBuffer(): void {
    this._buffer = [];
  }

  /**
   * Mark the terminal as exited
   */
  markExited(exitCode: number): void {
    this._exited = true;
    this._exitCode = exitCode;
    this.pty = null;
  }

  /**
   * Write data to the PTY
   */
  write(data: string): boolean {
    if (!this.pty || this._exited) {
      return false;
    }

    this.pty.write(data);
    return true;
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): boolean {
    if (!this.pty || this._exited) {
      return false;
    }

    this.pty.resize(cols, rows);
    return true;
  }

  /**
   * Kill the PTY
   */
  kill(): void {
    if (this.pty && !this._exited) {
      this.pty.kill();
      this._exited = true;
    }
  }

  /**
   * Get terminal statistics
   */
  getStats(): TerminalStats {
    return {
      paneId: this.paneId,
      bufferLines: this._buffer.length,
      bufferBytes: this._buffer.reduce((sum, line) => sum + line.length, 0),
      lastOutput: this._lastOutput,
      isIdle: this.isIdle,
      exited: this._exited,
      exitCode: this._exitCode,
    };
  }

  /**
   * Serialize terminal state (for debugging or persistence)
   */
  toJSON(): TerminalState {
    return {
      paneId: this.paneId,
      buffer: [...this._buffer],
      lastOutput: this._lastOutput,
      exited: this._exited,
      exitCode: this._exitCode,
    };
  }

  /**
   * Restore terminal state from serialized data
   */
  static fromJSON(state: TerminalState, ptyProcess?: pty.IPty): Terminal {
    const terminal = new Terminal(state.paneId, ptyProcess);
    terminal._buffer = [...state.buffer];
    terminal._lastOutput = state.lastOutput;
    terminal._exited = state.exited;
    terminal._exitCode = state.exitCode;
    return terminal;
  }
}

/**
 * Terminal statistics
 */
export interface TerminalStats {
  paneId: string;
  bufferLines: number;
  bufferBytes: number;
  lastOutput: number;
  isIdle: boolean;
  exited: boolean;
  exitCode: number | null;
}

/**
 * Serialized terminal state
 */
export interface TerminalState {
  paneId: string;
  buffer: string[];
  lastOutput: number;
  exited: boolean;
  exitCode: number | null;
}

/**
 * Terminal Manager - manages all Terminal instances
 */
export class TerminalManager {
  private terminals: Map<string, Terminal> = new Map();

  /**
   * Create a new terminal instance
   */
  create(paneId: string, ptyProcess?: pty.IPty): Terminal {
    const terminal = new Terminal(paneId, ptyProcess);
    this.terminals.set(paneId, terminal);
    return terminal;
  }

  /**
   * Get a terminal by pane ID
   */
  get(paneId: string): Terminal | undefined {
    return this.terminals.get(paneId);
  }

  /**
   * Check if a terminal exists
   */
  has(paneId: string): boolean {
    return this.terminals.has(paneId);
  }

  /**
   * Remove a terminal
   */
  remove(paneId: string): boolean {
    const terminal = this.terminals.get(paneId);
    if (terminal) {
      terminal.kill();
      this.terminals.delete(paneId);
      return true;
    }
    return false;
  }

  /**
   * Get all terminal pane IDs
   */
  getAllPaneIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * Get count of active terminals
   */
  get count(): number {
    return this.terminals.size;
  }

  /**
   * Get statistics for all terminals
   */
  getAllStats(): TerminalStats[] {
    return Array.from(this.terminals.values()).map((t) => t.getStats());
  }

  /**
   * Clear all terminals
   */
  clear(): void {
    for (const terminal of this.terminals.values()) {
      terminal.kill();
    }
    this.terminals.clear();
  }

  /**
   * Get total buffer memory usage (approximate)
   */
  getTotalBufferBytes(): number {
    let total = 0;
    for (const terminal of this.terminals.values()) {
      total += terminal.getStats().bufferBytes;
    }
    return total;
  }
}

/** Singleton terminal manager instance */
export const terminalManager = new TerminalManager();
