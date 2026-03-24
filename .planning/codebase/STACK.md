# Technology Stack

**Analysis Date:** 2026-03-23

## Languages

**Primary:**
- TypeScript 5.7.0 - All application code (backend, frontend, shared types)
- JSX/TSX - React components in frontend
- JavaScript - Build scripts and configuration

**Secondary:**
- Bash - Docker entrypoint script
- Shell/Batch - Platform-specific tmux shims in `backend/src/tmux-shim/`

## Runtime

**Environment:**
- Node.js 20 (node:20-bookworm in Docker)
- Browser (Frontend: ES2022 target)

**Package Manager:**
- npm (workspaces)
- Lockfile: `package-lock.json` (committed)

## Frameworks

**Core:**
- React 19.0.0 - Frontend UI framework
- Vanilla Node.js HTTP (`http` module) - Backend HTTP server (no Express/Fastify)

**Terminal/UI:**
- xterm.js 5.5.0 - Terminal emulation with plugins:
  - `@xterm/addon-webgl` 0.18.0 - GPU-accelerated rendering
  - `@xterm/addon-fit` 0.10.0 - Auto-fit to container
  - `@xterm/addon-search` 0.15.0 - Terminal search
  - `@xterm/addon-serialize` 0.13.0 - Terminal state serialization
  - `@xterm/addon-web-links` 0.11.0 - Clickable links in terminal

**Styling:**
- Tailwind CSS 3.4.0 - Utility-first CSS framework
- PostCSS 8.4.49 - CSS transformation
- Autoprefixer 10.4.20 - CSS vendor prefixes

**State Management:**
- Zustand 5.0.0 - Frontend state (stores: `session-store`, `pane-store`, `settings-store`)

**Testing:**
- Vitest 2.1.0 - Unit/integration test runner (runs on all workspaces)
- Playwright 1.49.0 - E2E testing (frontend only)

**Build/Dev:**
- Vite 6.0.0 - Frontend bundler with HMR
- TSX 4.19.0 - TypeScript Node runner with watch mode
- TypeScript 5.7.0 - Type checking and compilation
- Terser 5.46.0 - JavaScript minification
- Rollup (via Vite) - Module bundling with manual code splitting for `xterm` and `react-vendor`

## Key Dependencies

**Critical:**
- `@lydell/node-pty` 1.1.0 - PTY (pseudoterminal) spawning and process management. Core to terminal functionality.
- `better-sqlite3` 12.6.2 - SQLite database driver with synchronous API. Uses WAL mode for concurrency.
- `ws` 8.19.0 - WebSocket server for real-time terminal I/O and control messages

**Infrastructure:**
- `uuid` 11.0.0 - Generate unique identifiers for sessions/windows/panes
- `update-notifier` 7.3.1 - Check for package updates
- `open` 11.0.0 - Open URLs/files (likely for opening browser on CLI launch)
- `@webterm/shared` (internal) - TypeScript-only package with model interfaces and message types

**Development:**
- ESLint 9.17.0 - Static code analysis (flat config)
- Prettier 3.4.0 - Code formatting
- Concurrently 9.1.0 - Run multiple npm scripts concurrently (backend + frontend dev)

## Configuration

**Environment:**
- Environment variables (via `process.env`):
  - `PORT` - Server port (default: 9174)
  - `HOST` - Host to bind to (default: 'localhost', set to 0.0.0.0 in Docker)
  - `WEBTERM_DB_PATH` - Custom database file path (overrides default)
  - `WEBTERM_DATA_DIR` - Custom data directory in production (defaults to `~/.webterm`)
  - `NODE_ENV` - 'production' or 'development'
  - `LOG_LEVEL` - Logging level (debug, info, warn, error)
  - `WS_HEARTBEAT_INTERVAL` - WebSocket heartbeat interval in ms (default: 30000)
  - `WS_HEARTBEAT_TIMEOUT` - WebSocket heartbeat timeout in ms (default: 10000)
  - `MAX_PANES_PER_WINDOW` - Maximum panes per window (default: 16)
  - `PTY_BUFFER_SIZE` - PTY output buffer size during disconnect (default: 1000)
  - `BACKEND_HOST` - Backend hostname for frontend proxy (used in Docker dev)

**Build:**
- `eslint.config.js` (flat config) - ESLint rules for TypeScript, no console.log, type imports
- `frontend/vite.config.ts` - Vite dev server, HMR, API proxy, chunk splitting
- `backend/tsconfig.json` - Node.js target (ES2022, NodeNext module resolution)
- `frontend/tsconfig.json` - Browser target (ES2022, bundler module resolution, JSX)
- `shared/tsconfig.json` - Type definitions only

## Platform Requirements

**Development:**
- Node.js 20 or compatible version
- npm workspaces support
- Git
- Docker (optional, for containerized dev)
- Python 3 - For native module compilation (node-pty, better-sqlite3)
- C++ compiler (g++, make) - For native modules

**Production:**
- Node.js 20 or compatible
- Linux/macOS/Windows with available shell (bash, zsh, cmd, powershell)
- SQLite support built into better-sqlite3

---

*Stack analysis: 2026-03-23*
