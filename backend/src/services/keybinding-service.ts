/**
 * Key binding management service
 *
 * Manages tmux-compatible key bindings with default + custom layering.
 * Default bindings are defined in code constants; user customizations are
 * persisted to SQLite. When queried, the service merges the two layers
 * with DB records taking precedence over defaults.
 *
 * An "unbound" entry (DB record with empty command) removes a default
 * binding, allowing users to unbind built-in keys.
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { logger } from '../utils/logger.js';
import type { KeyBinding } from '../../../shared/types/models.js';

// ============================================================================
// DB row shape
// ============================================================================

interface KeyBindingRow {
  id: string;
  key_table: string;
  key: string;
  command: string;
  created_at: number;
}

// ============================================================================
// Sentinel for "unbound" entries
// ============================================================================

/**
 * When a user unbinds a default key, we store this sentinel as the command
 * so we can distinguish "user explicitly removed this" from "not customized".
 */
const UNBOUND_SENTINEL = '__UNBOUND__';

// ============================================================================
// Default Bindings
// ============================================================================

/** Default bindings for the prefix table (keys pressed after the prefix key). */
const PREFIX_DEFAULTS: ReadonlyArray<{ key: string; command: string }> = [
  // Splitting
  { key: '%', command: 'split-window -h' },
  { key: '"', command: 'split-window -v' },

  // Pane navigation
  { key: 'Left', command: 'select-pane -L' },
  { key: 'Right', command: 'select-pane -R' },
  { key: 'Up', command: 'select-pane -U' },
  { key: 'Down', command: 'select-pane -D' },

  // Pane operations
  { key: 'x', command: 'kill-pane' },
  { key: 'z', command: 'resize-pane -Z' },
  { key: '{', command: 'swap-pane -U' },
  { key: '}', command: 'swap-pane -D' },
  { key: '!', command: 'break-pane' },
  { key: 'o', command: 'select-pane -t :.+' },
  { key: ';', command: 'select-pane -t :.-' },
  { key: 'q', command: 'display-panes' },

  // Window operations
  { key: 'c', command: 'new-window' },
  { key: 'n', command: 'next-window' },
  { key: 'p', command: 'previous-window' },
  { key: 'l', command: 'last-window' },
  { key: ',', command: "command-prompt \"rename-window '%%'\"" },
  { key: '.', command: "command-prompt \"move-window -t '%%'\"" },
  { key: '&', command: 'kill-window' },

  // Window selection by index
  { key: '0', command: 'select-window -t :0' },
  { key: '1', command: 'select-window -t :1' },
  { key: '2', command: 'select-window -t :2' },
  { key: '3', command: 'select-window -t :3' },
  { key: '4', command: 'select-window -t :4' },
  { key: '5', command: 'select-window -t :5' },
  { key: '6', command: 'select-window -t :6' },
  { key: '7', command: 'select-window -t :7' },
  { key: '8', command: 'select-window -t :8' },
  { key: '9', command: 'select-window -t :9' },

  // Session/tree
  { key: 'd', command: 'detach-client' },
  { key: 's', command: 'choose-tree -s' },
  { key: 'w', command: 'choose-tree -w' },

  // Copy/paste
  { key: '[', command: 'copy-mode' },
  { key: ']', command: 'paste-buffer' },
  { key: '=', command: 'choose-buffer' },

  // Misc
  { key: '?', command: 'list-keys' },
  { key: ':', command: 'command-prompt' },
  { key: 'Space', command: 'next-layout' },
  { key: 't', command: 'clock-mode' },
  { key: 'i', command: 'display-message' },
  { key: 'C-o', command: 'rotate-window' },

  // Layout presets (M- = Meta/Alt)
  { key: 'M-1', command: 'select-layout even-horizontal' },
  { key: 'M-2', command: 'select-layout even-vertical' },
  { key: 'M-3', command: 'select-layout main-horizontal' },
  { key: 'M-4', command: 'select-layout main-vertical' },
  { key: 'M-5', command: 'select-layout tiled' },
];

