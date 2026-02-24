/**
 * Window model
 * Represents a logical grouping of panes within a session
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
import { createLeafLayout, serializeLayout, parseLayout } from '../services/layout-service.js';
import type { Window, WindowWithPanes, Pane, Layout, ShellType } from '../../../shared/types/models.js';
import { rowToPane } from './pane.js';

/** Window name constraints */
export const WINDOW_CONSTRAINTS = {
  MAX_NAME_LENGTH: 50,
  MIN_NAME_LENGTH: 1,
};

/** Window creation options */
export interface CreateWindowOptions {
  sessionId: string;
  name: string;
  index?: number;
}

/** Window validation result */
export interface WindowValidationResult {
  valid: boolean;
  errors: string[];
}

/** Database row type */
interface WindowRow {
  id: string;
  session_id: string;
  name: string;
  idx: number;
  layout: string;
  created_at: number;
  auto_rename: number;
  last_active_at: number | null;
  monitor_activity: number;
  monitor_silence: number;
  monitor_bell: number;
}

interface PaneRow {
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
}

/**
 * Create a new window record
 */
export function createWindow(options: CreateWindowOptions, initialPaneId?: string): Window {
  const { sessionId, name, index = 0 } = options;

  const windowId = uuidv4();
  const paneId = initialPaneId ?? uuidv4();
  const layout = createLeafLayout(paneId);

  return {
    id: windowId,
    sessionId,
    name: name.substring(0, WINDOW_CONSTRAINTS.MAX_NAME_LENGTH),
    index,
    createdAt: Date.now(),
    autoRename: true,
    lastActiveAt: null,
    monitorActivity: false,
    monitorSilence: 0,
    monitorBell: true,
    activityFlag: false,
    bellFlag: false,
    silenceFlag: false,
  };
}

/**
 * Validate window name
 */
