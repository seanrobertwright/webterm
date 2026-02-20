/**
 * System info endpoint
 * GET /api/v1/system/info
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import * as os from 'node:os';
import { sendJson } from '../rest-router.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

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