/** Default bindings for the copy-mode-vi table. */
const COPY_MODE_VI_DEFAULTS: ReadonlyArray<{ key: string; command: string }> = [
  // Cursor movement
  { key: 'h', command: 'cursor left' },
  { key: 'j', command: 'cursor down' },
  { key: 'k', command: 'cursor up' },
  { key: 'l', command: 'cursor right' },

  // Word movement
  { key: 'w', command: 'next word' },
  { key: 'b', command: 'previous word' },
  { key: 'e', command: 'end of word' },

  // Line navigation
  { key: '0', command: 'start of line' },
  { key: '$', command: 'end of line' },

  // Buffer navigation
  { key: 'g', command: 'top of buffer' },
  { key: 'G', command: 'bottom of buffer' },

  // Selection
  { key: 'Space', command: 'begin selection' },
  { key: 'Enter', command: 'copy selection and cancel' },
  { key: 'v', command: 'toggle rectangle selection' },
  { key: 'V', command: 'select line' },

  // Search
  { key: '/', command: 'search forward' },
  { key: '?', command: 'search backward' },
  { key: 'n', command: 'next search match' },
  { key: 'N', command: 'previous search match' },

  // Cancel
  { key: 'q', command: 'cancel copy mode' },
  { key: 'Escape', command: 'cancel copy mode' },

  // Scrolling
  { key: 'C-u', command: 'half page up' },
  { key: 'C-d', command: 'half page down' },
  { key: 'C-b', command: 'page up' },
  { key: 'C-f', command: 'page down' },

  // Screen position
  { key: 'H', command: 'cursor to top visible' },
  { key: 'M', command: 'cursor to middle visible' },
  { key: 'L', command: 'cursor to bottom visible' },
];

/**
 * All default binding tables. Root table is empty by default -- users
 * can add bindings to it via `bind-key -n`.
 */
const DEFAULT_TABLES: ReadonlyMap<
  string,
  ReadonlyArray<{ key: string; command: string }>
> = new Map([
  ['prefix', PREFIX_DEFAULTS],
  ['copy-mode-vi', COPY_MODE_VI_DEFAULTS],
  ['root', []],
]);

// ============================================================================
// Helpers
// ============================================================================

/** Convert a DB row to a KeyBinding model object. */
function rowToBinding(row: KeyBindingRow, isDefault: boolean): KeyBinding {
  return {
    id: row.id,
    keyTable: row.key_table,
    key: row.key,
    command: row.command,
    isDefault,
    createdAt: row.created_at,
  };
}

/** Create a KeyBinding from a default entry. */
function defaultToBinding(keyTable: string, entry: { key: string; command: string }): KeyBinding {
  return {
    id: `default-${keyTable}-${entry.key}`,
    keyTable,
    key: entry.key,
    command: entry.command,
    isDefault: true,
    createdAt: 0,
  };
}

// ============================================================================
// KeyBindingService
// ============================================================================

/**
 * Manages key binding CRUD with default + custom layering.
 *
 * Defaults are defined as in-memory constants. User customizations (bind,
 * unbind) are persisted to the `key_bindings` SQLite table. When bindings
 * are queried, the two layers are merged: DB records override defaults,
 * and DB records with the UNBOUND sentinel suppress defaults.
 */
export class KeyBindingService {
  // --------------------------------------------------------------------------
  // Mutations
  // --------------------------------------------------------------------------

  /**
   * Bind a key in a table to a command.
   *
   * If an entry already exists for this (keyTable, key) pair it is replaced.
   */
  bind(keyTable: string, key: string, command: string): void {
    const db = getDatabase();
    const now = Date.now();

    db.prepare(
      `INSERT INTO key_bindings (id, key_table, key, command, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (key_table, key)
       DO UPDATE SET command = excluded.command, created_at = excluded.created_at`,
    ).run(randomUUID(), keyTable, key, command, now);

    logger.debug(`Key bound: ${keyTable} ${key} -> ${command}`);
  }

