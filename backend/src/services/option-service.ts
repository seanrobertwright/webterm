/**
 * Hierarchical option resolution service
 *
 * Manages tmux-compatible options with scope-based inheritance.
 * Resolution order: pane -> window -> session -> global-pane -> global-window -> global-session -> server -> default
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/database.js';
import { logger } from '../utils/logger.js';
import type { OptionScope } from '../../../shared/types/models.js';
import {
  getOptionDefinition,
  validateOptionValue,
  optionDefinitions,
  getOptionsByScope,
} from '../../../shared/tmux/option-definitions.js';

// ============================================================================
// Types
// ============================================================================

interface OptionRow {
  id: string;
  scope: string;
  scope_id: string | null;
  name: string;
  value: string;
  updated_at: number;
}

interface OptionResult {
  name: string;
  value: string;
  scope: OptionScope;
}

interface GetContext {
  paneId?: string;
  windowId?: string;
  sessionId?: string;
}

// ============================================================================
// OptionService
// ============================================================================

/**
 * Manages option CRUD and hierarchical scope resolution.
 *
 * Options are stored in SQLite and resolved by walking the scope chain
 * from most specific (pane) to least specific (server), falling back
 * to the built-in default from the option definitions catalog.
 */
export class OptionService {
  /**
   * Get an option value with hierarchical scope resolution.
   *
   * Resolution order (first match wins):
   *   1. pane   (if paneId provided)
   *   2. window (if windowId provided)
   *   3. session (if sessionId provided)
   *   4. global-pane
   *   5. global-window
   *   6. global-session
   *   7. server
   *   8. built-in default from option definition
   *
   * @throws Error if the option name is not defined
   */
  get(name: string, context?: GetContext): string {
    const def = getOptionDefinition(name);
    if (!def) {
      throw new Error(`Unknown option: ${name}`);
    }

    const db = getDatabase();
    const stmt = db.prepare(
      'SELECT value FROM options WHERE scope = ? AND scope_id IS ? AND name = ?',
    );

    // Build the scope chain from most specific to least specific
    const scopeChain: Array<{ scope: OptionScope; scopeId: string | null }> = [];

    if (context?.paneId !== undefined) {
      scopeChain.push({ scope: 'pane', scopeId: context.paneId });
    }
    if (context?.windowId !== undefined) {
      scopeChain.push({ scope: 'window', scopeId: context.windowId });
    }
    if (context?.sessionId !== undefined) {
      scopeChain.push({ scope: 'session', scopeId: context.sessionId });
    }

    // Global scopes (no scopeId)
    scopeChain.push({ scope: 'global-pane', scopeId: null });
    scopeChain.push({ scope: 'global-window', scopeId: null });
    scopeChain.push({ scope: 'global-session', scopeId: null });
    scopeChain.push({ scope: 'server', scopeId: null });

    for (const { scope, scopeId } of scopeChain) {
      const row = stmt.get(scope, scopeId ?? null, name) as
        | Pick<OptionRow, 'value'>
        | undefined;
      if (row) {
        return row.value;
      }
    }

    // Fall back to the built-in default
    return def.defaultValue;
  }

