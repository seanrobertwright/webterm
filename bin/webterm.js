#!/usr/bin/env node

/**
 * WebTerm CLI entry point
 * Starts the WebTerm server and opens the browser.
 */

import { existsSync, mkdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json
const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    port: { type: 'string', short: 'p' },
    host: { type: 'string', short: 'H' },
    'no-open': { type: 'boolean', default: false },
    'data-dir': { type: 'string', short: 'd' },
    version: { type: 'boolean', short: 'v' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: true,
  allowPositionals: false,
});

// Handle --version
if (values.version) {
  console.log(`webterm v${version}`);
  process.exit(0);
}

// Handle --help
if (values.help) {
  console.log(`
  WebTerm v${version} — Web-based terminal multiplexer

  Usage: webterm [options]

  Options:
    -p, --port <number>     Server port (default: 9174)
    -H, --host <string>     Bind address (default: localhost)
        --no-open           Don't open browser on start
    -d, --data-dir <path>   Data directory (default: ~/.webterm)
    -v, --version           Print version and exit
    -h, --help              Print this help and exit

  Environment variables:
    PORT                    Server port
    HOST                    Bind address
    WEBTERM_DATA_DIR        Data directory path
    WEBTERM_DB_PATH         Direct database path (overrides data-dir)
    LOG_LEVEL               Logging verbosity (debug, info, warn, error)
`);
  process.exit(0);
}

// Resolve data directory
const dataDir = values['data-dir'] ?? process.env['WEBTERM_DATA_DIR'] ?? join(homedir(), '.webterm');
const dataPath = join(dataDir, 'data');
const dbPath = process.env['WEBTERM_DB_PATH'] ?? join(dataPath, 'webterm.db');

// Ensure data directory exists
if (!existsSync(dataPath)) {
  mkdirSync(dataPath, { recursive: true });
}

// Resolve port and host
const port = values.port ?? process.env['PORT'] ?? '9174';
const host = values.host ?? process.env['HOST'] ?? 'localhost';

// Set environment for the backend
process.env['NODE_ENV'] = 'production';
process.env['PORT'] = port;
process.env['HOST'] = host;
process.env['WEBTERM_DB_PATH'] = dbPath;
process.env['WEBTERM_DATA_DIR'] = resolve(dataDir);

// Start the backend server
// The compiled backend lives at backend/dist/backend/src/index.js because
// the backend tsconfig uses rootDir: ".." to include shared types.
const backendEntry = join(__dirname, '..', 'backend', 'dist', 'backend', 'src', 'index.js');

if (!existsSync(backendEntry)) {
  console.error('Error: Backend not found. The package may be corrupted.');
  console.error(`Expected: ${backendEntry}`);
  process.exit(1);
}

// Import and start the backend (it self-starts on import)
// Use pathToFileURL for Windows compatibility (ESM requires file:// URLs)
try {
  await import(pathToFileURL(backendEntry).href);
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
    console.error(`\n  Error: Port ${port} is already in use.`);
    console.error(`  Try: webterm --port <other-port>\n`);
    process.exit(1);
  }
  throw err;
}

// Print startup banner
console.log(`
  WebTerm v${version}

  Server:  http://${host}:${port}
  Data:    ${dbPath}

  Press Ctrl+C to stop
`);

// Open browser (unless --no-open)
if (!values['no-open']) {
  try {
    const open = await import('open');
    await open.default(`http://${host}:${port}`);
  } catch {
    // Browser open is best-effort — fail silently
  }
}