  /**
   * Unbind a key from a table.
   *
   * If the key is a default binding, we insert an UNBOUND sentinel so the
   * default is suppressed. If it is a custom-only binding, we delete the row.
   */
  unbind(keyTable: string, key: string): void {
    const defaults = DEFAULT_TABLES.get(keyTable);
    const isDefault = defaults?.some((d) => d.key === key) ?? false;

    if (isDefault) {
      // Store sentinel to suppress the default
      this.bind(keyTable, key, UNBOUND_SENTINEL);
      logger.debug(`Default key unbound via sentinel: ${keyTable} ${key}`);
    } else {
      // Just remove the custom row
      const db = getDatabase();
      const result = db.prepare(
        'DELETE FROM key_bindings WHERE key_table = ? AND key = ?',
      ).run(keyTable, key);

      if (result.changes > 0) {
        logger.debug(`Custom key unbound: ${keyTable} ${key}`);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  /**
   * Get all bindings for a specific key table, merging defaults with DB
   * overrides. DB entries take precedence; UNBOUND sentinels suppress
   * the default.
   */
  getByTable(keyTable: string): KeyBinding[] {
    const db = getDatabase();

    // Fetch all DB rows for this table
    const rows = db.prepare(
      'SELECT id, key_table, key, command, created_at FROM key_bindings WHERE key_table = ?',
    ).all(keyTable) as KeyBindingRow[];

    // Index DB rows by key for fast lookup
    const dbByKey = new Map<string, KeyBindingRow>();
    for (const row of rows) {
      dbByKey.set(row.key, row);
    }

    const results: KeyBinding[] = [];

    // Start with defaults for this table
    const defaults = DEFAULT_TABLES.get(keyTable);
    if (defaults) {
      for (const entry of defaults) {
        const dbRow = dbByKey.get(entry.key);
        if (dbRow) {
          // DB override exists
          if (dbRow.command !== UNBOUND_SENTINEL) {
            results.push(rowToBinding(dbRow, false));
          }
          // If sentinel, the default is suppressed -- don't add anything
          dbByKey.delete(entry.key);
        } else {
          // No DB override -- use the default
          results.push(defaultToBinding(keyTable, entry));
        }
      }
    }

    // Add any remaining DB rows that don't correspond to defaults
    // (user-added custom bindings for keys that have no default)
    for (const [, row] of dbByKey) {
      if (row.command !== UNBOUND_SENTINEL) {
        results.push(rowToBinding(row, false));
      }
    }

    return results;
  }

  /**
   * Get all bindings across all tables.
   *
   * Collects bindings from every known table (default + any custom tables
   * found in the DB).
   */
  getAll(): KeyBinding[] {
    const db = getDatabase();

    // Collect all table names: defaults + any in DB
    const tableNames = new Set<string>(DEFAULT_TABLES.keys());

    const dbTables = db.prepare(
      'SELECT DISTINCT key_table FROM key_bindings',
    ).all() as Array<{ key_table: string }>;

    for (const row of dbTables) {
      tableNames.add(row.key_table);
    }

    const results: KeyBinding[] = [];
    for (const table of tableNames) {
      results.push(...this.getByTable(table));
    }

    return results;
  }

  /**
   * Get a single binding by table and key.
   *
   * Returns null if the key is not bound (either never defined or explicitly
   * unbound).
   */
  getBinding(keyTable: string, key: string): KeyBinding | null {
    const db = getDatabase();

    // Check DB first
    const row = db.prepare(
      'SELECT id, key_table, key, command, created_at FROM key_bindings WHERE key_table = ? AND key = ?',
    ).get(keyTable, key) as KeyBindingRow | undefined;

    if (row) {
      // UNBOUND sentinel means the key is explicitly removed
      if (row.command === UNBOUND_SENTINEL) {
        return null;
      }
      return rowToBinding(row, false);
    }

    // Fall back to defaults
    const defaults = DEFAULT_TABLES.get(keyTable);
    if (defaults) {
      const entry = defaults.find((d) => d.key === key);
      if (entry) {
        return defaultToBinding(keyTable, entry);
      }
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Admin
  // --------------------------------------------------------------------------

  /**
   * Delete all custom bindings from the DB, reverting to defaults only.
   */
  reset(): void {
    const db = getDatabase();
    db.prepare('DELETE FROM key_bindings').run();
    logger.info('All custom key bindings cleared -- reverted to defaults');
  }
}

/** Singleton instance */
export const keybindingService = new KeyBindingService();
