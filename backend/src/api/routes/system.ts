/**
 * System info endpoint
 * GET /api/v1/system/info
 * POST /api/v1/system/pick-directory
 * POST /api/v1/system/validate-directory
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { exec, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { sendJson } from '../rest-router.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

/** Shell information */
interface ShellInfo {
  id: string;
  name: string;
  path: string;
  available: boolean;
}

/** Application version */
const VERSION = '1.0.0';

/**
 * Check if a shell is available on the system
 */
function isShellAvailable(shellPath: string): boolean {
  try {
    if (os.platform() === 'win32') {
      // Use where command on Windows
      execSync(`where ${shellPath}`, { stdio: 'ignore' });
    } else {
      // Use which command on Unix
      execSync(`which ${shellPath}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get available shells for the current platform
 */
function getAvailableShells(): ShellInfo[] {
  const platform = os.platform();
  const shells: ShellInfo[] = [];

  if (platform === 'win32') {
    // Windows shells
    shells.push({
      id: 'powershell',
      name: 'Windows PowerShell',
      path: 'powershell.exe',
      available: isShellAvailable('powershell.exe'),
    });

    shells.push({
      id: 'pwsh',
      name: 'PowerShell Core',
      path: 'pwsh.exe',
      available: isShellAvailable('pwsh.exe'),
    });

    shells.push({
      id: 'cmd',
      name: 'Command Prompt',
      path: 'cmd.exe',
      available: isShellAvailable('cmd.exe'),
    });

    // Check for Git Bash
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    for (const bashPath of gitBashPaths) {
      try {
        execSync(`if exist "${bashPath}" exit 0`, { stdio: 'ignore', shell: 'cmd.exe' });
        shells.push({
          id: 'bash',
          name: 'Bash (Git)',
          path: bashPath,
          available: true,
        });
        break;
      } catch {
        // Continue checking
      }
    }

    // WSL bash
    if (isShellAvailable('bash.exe')) {
      const hasWslBash = !shells.some((s) => s.id === 'bash');
      if (hasWslBash) {
        shells.push({
          id: 'bash',
          name: 'Bash (WSL)',
          path: 'bash.exe',
          available: true,
        });
      }
    }
  } else {
    // Unix shells
    shells.push({
      id: 'bash',
      name: 'Bash',
      path: '/bin/bash',
      available: isShellAvailable('bash'),
    });

    shells.push({
      id: 'zsh',
      name: 'Zsh',
      path: '/bin/zsh',
      available: isShellAvailable('zsh'),
    });

    shells.push({
      id: 'sh',
      name: 'POSIX Shell',
      path: '/bin/sh',
      available: isShellAvailable('sh'),
    });

    // PowerShell Core on Unix
    if (isShellAvailable('pwsh')) {
      shells.push({
        id: 'pwsh',
        name: 'PowerShell Core',
        path: 'pwsh',
        available: true,
      });
    }
  }

  return shells;
}

/**
 * Get default shell for the current platform
 */
function getDefaultShell(): string {
  const platform = os.platform();

  if (platform === 'win32') {
    // Prefer PowerShell Core, then Windows PowerShell
    if (isShellAvailable('pwsh.exe')) {
      return 'pwsh';
    }
    return 'powershell';
  }

  // Unix: check SHELL env or default to bash
  const shellEnv = process.env['SHELL'];
  if (shellEnv) {
    if (shellEnv.includes('zsh')) return 'zsh';
    if (shellEnv.includes('bash')) return 'bash';
  }

  return 'bash';
}

/**
 * Handle system info request
 * Returns server and shell information
 */
export async function handleSystemInfo(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  _body: unknown
): Promise<void> {
  logger.debug('Fetching system info');

  const shells = getAvailableShells();
  const defaultShell = getDefaultShell();

  const response = {
    version: VERSION,
    platform: os.platform(),
    shells,
    defaultShell,
    maxPanes: config.maxPanesPerWindow,
    scrollbackLines: 10000, // TODO: Make configurable
  };

  sendJson(res, 200, response);
}

/**
 * Handle pick-directory request
 * Opens a native OS folder picker dialog and returns the selected path.
 * POST /api/v1/system/pick-directory
 */
export async function handlePickDirectory(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  _body: unknown
): Promise<void> {
  const platform = os.platform();

  try {
    let selectedPath: string | null = null;

    if (platform === 'win32') {
      // Windows: Use PowerShell FolderBrowserDialog
      const psScript = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        "$dialog.Description = 'Select default start directory'",
        '$dialog.ShowNewFolderButton = $true',
        '$result = $dialog.ShowDialog()',
        'if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
      ].join('; ');

      const { stdout } = await execAsync(`powershell -NoProfile -Command "${psScript}"`, {
        timeout: 60000,
      });
      const trimmed = stdout.trim();
      selectedPath = trimmed.length > 0 ? trimmed : null;
    } else if (platform === 'darwin') {
      // macOS: Use osascript choose folder
      const { stdout } = await execAsync(
        "osascript -e 'POSIX path of (choose folder with prompt \"Select default start directory\")'",
        { timeout: 60000 }
      );
      const trimmed = stdout.trim();
      // Remove trailing slash if present
      selectedPath = trimmed.length > 0 ? trimmed.replace(/\/$/, '') : null;
    } else {
      // Linux: Use zenity
      const { stdout } = await execAsync('zenity --file-selection --directory --title="Select default start directory"', {
        timeout: 60000,
      });
      const trimmed = stdout.trim();
      selectedPath = trimmed.length > 0 ? trimmed : null;
    }

    if (selectedPath === null) {
      // User cancelled the dialog
      sendJson(res, 200, { path: null, cancelled: true });
      return;
    }

    // Validate the selected path exists and is a directory
    try {
      const stat = fs.statSync(selectedPath);
      if (!stat.isDirectory()) {
        sendJson(res, 200, { path: null, error: 'Selected path is not a directory' });
        return;
      }
    } catch {
      sendJson(res, 200, { path: null, error: 'Selected path does not exist or is inaccessible' });
      return;
    }

    sendJson(res, 200, { path: selectedPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If the user cancelled in osascript, it throws an error — treat as cancel
    if (message.includes('User canceled') || message.includes('cancelled')) {
      sendJson(res, 200, { path: null, cancelled: true });
      return;
    }
    logger.error('Failed to open folder picker', { error: message });
    sendJson(res, 500, { error: `Failed to open folder picker: ${message}` });
  }
}

/**
 * Handle validate-directory request
 * Checks if a directory path exists and is accessible.
 * POST /api/v1/system/validate-directory
 * Body: { path: string }
 * Returns: { valid: boolean, error?: string }
 */
export async function handleValidateDirectory(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  body: unknown
): Promise<void> {
  const bodyObj = body as { path?: unknown } | undefined;
  const dirPath = bodyObj?.path;

  if (!dirPath || typeof dirPath !== 'string') {
    sendJson(res, 400, { valid: false, error: 'No path provided' });
    return;
  }

  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      sendJson(res, 200, { valid: false, error: 'Path is not a directory' });
      return;
    }
    fs.accessSync(dirPath, fs.constants.R_OK | fs.constants.X_OK);
    sendJson(res, 200, { valid: true });
  } catch {
    sendJson(res, 200, { valid: false, error: 'Directory does not exist or is inaccessible' });
  }
}
