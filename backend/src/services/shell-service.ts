/**
 * Shell detection service
 * Detects available shells based on the operating system
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import type { ShellType } from '../../../shared/types/models.js';

/** Shell executable information */
export interface ShellInfo {
  type: ShellType;
  path: string;
  name: string;
  available: boolean;
}

/** Shell type constants */
export const SHELL_TYPES = {
  POWERSHELL: 'powershell' as const,
  PWSH: 'pwsh' as const,
  CMD: 'cmd' as const,
  BASH: 'bash' as const,
  ZSH: 'zsh' as const,
  SH: 'sh' as const,
  DEFAULT: 'default' as const,
};

/** Windows shell paths */
const WINDOWS_SHELLS: Record<string, { type: ShellType; name: string }> = {
  'powershell.exe': { type: 'powershell', name: 'Windows PowerShell' },
  'pwsh.exe': { type: 'pwsh', name: 'PowerShell Core' },
  'cmd.exe': { type: 'cmd', name: 'Command Prompt' },
};

/** Unix shell paths */
const UNIX_SHELLS: Record<string, { type: ShellType; name: string }> = {
  '/bin/bash': { type: 'bash', name: 'Bash' },
  '/bin/zsh': { type: 'zsh', name: 'Zsh' },
  '/bin/sh': { type: 'sh', name: 'Bourne Shell' },
  '/usr/bin/bash': { type: 'bash', name: 'Bash' },
  '/usr/bin/zsh': { type: 'zsh', name: 'Zsh' },
  '/usr/local/bin/bash': { type: 'bash', name: 'Bash' },
  '/usr/local/bin/zsh': { type: 'zsh', name: 'Zsh' },
};

/**
 * Check if a file exists and is executable
 */
function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find executable in Windows PATH
 */
function findWindowsExecutable(name: string): string | null {
  const pathEnv = process.env['PATH'] ?? '';
  const systemRoot = process.env['SystemRoot'] ?? 'C:\\Windows';
  
  // Common locations for shells
  const searchPaths = [
    path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
    path.join(systemRoot, 'System32'),
    ...pathEnv.split(path.delimiter),
  ];

  for (const dir of searchPaths) {
    const fullPath = path.join(dir, name);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Get the default shell for the current platform
 */
export function getDefaultShell(): string {
  const platform = os.platform();

  if (platform === 'win32') {
    // Prefer PowerShell Core if available, then Windows PowerShell
    const pwshPath = findWindowsExecutable('pwsh.exe');
    if (pwshPath) {
      return pwshPath;
    }

    const powershellPath = findWindowsExecutable('powershell.exe');
    if (powershellPath) {
      return powershellPath;
    }

    // Fallback to COMSPEC (usually cmd.exe)
    return process.env['COMSPEC'] ?? 'cmd.exe';
  }

  // Unix: use $SHELL environment variable
  const shell = process.env['SHELL'];
  if (shell && isExecutable(shell)) {
    return shell;
  }

  // Fallback to common shells
  const fallbacks = ['/bin/bash', '/bin/zsh', '/bin/sh'];
  for (const fallback of fallbacks) {
    if (isExecutable(fallback)) {
      return fallback;
    }
  }

  return '/bin/sh';
}

/**
 * Get shell type from shell path
 */
export function getShellType(shellPath: string): ShellType {
  const basename = path.basename(shellPath).toLowerCase();
  
  if (basename.includes('pwsh')) return 'pwsh';
  if (basename.includes('powershell')) return 'powershell';
  if (basename.includes('cmd')) return 'cmd';
  if (basename.includes('bash')) return 'bash';
  if (basename.includes('zsh')) return 'zsh';
  if (basename === 'sh') return 'sh';
  
  return 'default';
}

/**
 * Get all available shells on the system
 */
export function getAvailableShells(): ShellInfo[] {
  const platform = os.platform();
  const shells: ShellInfo[] = [];

  if (platform === 'win32') {
    // Check Windows shells
    for (const [exe, info] of Object.entries(WINDOWS_SHELLS)) {
      const shellPath = findWindowsExecutable(exe);
      shells.push({
        type: info.type,
        path: shellPath ?? exe,
        name: info.name,
        available: shellPath !== null,
      });
    }
  } else {
    // Check Unix shells
    const checkedTypes = new Set<ShellType>();
    
    for (const [shellPath, info] of Object.entries(UNIX_SHELLS)) {
      // Avoid duplicates (e.g., /bin/bash and /usr/bin/bash)
      if (checkedTypes.has(info.type)) continue;
      
      const available = isExecutable(shellPath);
      if (available) {
        checkedTypes.add(info.type);
        shells.push({
          type: info.type,
          path: shellPath,
          name: info.name,
          available: true,
        });
      }
    }

    // Also check the user's $SHELL if not already in the list
    const userShell = process.env['SHELL'];
    if (userShell && isExecutable(userShell)) {
      const shellType = getShellType(userShell);
      if (!checkedTypes.has(shellType)) {
        shells.push({
          type: shellType,
          path: userShell,
          name: path.basename(userShell),
          available: true,
        });
      }
    }
  }

  return shells;
}

/**
 * Resolve a shell type to its executable path
 */
export function resolveShellPath(shellType: ShellType): string {
  if (shellType === 'default') {
    return getDefaultShell();
  }

  const platform = os.platform();

  if (platform === 'win32') {
    switch (shellType) {
      case 'pwsh':
        return findWindowsExecutable('pwsh.exe') ?? 'pwsh.exe';
      case 'powershell':
        return findWindowsExecutable('powershell.exe') ?? 'powershell.exe';
      case 'cmd':
        return findWindowsExecutable('cmd.exe') ?? 'cmd.exe';
      default:
        return getDefaultShell();
    }
  } else {
    switch (shellType) {
      case 'bash':
        return isExecutable('/bin/bash') ? '/bin/bash' : '/usr/bin/bash';
      case 'zsh':
        return isExecutable('/bin/zsh') ? '/bin/zsh' : '/usr/bin/zsh';
      case 'sh':
        return '/bin/sh';
      default:
        return getDefaultShell();
    }
  }
}
