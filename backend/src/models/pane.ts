/**
 * Pane model with validation
 * Represents an individual terminal pane within a window
 */

import { v4 as uuidv4 } from 'uuid';
import type { Pane, ShellType, ConnectionState } from '../../../shared/types/models.js';

/** Pane dimension constraints */
export const PANE_CONSTRAINTS = {
  MIN_COLS: 1,
  MAX_COLS: 500,
  MIN_ROWS: 1,
  MAX_ROWS: 200,
  DEFAULT_COLS: 80,
  DEFAULT_ROWS: 24,
};

/** Valid shell types */
export const VALID_SHELLS: ShellType[] = [
  'powershell',
  'pwsh',
  'cmd',
  'bash',
  'zsh',
  'sh',
  'default',
];

/** Valid connection states */
export const VALID_CONNECTION_STATES: ConnectionState[] = [
  'connecting',
  'connected',
  'disconnected',
  'exited',
];

/** Pane creation options */
export interface CreatePaneOptions {
  windowId: string;
  shell?: ShellType;
  cwd?: string;
  cols?: number;
  rows?: number;
}

/** Pane validation result */
export interface PaneValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Create a new pane record
 */
export function createPane(options: CreatePaneOptions): Pane {
  const {
    windowId,
    shell = 'default',
    cwd,
    cols = PANE_CONSTRAINTS.DEFAULT_COLS,
    rows = PANE_CONSTRAINTS.DEFAULT_ROWS,
  } = options;

  // Validate and clamp dimensions
  const validatedCols = Math.max(
    PANE_CONSTRAINTS.MIN_COLS,
    Math.min(PANE_CONSTRAINTS.MAX_COLS, cols)
  );
  const validatedRows = Math.max(
    PANE_CONSTRAINTS.MIN_ROWS,
    Math.min(PANE_CONSTRAINTS.MAX_ROWS, rows)
  );

  return {
    id: uuidv4(),
    windowId,
    shell,
    cwd: cwd ?? null,
    cols: validatedCols,
    rows: validatedRows,
    connectionState: 'disconnected',
    exitCode: null,
    createdAt: Date.now(),
    title: '',
    marked: false,
    currentCommand: null,
  };
}

/**
 * Validate pane dimensions
 */
export function validatePaneSize(cols: number, rows: number): PaneValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(cols)) {
    errors.push('cols must be an integer');
  } else if (cols < PANE_CONSTRAINTS.MIN_COLS) {
    errors.push(`cols must be at least ${PANE_CONSTRAINTS.MIN_COLS}`);
  } else if (cols > PANE_CONSTRAINTS.MAX_COLS) {
    errors.push(`cols must be at most ${PANE_CONSTRAINTS.MAX_COLS}`);
  }

  if (!Number.isInteger(rows)) {
    errors.push('rows must be an integer');
  } else if (rows < PANE_CONSTRAINTS.MIN_ROWS) {
    errors.push(`rows must be at least ${PANE_CONSTRAINTS.MIN_ROWS}`);
  } else if (rows > PANE_CONSTRAINTS.MAX_ROWS) {
    errors.push(`rows must be at most ${PANE_CONSTRAINTS.MAX_ROWS}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a shell type
 */
export function validateShell(shell: string): shell is ShellType {
  return VALID_SHELLS.includes(shell as ShellType);
}

/**
 * Validate a connection state
 */
export function validateConnectionState(state: string): state is ConnectionState {
  return VALID_CONNECTION_STATES.includes(state as ConnectionState);
}

/**
 * Validate a complete pane object
 */
export function validatePane(pane: Partial<Pane>): PaneValidationResult {
  const errors: string[] = [];

  if (!pane.id || typeof pane.id !== 'string') {
    errors.push('id is required and must be a string');
  }

  if (!pane.windowId || typeof pane.windowId !== 'string') {
    errors.push('windowId is required and must be a string');
  }

  if (!pane.shell || !validateShell(pane.shell)) {
    errors.push(`shell must be one of: ${VALID_SHELLS.join(', ')}`);
  }

  if (pane.cwd !== null && pane.cwd !== undefined && typeof pane.cwd !== 'string') {
    errors.push('cwd must be a string or null');
  }

  if (pane.cols !== undefined && pane.rows !== undefined) {
    const sizeValidation = validatePaneSize(pane.cols, pane.rows);
    errors.push(...sizeValidation.errors);
  }

  if (pane.connectionState && !validateConnectionState(pane.connectionState)) {
    errors.push(`connectionState must be one of: ${VALID_CONNECTION_STATES.join(', ')}`);
  }

  if (pane.exitCode !== null && pane.exitCode !== undefined && !Number.isInteger(pane.exitCode)) {
    errors.push('exitCode must be an integer or null');
  }

  if (pane.connectionState !== 'exited' && pane.exitCode !== null && pane.exitCode !== undefined) {
    errors.push('exitCode should only be set when connectionState is "exited"');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Clamp pane dimensions to valid range
 */
export function clampPaneSize(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Math.max(PANE_CONSTRAINTS.MIN_COLS, Math.min(PANE_CONSTRAINTS.MAX_COLS, Math.round(cols))),
    rows: Math.max(PANE_CONSTRAINTS.MIN_ROWS, Math.min(PANE_CONSTRAINTS.MAX_ROWS, Math.round(rows))),
  };
}

/**
 * Convert a database row to a Pane object
 */
export function rowToPane(row: {
  id: string;
  window_id: string;
  shell: string;
  cwd: string | null;
  cols: number;
  rows: number;
  connection_state: string;
  exit_code: number | null;
  created_at: number;
  title: string;
  marked: number;
}): Pane {
  return {
    id: row.id,
    windowId: row.window_id,
    shell: row.shell as ShellType,
    cwd: row.cwd,
    cols: row.cols,
    rows: row.rows,
    connectionState: row.connection_state as ConnectionState,
    exitCode: row.exit_code,
    createdAt: row.created_at,
    title: row.title ?? '',
    marked: Boolean(row.marked),
    currentCommand: null,
  };
}

/**
 * Convert a Pane object to database row format
 */
export function paneToRow(pane: Pane): {
  id: string;
  window_id: string;
  shell: string;
  cwd: string | null;
  cols: number;
  rows: number;
  connection_state: string;
  exit_code: number | null;
  created_at: number;
} {
  return {
    id: pane.id,
    window_id: pane.windowId,
    shell: pane.shell,
    cwd: pane.cwd,
    cols: pane.cols,
    rows: pane.rows,
    connection_state: pane.connectionState,
    exit_code: pane.exitCode,
    created_at: pane.createdAt,
  };
}
