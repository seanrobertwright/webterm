/**
 * Session model
 * Represents a user's workspace containing multiple windows
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
import type { Session, SessionWithWindows, SessionListItem } from '../../../shared/types/models.js';
import { rowToWindowWithPanes } from './window.js';

/** Session name constraints */
export const SESSION_CONSTRAINTS = {
  MAX_NAME_LENGTH: 100,
  MIN_NAME_LENGTH: 1,
};

/** Session creation options */
export interface CreateSessionOptions {
  name: string;
}

/** Session validation result */
export interface SessionValidationResult {
  valid: boolean;
  errors: string[];
}

/** Database row type */
interface SessionRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  active_window_id: string | null;
}

interface WindowRow {
  id: string;
  session_id: string;
  name: string;
  idx: number;
  layout: string;
  created_at: number;
}

/**
 * Create a new session object (in-memory, not persisted)
 */
export function createSession(options: CreateSessionOptions): Session {
  const { name } = options;
  const now = Date.now();

  return {
    id: uuidv4(),
    name: name.substring(0, SESSION_CONSTRAINTS.MAX_NAME_LENGTH),
    createdAt: now,
    updatedAt: now,
    activeWindowId: null,
  };
}

/**
 * Validate session name
 */
export function validateSessionName(name: string): SessionValidationResult {
  const errors: string[] = [];

  if (!name || typeof name !== 'string') {
    errors.push('name is required and must be a string');
  } else if (name.length < SESSION_CONSTRAINTS.MIN_NAME_LENGTH) {
    errors.push(`name must be at least ${SESSION_CONSTRAINTS.MIN_NAME_LENGTH} character(s)`);
  } else if (name.length > SESSION_CONSTRAINTS.MAX_NAME_LENGTH) {
    errors.push(`name must be at most ${SESSION_CONSTRAINTS.MAX_NAME_LENGTH} characters`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a session object
 */
export function validateSession(session: Partial<Session>): SessionValidationResult {
  const errors: string[] = [];

  if (!session.id || typeof session.id !== 'string') {
    errors.push('id is required and must be a string');
  }

  if (session.name !== undefined) {
    const nameValidation = validateSessionName(session.name);
    errors.push(...nameValidation.errors);
  }

  if (session.activeWindowId !== undefined && session.activeWindowId !== null && typeof session.activeWindowId !== 'string') {
    errors.push('activeWindowId must be a string or null');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get a session by ID
 */
export function getSessionById(sessionId: string): Session | null {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT id, name, created_at, updated_at, active_window_id
    FROM sessions WHERE id = ?
  `).get(sessionId) as SessionRow | undefined;

  if (!row) {
    return null;
  }

  return rowToSession(row);
}

/**
 * Get a session with all windows and panes
 */
export function getSessionWithWindows(sessionId: string): SessionWithWindows | null {
  const db = getDatabase();

  const sessionRow = db.prepare(`
    SELECT id, name, created_at, updated_at, active_window_id
    FROM sessions WHERE id = ?
  `).get(sessionId) as SessionRow | undefined;

  if (!sessionRow) {
    return null;
  }

  const windowRows = db.prepare(`
    SELECT id, session_id, name, idx, layout, created_at
    FROM windows WHERE session_id = ? ORDER BY idx
  `).all(sessionId) as WindowRow[];

  const windows = windowRows.map(rowToWindowWithPanes);

  return {
    id: sessionRow.id,
    name: sessionRow.name,
    createdAt: sessionRow.created_at,
    updatedAt: sessionRow.updated_at,
    activeWindowId: sessionRow.active_window_id,
    windows,
  };
}

/**
 * Get all sessions as summary items
 */
export function getAllSessions(): SessionListItem[] {
  const db = getDatabase();

  const rows = db.prepare(`
    SELECT 
      s.id,
      s.name,
      s.created_at,
      s.updated_at,
      COUNT(DISTINCT w.id) as window_count,
      COUNT(DISTINCT p.id) as pane_count
    FROM sessions s
    LEFT JOIN windows w ON w.session_id = s.id
    LEFT JOIN panes p ON p.window_id = w.id
    GROUP BY s.id
    ORDER BY s.updated_at DESC
  `).all() as Array<{
    id: string;
    name: string;
    created_at: number;
    updated_at: number;
    window_count: number;
    pane_count: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    windowCount: row.window_count,
    paneCount: row.pane_count,
  }));
}

/**
 * Insert a session into the database
 */
export function insertSession(name: string): Session {
  const db = getDatabase();
  const now = Date.now();
  const sessionId = uuidv4();

  db.prepare(`
    INSERT INTO sessions (id, name, created_at, updated_at, active_window_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, name, now, now, null);

  return {
    id: sessionId,
    name,
    createdAt: now,
    updatedAt: now,
    activeWindowId: null,
  };
}

/**
 * Update a session
 */
export function updateSession(
  sessionId: string,
  data: Partial<Pick<Session, 'name' | 'activeWindowId'>>
): boolean {
  const db = getDatabase();
  const now = Date.now();

  const updates: string[] = ['updated_at = ?'];
  const values: (string | number | null)[] = [now];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name.substring(0, SESSION_CONSTRAINTS.MAX_NAME_LENGTH));
  }

  if (data.activeWindowId !== undefined) {
    updates.push('active_window_id = ?');
    values.push(data.activeWindowId);
  }

  values.push(sessionId);

  const result = db.prepare(`
    UPDATE sessions SET ${updates.join(', ')} WHERE id = ?
  `).run(...values);

  return result.changes > 0;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const db = getDatabase();

  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  return result.changes > 0;
}

/**
 * Check if a session name exists
 */
export function sessionNameExists(name: string, excludeId?: string): boolean {
  const db = getDatabase();

  let query = 'SELECT 1 FROM sessions WHERE name = ?';
  const params: string[] = [name];

  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  const result = db.prepare(query).get(...params);
  return result !== undefined;
}

/**
 * Check if a session exists
 */
export function sessionExists(sessionId: string): boolean {
  const db = getDatabase();

  const result = db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(sessionId);
  return result !== undefined;
}

/**
 * Touch session (update updated_at timestamp)
 */
export function touchSession(sessionId: string): boolean {
  const db = getDatabase();
  const now = Date.now();

  const result = db.prepare(`
    UPDATE sessions SET updated_at = ? WHERE id = ?
  `).run(now, sessionId);

  return result.changes > 0;
}

/**
 * Get the count of sessions
 */
export function getSessionCount(): number {
  const db = getDatabase();

  const result = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  return result.count;
}

/**
 * Convert a database row to a Session object
 */
export function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activeWindowId: row.active_window_id,
  };
}

/**
 * Convert a Session object to database row format
 */
export function sessionToRow(session: Session): SessionRow {
  return {
    id: session.id,
    name: session.name,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    active_window_id: session.activeWindowId,
  };
}
