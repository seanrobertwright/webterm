# CLI Interface Contract: webterm

**Date**: 2026-02-22
**Package**: `webterm` (npm global)

---

## Installation

```bash
npm install -g webterm
```

**Prerequisites**: Node.js >= 20.0.0

---

## Command: `webterm`

Starts the WebTerm server and opens the browser.

### Usage

```
webterm [options]
```

### Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--port <number>` | `-p` | `9174` | Server port |
| `--host <string>` | `-H` | `localhost` | Bind address |
| `--no-open` | | `false` | Don't open browser on start |
| `--data-dir <path>` | `-d` | `~/.webterm` | Data directory path |
| `--version` | `-v` | | Print version and exit |
| `--help` | `-h` | | Print help and exit |

### Environment Variables

All CLI flags can also be set via environment variables (CLI flags take precedence):

| Variable | Maps to |
|----------|---------|
| `PORT` | `--port` |
| `HOST` | `--host` |
| `WEBTERM_DATA_DIR` | `--data-dir` |
| `WEBTERM_DB_PATH` | Direct database path (overrides data-dir) |
| `LOG_LEVEL` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Clean shutdown (SIGINT/SIGTERM) |
| `1` | Startup failure (port in use, missing permissions, etc.) |

### Startup Output

```
  WebTerm v1.0.0

  Server:  http://localhost:9174
  Data:    ~/.webterm/data/webterm.db

  Press Ctrl+C to stop
```

### Behavior

1. Creates `~/.webterm/data/` directory if it doesn't exist
2. Runs SQLite migrations on startup
3. Starts HTTP server (serves built frontend + REST API + WebSocket)
4. Opens default browser to `http://{host}:{port}` (unless `--no-open`)
5. On SIGINT/SIGTERM: closes WebSocket connections, closes database, exits with code 0
6. If port is already in use: prints error with suggestion to use `--port`, exits with code 1

---

## Data Directory Structure

```
~/.webterm/
└── data/
    └── webterm.db       # SQLite database (sessions, windows, panes)
```

---

## Published Package Structure

```
webterm/                 # npm package root
├── package.json         # { bin: { webterm: "./bin/webterm.js" } }
├── bin/
│   └── webterm.js       # CLI entry point (#!/usr/bin/env node)
├── backend/
│   └── dist/            # Compiled backend JS
├── frontend/
│   └── dist/            # Built static frontend files
├── shared/
│   └── types/           # Compiled shared types
└── README.md
```

---

## Runtime Dependencies (shipped in package)

| Package | Purpose |
|---------|---------|
| `@lydell/node-pty` | PTY spawning (prebuilt binaries, no compilation) |
| `better-sqlite3` | SQLite database (prebuilt binaries) |
| `ws` | WebSocket server |
| `uuid` | UUID generation |
| `open` | Cross-platform browser launching |
