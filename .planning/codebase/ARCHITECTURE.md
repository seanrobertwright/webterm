# Architecture

**Analysis Date:** 2026-03-23

## Pattern Overview

**Overall:** Monorepo with layered client-server architecture. Three independently-deployable packages: `@webterm/shared` (type definitions), `@webterm/backend` (Node.js HTTP server), `@webterm/frontend` (React SPA). Communication via HTTP REST API and binary/JSON WebSocket protocol.

**Key Characteristics:**
- Monorepo using npm workspaces (ESM throughout)
- Client-server separation with shared type system
- Real-time bidirectional WebSocket for terminal I/O
- Session persistence via SQLite with WAL mode
- Service-oriented backend with domain-specific managers (PTY, layout, broadcast)
- State management frontend using Zustand stores
- React 19 with xterm.js for terminal rendering

## Layers

**Presentation (Frontend):**
- Purpose: React-based terminal UI with split panes, session management, settings
- Location: `frontend/src/`
- Contains: React components, Zustand stores, hooks, services (API/WebSocket clients)
- Depends on: `@webterm/shared` (types/models), xterm.js, Tailwind CSS
- Used by: Browser clients via Vite dev server or production static file serving

**API & WebSocket (Backend):**
- Purpose: HTTP request routing, WebSocket upgrade, message routing
- Location: `backend/src/api/`
- Contains: REST routes (`routes/`), WebSocket server (`websocket-server.ts`), protocol codec (`protocol.ts`), message handlers (`handlers/`)
- Depends on: Services (session, PTY, layout, broadcast), `@webterm/shared` types
- Used by: Frontend clients, administrative tools

**Domain Services (Backend):**
- Purpose: Business logic for session, PTY, layout, broadcast, hooks, keybindings
- Location: `backend/src/services/`
- Contains: `pty-service.ts`, `session-service.ts`, `layout-service.ts`, `broadcast-service.ts`, `command-service.ts`, `hook-service.ts`, `keybinding-service.ts`
- Depends on: Database, models, errors, shared types
- Used by: API routes, WebSocket handlers

**Data Access (Backend):**
- Purpose: Database persistence, migrations, transactions
- Location: `backend/src/db/`
- Contains: `database.ts` (SQLite connection, WAL mode), `migrate.ts` (schema initialization)
- Depends on: `better-sqlite3`
- Used by: Session service

**Domain Models (Backend):**
- Purpose: Type-safe representations of entities
- Location: `backend/src/models/`
- Contains: `session.ts`, `window.ts`, `pane.ts`, `layout.ts`, `terminal.ts`
- Depends on: Shared types
- Used by: Services, database operations

**Shared Types:**
- Purpose: Single source of truth for types used by backend and frontend
- Location: `shared/types/` and `shared/tmux/`
- Contains: `models.ts` (Session/Window/Pane entities, Layout tree), `messages.ts` (binary/JSON message schemas)
- Depends on: TypeScript stdlib
- Used by: Both backend and frontend for type-safe communication

## Data Flow

**Session Creation & Pane Initialization:**

1. Client calls `createSession()` REST API → `Session` handler
2. Handler calls `sessionService.createSession()` → creates `Session`, `Window`, initial `Pane`
3. Database transaction creates rows in `sessions`, `windows`, `panes` tables
4. `sessionService` returns `SessionWithWindows` (layout tree included)
5. Client stores session in `useSessionStore()` and `usePaneStore()`
6. Client renders `Terminal` component for each pane, connects WebSocket

**Terminal I/O (Binary Protocol):**

1. User types in terminal → xterm.js captures keystroke
2. Frontend calls `WebSocketClient.sendBinaryMessage(type: INPUT, paneId, keyData)`
3. Binary protocol: `[0x01:1 byte][paneIdLen:1 byte][paneId:N bytes][payload:M bytes]`
4. Backend `websocket-server.ts` decodes message via `decodeBinaryMessage()`
5. Identifies target pane, routes to active PTY instance
6. `ptyManager.write(paneId, data)` writes to underlying `node-pty` process
7. PTY outputs data → `pty-service` event handler → `encodeBinaryMessage(type: OUTPUT, paneId, outputData)`
8. Binary output message sent to all connected clients for that session
9. Frontend `WebSocketClient.onMessage()` routes to pane's terminal via `terminalRefs.get(paneId)(data)`

**Pane Resize & Layout:**

