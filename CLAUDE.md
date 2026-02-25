# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WebTerm is a web-based terminal multiplexer inspired by tmux. It runs multiple terminal sessions in a browser with split panes, session persistence, and a binary WebSocket protocol for low-latency I/O.

## Commands

```bash
# Install dependencies (must run first)
npm install

# Build shared types (required before first dev run)
npm run build:shared

# Start both backend + frontend dev servers (concurrent)
npm run dev

# Start only backend (tsx watch, auto-restarts on changes, ignores ./data)
npm run dev:backend

# Start only frontend (Vite dev server with HMR)
npm run dev:frontend

# Production build (shared → backend → frontend, sequential)
npm run build

# Lint (ESLint flat config)
npm run lint

# Format (Prettier)
npm run format

# Type check all workspaces
npm run typecheck

# Run all tests (vitest)
npm test

# Run tests for a single workspace
npm run test -w @webterm/backend
npm run test -w @webterm/frontend

# Run a single test file
npx vitest run path/to/test.ts -w backend

# Watch mode tests
npm run test:watch -w @webterm/backend

# E2E tests (Playwright, frontend only)
npm run test:e2e -w @webterm/frontend
```

## Architecture

### Monorepo Structure (npm workspaces)

Three packages: `backend/` (`@webterm/backend`), `frontend/` (`@webterm/frontend`), `shared/` (`@webterm/shared`). All are ESM (`"type": "module"`).

**`shared/`** — TypeScript-only package exporting model interfaces and WebSocket message types. No build step needed for dev (imported as raw `.ts` via package exports). Consumed by both backend and frontend.

**`backend/`** — Node.js HTTP server (vanilla `http`, no Express). Handles REST API routes (`/api/v1/...`), WebSocket upgrade at `/ws`, and in production serves the built frontend as static files. Key services:
- `pty-service.ts` — Manages `node-pty` instances (spawn, write, resize, kill). One PTY per pane.
- `session-service.ts` — CRUD for sessions/windows/panes in SQLite.
- `layout-service.ts` — Recursive layout tree operations (split, remove, resize).
- `websocket-server.ts` — WebSocket connection lifecycle, binary/JSON message routing, heartbeat, reconnection with output buffering.
- `broadcast-service.ts` — Broadcast mode (type in multiple panes simultaneously).

**`frontend/`** — React 19 + Vite + Tailwind CSS. Uses xterm.js with WebGL renderer for terminal display. State management via Zustand stores (`session-store`, `pane-store`, `settings-store`). The `@` path alias maps to `frontend/src/`.

### WebSocket Protocol

Two message formats over one connection (`ws://host:port/ws?sessionId=...`):
- **Binary** — Terminal I/O. Format: `[type:1][paneIdLen:1][paneId:N][payload:M]`. Types: `0x01` INPUT, `0x02` OUTPUT. Encode/decode helpers in `shared/types/messages.ts`.
- **JSON** — Control messages (resize, split, create, close, focus, broadcast, window ops). Type discriminated via `message.type` field. Types defined in `shared/types/messages.ts` as `ClientMessage` / `ServerMessage` unions.

### Data Model

Session → Window → Pane hierarchy. Layout is a recursive tree (`Layout` type: leaf nodes hold `paneId`, split nodes hold `children[]` + `sizes[]`). Persisted in SQLite via `better-sqlite3` with WAL mode. Database auto-created at `./data/webterm.db` (or `WEBTERM_DB_PATH` env var).

### Dev Server Ports

- Frontend (Vite): `localhost:5173` — proxies `/api` and `/ws` to backend
- Backend: `localhost:9174` (configured via `PORT` env, default 9174 in code, README says 3000 but code uses 9174)

### Docker

Multi-stage Dockerfile with targets: `dev-backend`, `dev-frontend`, `prod`. `docker-compose.yml` runs backend + frontend dev containers with volume mounts for hot reload.

## Code Conventions

- **TypeScript strict mode** with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitAny`
- **Consistent type imports** enforced: `import type { Foo } from '...'` (ESLint rule `@typescript-eslint/consistent-type-imports`)
- **No explicit `any`** — ESLint error
- **No bare `console.log`** — use `console.warn`/`console.error`, or the backend `logger` utility
- **Naming**: camelCase for variables/functions, PascalCase for types/classes/components
- **Prettier**: single quotes, 2-space indent, trailing commas (es5), 100 char print width, LF line endings
- Backend imports use `.js` extensions (NodeNext module resolution)
- Conventional commits: `type(scope): description`