  /**
   * Set an option value at a specific scope.
   *
   * @param name    Option name (must be a known option)
   * @param value   The value to set (validated against the option's type)
   * @param scope   The scope to set at (e.g. 'session', 'global-window', 'pane')
   * @param scopeId The target entity ID (required for 'session', 'window', 'pane'; null for globals)
   * @throws Error  If the option name is unknown or the value is invalid
   */
  set(name: string, value: string, scope: OptionScope, scopeId?: string): void {
    const def = getOptionDefinition(name);
    if (!def) {
      throw new Error(`Unknown option: ${name}`);
    }

    const validation = validateOptionValue(name, value);
    if (!validation.valid) {
      throw new Error(validation.error ?? `Invalid value for ${name}: ${value}`);
    }

    const db = getDatabase();
    const now = Date.now();
    const resolvedScopeId = scopeId ?? null;

    db.prepare(
      `INSERT INTO options (id, scope, scope_id, name, value, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (scope, scope_id, name)
       DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(randomUUID(), scope, resolvedScopeId, name, value, now);

    logger.debug(`Option set: ${name}=${value} at ${scope}${resolvedScopeId ? `:${resolvedScopeId}` : ''}`);
  }

  /**
   * Unset (remove) a custom option value, reverting to the next scope up.
   *
   * @returns true if a row was actually deleted, false if nothing was found
   */
  unset(name: string, scope: OptionScope, scopeId?: string): boolean {
    const db = getDatabase();
    const resolvedScopeId = scopeId ?? null;

    const result = db.prepare(
      'DELETE FROM options WHERE scope = ? AND scope_id IS ? AND name = ?',
    ).run(scope, resolvedScopeId, name);

    if (result.changes > 0) {
      logger.debug(`Option unset: ${name} at ${scope}${resolvedScopeId ? `:${resolvedScopeId}` : ''}`);
      return true;
    }

    return false;
  }

  /**
   * Show all options at a given scope, or all options with their effective values.
   *
   * When scope is provided: returns only options that have been explicitly set
   * at that scope, plus defaults for any options defined for that scope but
   * not yet customized.
   *
   * When no scope is provided: returns all known options with their effective
   * values (custom overrides merged with defaults).
   */
  showAll(scope?: OptionScope, scopeId?: string): OptionResult[] {
    const db = getDatabase();
    const results: OptionResult[] = [];

    if (scope !== undefined) {
      // Return all options for the given scope
      const resolvedScopeId = scopeId ?? null;

      // Fetch custom values at this scope
      const customRows = db.prepare(
        'SELECT name, value, scope FROM options WHERE scope = ? AND scope_id IS ?',
      ).all(scope, resolvedScopeId) as OptionRow[];

      const customMap = new Map<string, OptionRow>();
      for (const row of customRows) {
        customMap.set(row.name, row);
      }

      // Get all option definitions that belong to this scope
      const scopeDefs = getOptionsByScope(scope);

      for (const def of scopeDefs) {
        const custom = customMap.get(def.name);
        if (custom) {
          results.push({
            name: def.name,
            value: custom.value,
            scope: custom.scope as OptionScope,
          });
          customMap.delete(def.name);
        } else {
          results.push({
            name: def.name,
            value: def.defaultValue,
            scope,
          });
        }
      }

      // Include any custom options at this scope that aren't in the definitions
      // for this scope (e.g., a session-scoped override of a global-session option)
      for (const [, row] of customMap) {
        results.push({
          name: row.name,
          value: row.value,
          scope: row.scope as OptionScope,
        });
      }
    } else {
      // No scope specified: return all options with effective values
      // Collect all unique option names from definitions
      const seenNames = new Set<string>();

      for (const [key, def] of optionDefinitions) {
        // Skip scope-qualified keys (e.g. 'global-session:mouse')
        if (key.includes(':')) {
          continue;
        }

        if (seenNames.has(def.name)) {
          continue;
        }
        seenNames.add(def.name);

        // Find if there's a custom value anywhere
        const customRow = db.prepare(
          'SELECT value, scope FROM options WHERE name = ? ORDER BY updated_at DESC LIMIT 1',
        ).get(def.name) as Pick<OptionRow, 'value' | 'scope'> | undefined;

        if (customRow) {
          results.push({
            name: def.name,
            value: customRow.value,
            scope: customRow.scope as OptionScope,
          });
        } else {
          results.push({
            name: def.name,
            value: def.defaultValue,
            scope: def.scope,
          });
        }
      }
    }

    // Sort alphabetically by name for consistent output
    results.sort((a, b) => a.name.localeCompare(b.name));

    return results;
  }
}

/** Singleton instance */
export const optionService = new OptionService();
