/**
 * Client-side session import service
 * Handles file picking, validation, API call, and scrollback replay
 */

import type { SessionExport } from '@webterm/shared/models';
import type { TerminalHandle } from '../components/terminal/Terminal';
import { importSessionApi } from './session-api';

/**
 * Open a file picker for JSON files.
 * Returns the selected File, or null if the user cancelled.
 */
function openFilePicker(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null;
      document.body.removeChild(input);
      resolve(file);
    });

    // Handle cancel (focus returns to window without change event)
    const handleFocus = () => {
      window.removeEventListener('focus', handleFocus);
      // Small delay to allow the change event to fire first
      setTimeout(() => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
          resolve(null);
        }
      }, 300);
    };
    window.addEventListener('focus', handleFocus);

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Parse and validate a session export file.
 * Throws a descriptive error on invalid format.
 */
async function parseExportFile(file: File): Promise<SessionExport> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file: could not parse file contents');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid export file: expected a JSON object');
  }

  const data = parsed as Record<string, unknown>;

  if (data['version'] !== 1) {
    throw new Error('Unsupported export version (expected version 1)');
  }

  const session = data['session'] as Record<string, unknown> | undefined;
  if (!session || typeof session !== 'object') {
    throw new Error('Invalid export file: missing session object');
  }

  if (!session['name'] || typeof session['name'] !== 'string') {
    throw new Error('Invalid export file: missing session name');
  }

  if (!Array.isArray(session['windows']) || session['windows'].length === 0) {
    throw new Error('Invalid export file: session must have at least one window');
  }

  return parsed as SessionExport;
}

/**
 * Replay scrollback content into terminal panes after import.
 * Waits briefly for terminals to mount, then writes scrollback to each pane.
 */
function replayScrollback(
  scrollback: Record<string, string>,
  paneIdMap: Record<string, string>
): void {
  // Delay to allow terminals to mount after session switch
  const attemptReplay = (retriesLeft: number) => {
    const handles = globalThis.terminalHandles as Map<string, TerminalHandle> | undefined;
    if (!handles) {
      if (retriesLeft > 0) {
        setTimeout(() => attemptReplay(retriesLeft - 1), 500);
      }
      return;
    }

    let pendingCount = 0;
    for (const [oldPaneId, content] of Object.entries(scrollback)) {
      const newPaneId = paneIdMap[oldPaneId];
      if (!newPaneId) continue;

      const handle = handles.get(newPaneId);
      if (handle) {
        handle.write(content);
      } else {
        pendingCount++;
      }
    }

    // If some terminals haven't mounted yet, retry
    if (pendingCount > 0 && retriesLeft > 0) {
      setTimeout(() => attemptReplay(retriesLeft - 1), 500);
    }
  };

  // Start with a short delay, retry up to 6 times (3 seconds total)
  setTimeout(() => attemptReplay(6), 500);
}

/** Result of a successful import */
export interface ImportResult {
  sessionId: string;
  sessionName: string;
  paneIdMap: Record<string, string>;
  scrollback: Record<string, string>;
}

/**
 * Full import flow: open file picker, parse, send to backend, return result.
 * The caller is responsible for switching to the new session and triggering scrollback replay.
 *
 * Returns null if the user cancelled the file picker.
 * Throws on validation or API errors.
 */
export async function importSession(): Promise<ImportResult | null> {
  const file = await openFilePicker();
  if (!file) return null;

  const exportData = await parseExportFile(file);
  const result = await importSessionApi(exportData);

  // Schedule scrollback replay (will run after caller switches session)
  if (exportData.scrollback && Object.keys(exportData.scrollback).length > 0) {
    replayScrollback(exportData.scrollback, result.paneIdMap);
  }

  return {
    sessionId: result.session.id,
    sessionName: result.session.name,
    paneIdMap: result.paneIdMap,
    scrollback: exportData.scrollback,
  };
}
