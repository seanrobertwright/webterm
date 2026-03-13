/**
 * Client-side session export service
 * Exports session structure and terminal scrollback to a JSON file
 */

import type {
  SessionExport,
  SessionExportPane,
  SessionExportWindow,
} from '@webterm/shared/models';
import type { TerminalHandle } from '../components/terminal/Terminal';
import { fetchSession } from './session-api';

/**
 * Collect scrollback content from currently mounted terminal panes.
 * Only panes with active TerminalHandle refs will have scrollback data.
 */
function collectScrollback(paneIds: string[]): Record<string, string> {
  const handles = globalThis.terminalHandles as Map<string, TerminalHandle> | undefined;
  if (!handles) return {};

  const scrollback: Record<string, string> = {};
  for (const paneId of paneIds) {
    const serialized = handles.get(paneId)?.serialize();
    if (serialized) {
      scrollback[paneId] = serialized;
    }
  }
  return scrollback;
}

/**
 * Download a JSON object as a file in the browser.
 */
function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Export a session to a JSON file with structure and scrollback.
 * Fetches session data from the API, collects scrollback from mounted terminals,
 * and triggers a browser download.
 */
export async function exportSession(sessionId: string): Promise<void> {
  const session = await fetchSession(sessionId);

  // Collect all pane IDs across all windows
  const allPaneIds: string[] = [];
  for (const window of session.windows) {
    for (const pane of window.panes) {
      allPaneIds.push(pane.id);
    }
  }

  const scrollback = collectScrollback(allPaneIds);

  // Map to export shape
  const windows: SessionExportWindow[] = session.windows.map((w) => ({
    name: w.name,
    index: w.index,
    layout: w.layout,
    panes: w.panes.map(
      (p): SessionExportPane => ({
        id: p.id,
        shell: p.shell,
        cwd: p.cwd,
        cols: p.cols,
        rows: p.rows,
        title: p.title,
      })
    ),
  }));

  const exportData: SessionExport = {
    version: 1,
    exportedAt: Date.now(),
    session: {
      name: session.name,
      windows,
    },
    scrollback,
  };

  // Sanitize session name for filename
  const safeName = session.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${safeName}-${timestamp}.json`;

  downloadJson(exportData, filename);
}
