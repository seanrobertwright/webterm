/**
 * Environment configuration management
 */

import os from 'os';
import path from 'path';

export interface Config {
  /** Server port */
  port: number;
  /** Host to bind to */
  host: string;
  /** Database file path */
  dbPath: string;
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** WebSocket heartbeat interval (ms) */
  wsHeartbeatInterval: number;
  /** WebSocket heartbeat timeout (ms) */
  wsHeartbeatTimeout: number;
  /** Maximum panes per window */
  maxPanesPerWindow: number;
  /** PTY output buffer size during disconnect */
  ptyBufferSize: number;
}

function getEnvString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getDefaultDbPath(): string {
  if (process.env['WEBTERM_DB_PATH']) return process.env['WEBTERM_DB_PATH'];
  if (process.env['NODE_ENV'] === 'production') {
    const dataDir = process.env['WEBTERM_DATA_DIR'] ?? path.join(os.homedir(), '.webterm');
    return path.join(dataDir, 'data', 'webterm.db');
  }
  return './data/webterm.db';
}

export const config: Config = {
  port: getEnvNumber('PORT', 9174),
  host: getEnvString('HOST', 'localhost'),
  dbPath: getDefaultDbPath(),
  logLevel: getEnvString('LOG_LEVEL', 'info') as Config['logLevel'],
  wsHeartbeatInterval: getEnvNumber('WS_HEARTBEAT_INTERVAL', 30000),
  wsHeartbeatTimeout: getEnvNumber('WS_HEARTBEAT_TIMEOUT', 10000),
  maxPanesPerWindow: getEnvNumber('MAX_PANES_PER_WINDOW', 16),
  ptyBufferSize: getEnvNumber('PTY_BUFFER_SIZE', 1000),
};