export function validateWindowName(name: string): WindowValidationResult {
  const errors: string[] = [];

  if (!name || typeof name !== 'string') {
    errors.push('name is required and must be a string');
  } else if (name.length < WINDOW_CONSTRAINTS.MIN_NAME_LENGTH) {
    errors.push(`name must be at least ${WINDOW_CONSTRAINTS.MIN_NAME_LENGTH} character(s)`);
  } else if (name.length > WINDOW_CONSTRAINTS.MAX_NAME_LENGTH) {
    errors.push(`name must be at most ${WINDOW_CONSTRAINTS.MAX_NAME_LENGTH} characters`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a window object
 */
export function validateWindow(window: Partial<Window>): WindowValidationResult {
  const errors: string[] = [];

  if (!window.id || typeof window.id !== 'string') {
    errors.push('id is required and must be a string');
  }

  if (!window.sessionId || typeof window.sessionId !== 'string') {
    errors.push('sessionId is required and must be a string');
  }

  if (window.name !== undefined) {
    const nameValidation = validateWindowName(window.name);
    errors.push(...nameValidation.errors);
  }

  if (window.index !== undefined) {
    if (!Number.isInteger(window.index) || window.index < 0) {
      errors.push('index must be a non-negative integer');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get a window by ID
 */
export function getWindowById(windowId: string): WindowWithPanes | null {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT id, session_id, name, idx, layout, created_at,
           auto_rename, last_active_at, monitor_activity, monitor_silence, monitor_bell
    FROM windows WHERE id = ?
  `).get(windowId) as WindowRow | undefined;

  if (!row) {
    return null;
  }

  return rowToWindowWithPanes(row);
}

/**
 * Get all windows for a session
 */
export function getWindowsBySessionId(sessionId: string): WindowWithPanes[] {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT id, session_id, name, idx, layout, created_at,
           auto_rename, last_active_at, monitor_activity, monitor_silence, monitor_bell
    FROM windows WHERE session_id = ? ORDER BY idx
  `).all(sessionId) as WindowRow[];

  return rows.map(rowToWindowWithPanes);
}

/**
 * Insert a window into the database
 */
export function insertWindow(
  sessionId: string,
  name: string,
  layout: Layout,
  index?: number
): Window {
  const db = getDatabase();
  const now = Date.now();
  const windowId = uuidv4();

  // Get next index if not provided
  let idx = index;
  if (idx === undefined) {
    const maxIdx = db.prepare(`
      SELECT COALESCE(MAX(idx), -1) as max_idx FROM windows WHERE session_id = ?
    `).get(sessionId) as { max_idx: number };
    idx = maxIdx.max_idx + 1;
  }

  db.prepare(`
    INSERT INTO windows (id, session_id, name, idx, layout, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(windowId, sessionId, name, idx, serializeLayout(layout), now);

  return {
    id: windowId,
    sessionId,
    name,
    index: idx,
    createdAt: now,
    autoRename: true,
    lastActiveAt: null,
    monitorActivity: false,
    monitorSilence: 0,
    monitorBell: true,
    activityFlag: false,
    bellFlag: false,
    silenceFlag: false,
  };
}

/**
 * Update a window
 */
export function updateWindow(
  windowId: string,
  data: Partial<Pick<Window, 'name' | 'index'>>
): boolean {
  const db = getDatabase();

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name.substring(0, WINDOW_CONSTRAINTS.MAX_NAME_LENGTH));
  }

  if (data.index !== undefined) {
    updates.push('idx = ?');
    values.push(data.index);
  }

  if (updates.length === 0) {
    return false;
  }

  values.push(windowId);

  const result = db.prepare(`
    UPDATE windows SET ${updates.join(', ')} WHERE id = ?
  `).run(...values);

  return result.changes > 0;
}

/**
 * Update window layout
 */
export function updateWindowLayout(windowId: string, layout: Layout): boolean {
  const db = getDatabase();

  const result = db.prepare(`
    UPDATE windows SET layout = ? WHERE id = ?
  `).run(serializeLayout(layout), windowId);

  return result.changes > 0;
}

/**
 * Delete a window
 */
export function deleteWindow(windowId: string): boolean {
  const db = getDatabase();

  const result = db.prepare('DELETE FROM windows WHERE id = ?').run(windowId);
  return result.changes > 0;
}

/**
 * Reindex windows in a session after deletion
 */
export function reindexWindows(sessionId: string): void {
  const db = getDatabase();

  const windows = db.prepare(`
    SELECT id FROM windows WHERE session_id = ? ORDER BY idx
  `).all(sessionId) as Array<{ id: string }>;

  const updateStmt = db.prepare('UPDATE windows SET idx = ? WHERE id = ?');

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i];
    if (window) {
      updateStmt.run(i, window.id);
    }
  }
}

/**
 * Get the maximum window index for a session
 */
export function getMaxWindowIndex(sessionId: string): number {
  const db = getDatabase();

  const result = db.prepare(`
    SELECT COALESCE(MAX(idx), -1) as max_idx FROM windows WHERE session_id = ?
  `).get(sessionId) as { max_idx: number };

  return result.max_idx;
}

/**
 * Check if a window exists
 */
export function windowExists(windowId: string): boolean {
  const db = getDatabase();

  const result = db.prepare('SELECT 1 FROM windows WHERE id = ?').get(windowId);
  return result !== undefined;
}

/**
 * Count windows in a session
 */
export function countWindowsInSession(sessionId: string): number {
  const db = getDatabase();

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM windows WHERE session_id = ?
  `).get(sessionId) as { count: number };

  return result.count;
}

/**
 * Convert a database row to a Window object
 */
export function rowToWindow(row: WindowRow): Window {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    index: row.idx,
    createdAt: row.created_at,
    autoRename: Boolean(row.auto_rename ?? 1),
    lastActiveAt: row.last_active_at ?? null,
    monitorActivity: Boolean(row.monitor_activity),
    monitorSilence: row.monitor_silence ?? 0,
    monitorBell: Boolean(row.monitor_bell ?? 1),
    activityFlag: false,
    bellFlag: false,
    silenceFlag: false,
  };
}

/**
 * Convert a database row to a WindowWithPanes object
 */
export function rowToWindowWithPanes(row: WindowRow): WindowWithPanes {
  const db = getDatabase();

  const paneRows = db.prepare(`
    SELECT id, window_id, shell, cwd, cols, rows, connection_state, exit_code, created_at,
           title, marked
    FROM panes WHERE window_id = ?
  `).all(row.id) as PaneRow[];

  const panes: Pane[] = paneRows.map(rowToPane);
  const layout = parseLayout(row.layout) ?? createLeafLayout(panes[0]?.id ?? '');

  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    index: row.idx,
    layout,
    panes,
    createdAt: row.created_at,
    autoRename: Boolean(row.auto_rename ?? 1),
    lastActiveAt: row.last_active_at ?? null,
    monitorActivity: Boolean(row.monitor_activity),
    monitorSilence: row.monitor_silence ?? 0,
    monitorBell: Boolean(row.monitor_bell ?? 1),
    activityFlag: false,
    bellFlag: false,
    silenceFlag: false,
  };
}
