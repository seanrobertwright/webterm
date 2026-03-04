<!-- rlm-navigator:start -->

## REQUIRED: Use RLM Navigator for All Codebase Navigation

This project uses the `/rlm-navigator` skill. You MUST follow the RLM Navigator workflow for ALL codebase exploration, file reading, and code search. This is NOT optional.

**Mandatory workflow: `rlm_tree` → `rlm_map` → `rlm_drill` → Edit**

### What you MUST do:
- Use `rlm_tree` instead of `ls`, `find`, or `Glob` for directory exploration
- Use `rlm_map` instead of `Read` or `cat` to understand file contents
- Use `rlm_drill` to read only the specific symbol you need
- Use `rlm_search` to find symbols across files

### What you MUST NOT do:
- Do NOT read full files with the `Read` tool unless the file is under 50 lines or is a config file
- Do NOT use `Glob` or `find` to explore the project structure
- Do NOT use `grep` or `Grep` for code search — use `rlm_search` or the REPL's `grep()` helper

### Navigation Tools

| Tool | Purpose |
|------|---------|
| `get_status` | Check daemon health |
| `rlm_tree` | See directory structure (replaces ls/find/Glob) |
| `rlm_map` | See file signatures only (replaces Read/cat) |
| `rlm_drill` | Read specific symbol implementation |
| `rlm_search` | Find symbols across files |
| `rlm_doc_map` | Get hierarchical outline of a document file |
| `rlm_doc_drill` | Extract a specific section from a document by title |
| `rlm_assess` | Check if accumulated context is sufficient to answer |

### REPL Tools

| Tool | Purpose |
|------|---------|
| `rlm_repl_init` | Initialize the stateful REPL |
| `rlm_repl_exec` | Execute Python code (variables persist) |
| `rlm_repl_status` | Check variables, buffers, execution count |
| `rlm_repl_reset` | Clear all REPL state |
| `rlm_repl_export` | Export accumulated buffers |

### Built-in REPL Helpers

| Helper | Signature | Purpose |
|--------|-----------|---------|
| `peek` | `peek(file_path, start=1, end=None)` | Read numbered lines from file |
| `grep` | `grep(pattern, path=".", max_results=50)` | Regex search across files |
| `chunk_indices` | `chunk_indices(file_path, size=200, overlap=20)` | Compute chunk boundaries |
| `write_chunks` | `write_chunks(file_path, out_dir=None, size=200, overlap=20)` | Write chunks to disk |
| `add_buffer` | `add_buffer(key, text)` | Accumulate findings in named buffers |

### Session End
- Before ending a session, call `get_status` to show the token savings summary

<!-- rlm-navigator:end -->

﻿# CLAUDE.md

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
