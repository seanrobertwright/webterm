/**
 * Keybinding endpoints
 * GET /api/v1/keybindings — list all keybindings grouped by table
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendJson } from '../rest-router.js';
import { keybindingService } from '../../services/keybinding-service.js';
import type { KeyBinding } from '@webterm/shared/index';

/**
 * List all keybindings grouped by key table
 */
export async function handleListKeybindings(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const allBindings = keybindingService.getAll();

  // Group bindings by table
  const tables: Record<string, KeyBinding[]> = {};
  for (const binding of allBindings) {
    const table = binding.keyTable;
    if (!tables[table]) {
      tables[table] = [];
    }
    tables[table].push(binding);
  }

  sendJson(res, 200, {
    prefixKey: 'b',
    tables,
  });
}
