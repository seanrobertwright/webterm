/**
 * Hook service for lifecycle event commands
 *
 * Registers commands to be executed on lifecycle events (e.g., after-new-window,
 * pane-died, session-renamed, etc.).
 *
 * Hooks are stored in-memory (not persisted to DB for simplicity).
 */

import { logger } from '../utils/logger.js';

export interface Hook {
  event: string;
  command: string;
}

export class HookService {
  private hooks: Map<string, Hook[]> = new Map();

  /** Register a hook command for a given event */
  register(event: string, command: string): void {
    const list = this.hooks.get(event) ?? [];
    list.push({ event, command });
    this.hooks.set(event, list);
    logger.debug(`Hook registered: ${event} -> ${command}`);
  }

  /** Unregister a hook by event name (removes all hooks for that event) */
  unregister(event: string): boolean {
    const had = this.hooks.has(event);
    this.hooks.delete(event);
    return had;
  }

  /** List all hooks */
  listAll(): Hook[] {
    const all: Hook[] = [];
    for (const hooks of this.hooks.values()) {
      all.push(...hooks);
    }
    return all;
  }

  /** Get hooks for a specific event */
  getHooksForEvent(event: string): Hook[] {
    return this.hooks.get(event) ?? [];
  }

  /** Fire an event: returns the list of commands to execute */
  fire(event: string): string[] {
    const hooks = this.hooks.get(event);
    if (!hooks || hooks.length === 0) return [];
    logger.debug(`Firing hooks for event: ${event} (${hooks.length} hooks)`);
    return hooks.map((h) => h.command);
  }

  /** Clear all hooks */
  clear(): void {
    this.hooks.clear();
  }
}

/** Singleton instance */
export const hookService = new HookService();