1. Client detects terminal resize (window/container) → sends `ResizeMessage` (JSON)
2. `websocket-server.ts` routes to `handleResize()` in `terminal-handler.ts`
3. Handler calls `ptyManager.resize(paneId, cols, rows)` → `IPty.resize()`
4. Updates database pane record with new dimensions
5. Broadcasts `PaneUpdatedMessage` to all clients (no layout change)

**Split Pane (Layout Modification):**

1. User triggers split (keybinding) → frontend sends `SplitMessage` (direction: 'h'|'v')
2. `websocket-server.ts` routes to `handleSplit()` in `terminal-handler.ts`
3. Handler calls `layoutService.splitLayout()` → updates layout tree recursively
4. Spawns new PTY: `ptyManager.spawn()` → starts new shell process
5. Creates new `Pane` record in database
6. Updates window's `layout` column with serialized new tree
7. Broadcasts `LayoutUpdatedMessage` + `PaneCreatedMessage` to clients
8. Frontend updates `usePaneStore()` layout and creates new `TerminalPane` component

**Broadcast Mode:**

1. User toggles broadcast + selects panes → `BroadcastMessage` (enabled, paneIds)
2. `websocket-server.ts` routes to `handleBroadcast()` in `terminal-handler.ts`
3. Updates `BroadcastState` in handler context
4. Binary INPUT messages from keyboard are now cloned to all broadcast paneIds
5. `ptyManager.write()` called for each pane in broadcast set
6. All PTYs receive same input independently

**State Management (Frontend):**

- `useSessionStore()`: Current session object, windows list, active window ID, saved sessions
- `usePaneStore()`: Layout tree, pane map (UUID→Pane), active pane, broadcast state, zoom state
- `useSettingsStore()`: Theme, font size, keybindings, shell preferences
- Stores use Zustand with devtools + persist middleware
- Persistence to localStorage for user settings across reloads

## Key Abstractions

**Layout Tree (`Layout` type):**
- Purpose: Represents recursive pane arrangement as binary tree
- Structure: Leaf nodes hold `paneId`, split nodes hold `children[]` + proportional `sizes[]`
- Examples: `backend/src/models/layout.ts`, `backend/src/services/layout-service.ts`
- Pattern: Recursive tree traversal for split/remove/query operations
- Main operations:
  - `createLeafLayout()` → single pane node
  - `splitLayout()` → insert new leaf via recursive replacement
  - `splitLayoutMainVertical()` → alternative strategy: main pane left, others stacked right
  - `removePane()` → delete leaf and rebalance siblings
  - `getPaneIds()` → collect all pane IDs in tree
  - `serializeLayout()` / `parseLayout()` → JSON persistence

**PTY Manager (`PtyInstance`):**
- Purpose: Lifecycle management for `node-pty` processes
- Location: `backend/src/services/pty-service.ts`
- Maintains: Map of `paneId` → `PtyInstance` (wraps IPty with metadata)
- Event-driven: `onData`, `onExit`, `onTitleChange`, `onBell` handlers
- Key operations:
  - `spawn()` → creates IPty with shell/cwd/dimensions
  - `write()` → sends input to PTY stdin
  - `resize()` → changes terminal dimensions
  - `kill()` → terminates process
  - Tmux environment variable setup (for shim integration)

**Binary Protocol:**
- Purpose: Low-latency terminal I/O over WebSocket
- Location: `backend/src/api/protocol.ts`, `shared/types/messages.ts`
- Format: `[type:1 byte][paneIdLen:1 byte][paneId:N bytes][payload:M bytes]`
- Types: `INPUT` (0x01, client→server), `OUTPUT` (0x02, server→client)
- Rationale: Avoids JSON overhead for high-frequency I/O data
- Encoding: UTF-8 for pane IDs, raw bytes for terminal data
- Payload: Terminal escape sequences, keypresses, output characters

**Session Entity:**
- Purpose: Top-level workspace containing windows and panes
- Examples: `shared/types/models.ts`, `backend/src/services/session-service.ts`
- Hierarchy: `Session` → `Window[]` → `Pane[]` with shared `Layout`
- Persistence: SQLite schema in `sessions`, `windows`, `panes`, `pane_data` tables
- Metadata: Creation time, active window, last window (for "return to previous")

**WebSocket Server State:**
- Purpose: Track active client connections and disconnected buffers
- Structure: Map of `sessionId` → Set of `ClientConnection`
- Disconnected clients: Buffered output (PTY data) retained for reconnection recovery
- Heartbeat: Server pings clients every 30s, 10s timeout
- Multi-client support: Multiple browser tabs on same session see shared state

