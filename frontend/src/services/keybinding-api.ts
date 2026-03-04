/**
 * REST API client for keybinding management
 */

import type { KeyBinding } from '@webterm/shared/index';

/** API base URL */
const API_BASE = '/api/v1';

/** Response shape from GET /api/v1/keybindings */
export interface KeybindingsResponse {
  prefixKey: string;
  tables: Record<string, KeyBinding[]>;
}

/**
 * Fetch all keybindings grouped by table
 */
export async function fetchKeybindings(): Promise<KeybindingsResponse> {
  const res = await fetch(`${API_BASE}/keybindings`);
  if (!res.ok) {
    throw new Error(`Failed to fetch keybindings: ${res.status}`);
  }
  return res.json() as Promise<KeybindingsResponse>;
}
