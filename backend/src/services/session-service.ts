/**
 * Session CRUD and persistence service
 * Handles session lifecycle and database operations
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase, transaction } from '../db/database.js';
import { ptyManager } from './pty-service.js';
import { createLeafLayout, serializeLayout, parseLayout } from './layout-service.js';
import { logger } from '../utils/logger.js';
import type { 
  Session, 
  SessionWithWindows, 
  Window, 
  WindowWithPanes, 
  Pane, 
  Layout,
  SessionListItem,
  ShellType 
} from '../../../shared/types/models.js';

/** Session creation options */
export interface CreateSessionOptions {
  name: string;
  shell?: ShellType;
  cwd?: string;
}

/** Row types from database */
interface SessionRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  active_window_id: string | null;
  last_window_id: string | null;
}

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
 * Session Service - manages session CRUD operations
 */
export class SessionService {
  /**
   * Create a new session with an initial window and pane
   */
  createSession(options: CreateSessionOptions): SessionWithWindows {
    const { name: requestedName, shell = 'default', cwd } = options;

    const db = getDatabase();
    const now = Date.now();

    // Ensure unique name — append counter if name already exists
    let name = requestedName;
    const existing = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE name = ?').get(name) as { count: number };
    if (existing.count > 0) {
      const total = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE name LIKE ?').get(`${requestedName}%`) as { count: number };
      name = `${requestedName} ${total.count + 1}`;
    }

    const sessionId = uuidv4();
    const windowId = uuidv4();
    const paneId = uuidv4();

    logger.info(`Creating session: ${name} (${sessionId})`);

    const initialLayout = createLeafLayout(paneId);

    return transaction(() => {
      // Create session (without active_window_id to avoid FK cycle)
      db.prepare(`
        INSERT INTO sessions (id, name, created_at, updated_at, active_window_id)
        VALUES (?, ?, ?, ?, NULL)
      `).run(sessionId, name, now, now);

      // Create initial window
      db.prepare(`
        INSERT INTO windows (id, session_id, name, idx, layout, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(windowId, sessionId, 'Window 1', 0, serializeLayout(initialLayout), now);

      // Now set active window (window exists, FK satisfied)
      db.prepare(`UPDATE sessions SET active_window_id = ? WHERE id = ?`).run(windowId, sessionId);

      // Create initial pane
      db.prepare(`
        INSERT INTO panes (id, window_id, shell, cwd, cols, rows, connection_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(paneId, windowId, shell, cwd ?? null, 80, 24, 'disconnected', now);

      // Build the return object
      const pane: Pane = {
        id: paneId,
        windowId,
        shell: shell as ShellType,
        cwd: cwd ?? null,
        cols: 80,
        rows: 24,
        connectionState: 'disconnected',
        exitCode: null,
        createdAt: now,
        title: '',
        marked: false,
        currentCommand: null,
      };

      const window: WindowWithPanes = {
        id: windowId,
        sessionId,
        name: 'Window 1',
        index: 0,
        layout: initialLayout,
        panes: [pane],
        createdAt: now,
        autoRename: true,
        lastActiveAt: now,
        monitorActivity: false,
        monitorSilence: 0,
        monitorBell: true,
        activityFlag: false,
        bellFlag: false,
        silenceFlag: false,
      };

      const session: SessionWithWindows = {
        id: sessionId,
        name,
        createdAt: now,
        updatedAt: now,
        activeWindowId: windowId,
        lastWindowId: null,
        windows: [window],
      };

      return session;
    });
  }

  /**
   * Get a session by ID with all windows and panes
   */
  getSession(id: string): SessionWithWindows | null {
    const db = getDatabase();

    const sessionRow = db.prepare(`
      SELECT id, name, created_at, updated_at, active_window_id, last_window_id
      FROM sessions WHERE id = ?
    `).get(id) as SessionRow | undefined;

    if (!sessionRow) {
      return null;
    }

    const windowRows = db.prepare(`
      SELECT id, session_id, name, idx, layout, created_at,
             auto_rename, last_active_at, monitor_activity, monitor_silence, monitor_bell
      FROM windows WHERE session_id = ? ORDER BY idx
    `).all(id) as WindowRow[];

    const windows: WindowWithPanes[] = windowRows.map((windowRow) => {
      const paneRows = db.prepare(`
        SELECT id, window_id, shell, cwd, cols, rows, connection_state, exit_code, created_at,
               title, marked
        FROM panes WHERE window_id = ?
      `).all(windowRow.id) as PaneRow[];

      const panes: Pane[] = paneRows.map((paneRow) => ({
        id: paneRow.id,
        windowId: paneRow.window_id,
        shell: paneRow.shell as ShellType,
        cwd: paneRow.cwd,
        cols: paneRow.cols,
        rows: paneRow.rows,
        connectionState: paneRow.connection_state as Pane['connectionState'],
        exitCode: paneRow.exit_code,
        createdAt: paneRow.created_at,
        title: paneRow.title ?? '',
        marked: Boolean(paneRow.marked),
        currentCommand: null,
      }));

      return {
        id: windowRow.id,
        sessionId: windowRow.session_id,
        name: windowRow.name,
        index: windowRow.idx,
        layout: parseLayout(windowRow.layout) ?? createLeafLayout(panes[0]?.id ?? ''),
        panes,
        createdAt: windowRow.created_at,
        autoRename: Boolean(windowRow.auto_rename ?? 1),
        lastActiveAt: windowRow.last_active_at ?? null,
        monitorActivity: Boolean(windowRow.monitor_activity),
        monitorSilence: windowRow.monitor_silence ?? 0,
        monitorBell: Boolean(windowRow.monitor_bell ?? 1),
        activityFlag: false,
        bellFlag: false,
        silenceFlag: false,
      };
    });

    return {
      id: sessionRow.id,
      name: sessionRow.name,
      createdAt: sessionRow.created_at,
      updatedAt: sessionRow.updated_at,
      activeWindowId: sessionRow.active_window_id,
      lastWindowId: sessionRow.last_window_id ?? null,
      windows,
    };
  }

  /**
   * Get all sessions (summary list)
   */
  getAllSessions(): SessionListItem[] {
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
   * Update session properties
   */
  updateSession(id: string, data: Partial<Pick<Session, 'name' | 'activeWindowId'>>): boolean {
    const db = getDatabase();
    const now = Date.now();

    const updates: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [now];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (data.activeWindowId !== undefined) {
      updates.push('active_window_id = ?');
      values.push(data.activeWindowId);
    }

    values.push(id);

    const result = db.prepare(`
      UPDATE sessions SET ${updates.join(', ')} WHERE id = ?
    `).run(...values);

    return result.changes > 0;
  }

  /**
   * Delete a session and all associated data
   */
  deleteSession(id: string): boolean {
    const db = getDatabase();

    // First, kill all PTYs for this session
    const session = this.getSession(id);
    if (session) {
      for (const window of session.windows) {
        for (const pane of window.panes) {
          if (ptyManager.hasPty(pane.id)) {
            ptyManager.kill(pane.id);
          }
        }
      }
    }

    logger.info(`Deleting session: ${id}`);

    // Delete cascades to windows and panes via foreign keys
    const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Save current session state (layout) to database
   */
  saveSession(id: string): boolean {
    const db = getDatabase();
    const now = Date.now();

    const result = db.prepare(`
      UPDATE sessions SET updated_at = ? WHERE id = ?
    `).run(now, id);

    logger.info(`Session ${id} saved at ${now}`);
    return result.changes > 0;
  }

  /**
   * Restore a session and spawn PTYs for all panes
   */
  restoreSession(id: string): SessionWithWindows | null {
    const session = this.getSession(id);
    
    if (!session) {
      logger.warn(`Cannot restore non-existent session: ${id}`);
      return null;
    }

    logger.info(`Restoring session: ${session.name} (${id})`);

    // Spawn PTYs for all panes
    for (const window of session.windows) {
      for (const pane of window.panes) {
        if (!ptyManager.hasPty(pane.id)) {
          const spawnOptions: { shell: typeof pane.shell; cwd?: string; cols: number; rows: number } = {
            shell: pane.shell,
            cols: pane.cols,
            rows: pane.rows,
          };
          if (pane.cwd !== null) {
            spawnOptions.cwd = pane.cwd;
          }
          ptyManager.spawn(pane.id, spawnOptions);

          // Update connection state
          this.updatePaneConnectionState(pane.id, 'connected');
        }
      }
    }

    // Return the restored session
    return this.getSession(id);
  }

  /**
   * Update a pane's connection state
   */
  updatePaneConnectionState(paneId: string, state: Pane['connectionState'], exitCode?: number): boolean {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE panes SET connection_state = ?, exit_code = ? WHERE id = ?
    `).run(state, exitCode ?? null, paneId);

    return result.changes > 0;
  }

  /**
   * Create a new window in a session
   */
  createWindow(sessionId: string, name: string, shell: ShellType = 'default', cwd?: string): WindowWithPanes | null {
    const db = getDatabase();
    const now = Date.now();

    const windowId = uuidv4();
    const paneId = uuidv4();

    // Get next window index
    const maxIdx = db.prepare(`
      SELECT COALESCE(MAX(idx), -1) as max_idx FROM windows WHERE session_id = ?
    `).get(sessionId) as { max_idx: number };

    const newIndex = maxIdx.max_idx + 1;

    return transaction(() => {
      const layout = createLeafLayout(paneId);

      // Create window
      db.prepare(`
        INSERT INTO windows (id, session_id, name, idx, layout, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(windowId, sessionId, name, newIndex, serializeLayout(layout), now);

      // Create initial pane
      db.prepare(`
        INSERT INTO panes (id, window_id, shell, cwd, cols, rows, connection_state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(paneId, windowId, shell, cwd ?? null, 80, 24, 'disconnected', now);

      // Update session's active window
      db.prepare(`
        UPDATE sessions SET active_window_id = ?, updated_at = ? WHERE id = ?
      `).run(windowId, now, sessionId);

      const pane: Pane = {
        id: paneId,
        windowId,
        shell,
        cwd: cwd ?? null,
        cols: 80,
        rows: 24,
        connectionState: 'disconnected',
        exitCode: null,
        createdAt: now,
        title: '',
        marked: false,
        currentCommand: null,
      };

      return {
        id: windowId,
        sessionId,
        name,
        index: newIndex,
        layout,
        panes: [pane],
        createdAt: now,
        autoRename: true,
        lastActiveAt: now,
        monitorActivity: false,
        monitorSilence: 0,
        monitorBell: true,
        activityFlag: false,
        bellFlag: false,
        silenceFlag: false,
      };
    });
  }

  /**
   * Delete a window
   */
  deleteWindow(windowId: string): boolean {
    const db = getDatabase();

    // Get panes to kill PTYs
    const panes = db.prepare(`
      SELECT id FROM panes WHERE window_id = ?
    `).all(windowId) as Array<{ id: string }>;

    for (const pane of panes) {
      if (ptyManager.hasPty(pane.id)) {
        ptyManager.kill(pane.id);
      }
    }

    logger.info(`Deleting window: ${windowId}`);

    const result = db.prepare('DELETE FROM windows WHERE id = ?').run(windowId);
    return result.changes > 0;
  }

  /**
   * Update window layout
   */
  updateWindowLayout(windowId: string, layout: Layout): boolean {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE windows SET layout = ? WHERE id = ?
    `).run(serializeLayout(layout), windowId);

    return result.changes > 0;
  }

  /**
   * Create a new pane in a window
   */
  createPane(windowId: string, shell: ShellType = 'default', cwd?: string, cols = 80, rows = 24): Pane | null {
    const db = getDatabase();
    const now = Date.now();
    const paneId = uuidv4();

    db.prepare(`
      INSERT INTO panes (id, window_id, shell, cwd, cols, rows, connection_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(paneId, windowId, shell, cwd ?? null, cols, rows, 'disconnected', now);

    return {
      id: paneId,
      windowId,
      shell,
      cwd: cwd ?? null,
      cols,
      rows,
      connectionState: 'disconnected',
      exitCode: null,
      createdAt: now,
      title: '',
      marked: false,
      currentCommand: null,
    };
  }

  /**
   * Delete a pane
   */
  deletePane(paneId: string): boolean {
    const db = getDatabase();

    // Kill PTY if active
    if (ptyManager.hasPty(paneId)) {
      ptyManager.kill(paneId);
    }

    logger.info(`Deleting pane: ${paneId}`);

    const result = db.prepare('DELETE FROM panes WHERE id = ?').run(paneId);
    return result.changes > 0;
  }

  /**
   * Get a pane by ID
   */
  getPane(paneId: string): Pane | null {
    const db = getDatabase();

    const row = db.prepare(`
      SELECT id, window_id, shell, cwd, cols, rows, connection_state, exit_code, created_at,
             title, marked
      FROM panes WHERE id = ?
    `).get(paneId) as PaneRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      windowId: row.window_id,
      shell: row.shell as ShellType,
      cwd: row.cwd,
      cols: row.cols,
      rows: row.rows,
      connectionState: row.connection_state as Pane['connectionState'],
      exitCode: row.exit_code,
      createdAt: row.created_at,
      title: row.title ?? '',
      marked: Boolean(row.marked),
      currentCommand: null,
    };
  }

  /**
   * Update pane dimensions
   */
  updatePaneSize(paneId: string, cols: number, rows: number): boolean {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE panes SET cols = ?, rows = ? WHERE id = ?
    `).run(cols, rows, paneId);

    return result.changes > 0;
  }

  /**
   * Get a window by ID with layout and panes
   */
  getWindow(windowId: string): WindowWithPanes | null {
    const db = getDatabase();

    const windowRow = db.prepare(`
      SELECT id, session_id, name, idx, layout, created_at,
             auto_rename, last_active_at, monitor_activity, monitor_silence, monitor_bell
      FROM windows WHERE id = ?
    `).get(windowId) as WindowRow | undefined;

    if (!windowRow) {
      return null;
    }

    const paneRows = db.prepare(`
      SELECT id, window_id, shell, cwd, cols, rows, connection_state, exit_code, created_at,
             title, marked
      FROM panes WHERE window_id = ?
    `).all(windowId) as PaneRow[];

    const panes: Pane[] = paneRows.map((paneRow) => ({
      id: paneRow.id,
      windowId: paneRow.window_id,
      shell: paneRow.shell as ShellType,
      cwd: paneRow.cwd,
      cols: paneRow.cols,
      rows: paneRow.rows,
      connectionState: paneRow.connection_state as Pane['connectionState'],
      exitCode: paneRow.exit_code,
      createdAt: paneRow.created_at,
      title: paneRow.title ?? '',
      marked: Boolean(paneRow.marked),
      currentCommand: null,
    }));

    return {
      id: windowRow.id,
      sessionId: windowRow.session_id,
      name: windowRow.name,
      index: windowRow.idx,
      layout: parseLayout(windowRow.layout) ?? createLeafLayout(panes[0]?.id ?? ''),
      panes,
      createdAt: windowRow.created_at,
      autoRename: Boolean(windowRow.auto_rename ?? 1),
      lastActiveAt: windowRow.last_active_at ?? null,
      monitorActivity: Boolean(windowRow.monitor_activity),
      monitorSilence: windowRow.monitor_silence ?? 0,
      monitorBell: Boolean(windowRow.monitor_bell ?? 1),
      activityFlag: false,
      bellFlag: false,
      silenceFlag: false,
    };
  }

  /**
   * Update pane marked status
   */
  updatePaneMarked(paneId: string, marked: boolean): boolean {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE panes SET marked = ? WHERE id = ?
    `).run(marked ? 1 : 0, paneId);

    return result.changes > 0;
  }

  /**
   * Move a pane record to a different window (update its window_id in the DB)
   */
  movePaneToWindow(paneId: string, targetWindowId: string): boolean {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE panes SET window_id = ? WHERE id = ?
    `).run(targetWindowId, paneId);

    return result.changes > 0;
  }

  /**
   * Rename a window
   */
  renameWindow(windowId: string, name: string): boolean {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE windows SET name = ? WHERE id = ?
    `).run(name, windowId);

    return result.changes > 0;
  }

  /**
   * Swap the indices of two windows
   */
  swapWindowIndices(windowId1: string, windowId2: string): boolean {
    const db = getDatabase();

    const row1 = db.prepare('SELECT idx FROM windows WHERE id = ?').get(windowId1) as { idx: number } | undefined;
    const row2 = db.prepare('SELECT idx FROM windows WHERE id = ?').get(windowId2) as { idx: number } | undefined;

    if (!row1 || !row2) {
      return false;
    }

    return transaction(() => {
      // Use a temporary index to avoid unique constraint conflicts
      db.prepare('UPDATE windows SET idx = -1 WHERE id = ?').run(windowId1);
      db.prepare('UPDATE windows SET idx = ? WHERE id = ?').run(row1.idx, windowId2);
      db.prepare('UPDATE windows SET idx = ? WHERE id = ?').run(row2.idx, windowId1);
      return true;
    });
  }

  /**
   * Move a window to a specific index position
   */
  moveWindowToIndex(windowId: string, targetIndex: number): boolean {
    const db = getDatabase();

    const result = db.prepare(`
      UPDATE windows SET idx = ? WHERE id = ?
    `).run(targetIndex, windowId);

    return result.changes > 0;
  }

  /**
   * Check if a session name already exists
   */
  sessionNameExists(name: string, excludeId?: string): boolean {
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
}

/** Singleton instance */
export const sessionService = new SessionService();
