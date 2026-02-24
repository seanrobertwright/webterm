/**
 * Zustand store for key bindings
 *
 * Fetches bindings from the server on connect and caches by key table.
 * Supports dynamic updates from bind/unbind operations.
 */

import { create } from 'zustand';
import type { KeyBinding } from '@webterm/shared/index';

// ============================================================================
// Types
// ============================================================================

export interface KeybindingState {
  /** Bindings indexed by key table */
  tables: Record<string, KeyBinding[]>;
  /** Whether initial load is complete */
  loaded: boolean;
  /** Current prefix key (from options, default 'b') */
  prefixKey: string;
}

export interface KeybindingActions {
  /** Set all bindings for a table */
  setTable: (table: string, bindings: KeyBinding[]) => void;
  /** Set all tables at once (initial load) */
  setAllTables: (tables: Record<string, KeyBinding[]>) => void;
  /** Add or update a single binding */
  updateBinding: (table: string, key: string, command: string) => void;
  /** Remove a binding */
  removeBinding: (table: string, key: string) => void;
  /** Set the prefix key */
  setPrefixKey: (key: string) => void;
  /** Mark as loaded */
  setLoaded: (loaded: boolean) => void;
}

export type KeybindingStore = KeybindingState & KeybindingActions;

// ============================================================================
// Store
// ============================================================================

export const useKeybindingStore = create<KeybindingStore>()((set) => ({
  tables: {},
  loaded: false,
  prefixKey: 'b',

  setTable: (table, bindings) => {
    set((state) => ({
      tables: { ...state.tables, [table]: bindings },
    }));
  },

  setAllTables: (tables) => {
    set({ tables, loaded: true });
  },

  updateBinding: (table, key, command) => {
    set((state) => {
      const existing = state.tables[table] ?? [];
      const idx = existing.findIndex((b) => b.key === key);
      const binding: KeyBinding = {
        id: idx >= 0 && existing[idx] ? existing[idx].id : `dynamic-${table}-${key}`,
        keyTable: table,
        key,
        command,
        isDefault: false,
        createdAt: Date.now(),
      };

      const updated = idx >= 0
        ? [...existing.slice(0, idx), binding, ...existing.slice(idx + 1)]
        : [...existing, binding];

      return { tables: { ...state.tables, [table]: updated } };
    });
  },

  removeBinding: (table, key) => {
    set((state) => {
      const existing = state.tables[table] ?? [];
      return {
        tables: {
          ...state.tables,
          [table]: existing.filter((b) => b.key !== key),
        },
      };
    });
  },

  setPrefixKey: (key) => {
    set({ prefixKey: key });
  },

  setLoaded: (loaded) => {
    set({ loaded });
  },
}));