## Entry Points

**Backend Server:**
- Location: `backend/src/index.ts`
- Triggers: `npm run dev:backend` (tsx watch) or `npm start` (production)
- Responsibilities:
  - Initialize database (migrations)
  - Create HTTP server (vanilla `http` module)
  - Attach REST router and WebSocket server
  - Serve static frontend files (production only)
  - Handle graceful shutdown (SIGINT/SIGTERM)
- Returns: Server listening on `localhost:9174` (configurable PORT env)

**REST Router:**
- Location: `backend/src/api/rest-router.ts`
- Triggers: HTTP requests to `/api/*`, `/health`, `/ws`
- Routes registered:
  - `/api/v1/sessions` (GET, POST, DELETE)
  - `/api/v1/sessions/:id` (GET, PATCH)
  - `/api/v1/sessions/:id/save` (POST)
  - `/api/v1/sessions/:id/import` (POST)
  - `/api/v1/commands` (POST)
  - `/api/v1/commands/panes` (GET)
  - `/api/v1/keybindings` (GET)
  - `/api/v1/system/*` (info, pick directory, validate)
  - `/health` (health check)
  - `/ws` (WebSocket upgrade)

**Frontend App:**
- Location: `frontend/src/main.tsx` → `frontend/src/App.tsx`
- Triggers: `npm run dev:frontend` (Vite server) or browser load (production)
- Responsibilities:
  - Initialize Zustand stores (session, pane, settings)
  - Connect WebSocket client
  - Render layout tree as nested pane containers with xterm.js terminals
  - Handle global keybindings (tmux-style commands)
  - Manage UI state (save dialog, settings panel, session picker)
- Top-level providers: `ThemeProvider`, global keybinding handler

**WebSocket Connection:**
- Location: `backend/src/api/websocket-server.ts`
- Triggers: WebSocket upgrade request to `/ws?sessionId=...`
- Responsibilities:
  - Accept/reject connection based on sessionId
  - Create per-client state (`ClientConnection`)
  - Route incoming messages (binary I/O, JSON control)
  - Buffer output for disconnected clients
  - Send heartbeat pings
  - Handle reconnection with state recovery

## Error Handling

**Strategy:** Type-safe custom error hierarchy with HTTP status codes and error codes.

**Error Classes:**
- `WebTermError` (base): All errors inherit, include `code` + `statusCode`
- `NotFoundError` (404): Session/window/pane not found
- `ValidationError` (400): Invalid input, includes `field` + `constraint` metadata
- `DuplicateError` (409): Name/ID already exists
- `PaneLimitError` (400): Max panes per window exceeded
- `PtyError` (500): PTY spawn/resize failure
- `WebSocketError` (500): WebSocket protocol violations

**Patterns:**

```typescript
// In REST handlers: catch and convert to JSON response
try {
  const session = sessionService.getSession(sessionId);
} catch (error) {
  const response = toErrorResponse(error);
  res.statusCode = isWebTermError(error) ? error.statusCode : 500;
  res.end(JSON.stringify(response));
}

// In WebSocket handlers: send ErrorMessage to client
if (!sessionId) {
  sendError(ws, 'INVALID_SESSION', 'Session ID required');
  return;
}
```

## Cross-Cutting Concerns

**Logging:**
- Backend uses `logger` utility (wrapper around console with levels: debug, info, warn, error)
- Location: `backend/src/utils/logger.ts`
- No bare `console.log` allowed (ESLint enforces `warn`/`error`)
- Frontend: No structured logging (development uses `console.warn`/`console.error`)

**Validation:**
- Backend: Custom `ValidationError` with field/constraint metadata
- Frontend: Form validation in component state before API calls
- Database constraints: Foreign keys enabled, NOT NULL on required columns

**Authentication:**
- Not implemented: WebTerm assumes local/trusted network usage
- Sessions are ephemeral (not persisted across server restarts unless saved explicitly)
- No user login or permission model

**Database Transactions:**
- Wrapper function `transaction<T>(fn: () => T)` in `database.ts`
- Used for multi-step operations (e.g., create session + window + pane)
- Ensures atomicity: all succeed or all roll back

**Flow Control (WebSocket):**
- High water mark: 64KB of buffered output before pause
- Low water mark: 16KB to resume
- `FlowPauseMessage` / `FlowResumeMessage` notify client of backpressure

---

*Architecture analysis: 2026-03-23*
