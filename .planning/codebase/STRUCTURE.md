# Codebase Structure

**Analysis Date:** 2026-03-23

## Directory Layout

```
webterm/
├── backend/                    # Node.js HTTP server + WebSocket
│   ├── src/
│   │   ├── api/              # HTTP/WebSocket routing and handlers
│   │   │   ├── routes/       # REST endpoint handlers
│   │   │   ├── handlers/     # WebSocket message handlers
│   │   │   ├── rest-router.ts
│   │   │   ├── websocket-server.ts
│   │   │   └── protocol.ts   # Binary message codec
│   │   ├── services/         # Domain services (session, PTY, layout, etc)
│   │   ├── db/               # Database connection and migrations
│   │   ├── models/           # Entity type definitions
│   │   ├── config/           # Configuration management
│   │   ├── tmux-shim/        # tmux compatibility shim
│   │   ├── utils/            # Shared utilities (logger, errors)
│   │   └── index.ts          # Server entry point
│   ├── dist/                 # Compiled output (TypeScript → JavaScript)
│   ├── data/                 # SQLite database (./data/webterm.db)
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # React SPA (Vite)
│   ├── src/
│   │   ├── components/       # React components (layout, terminal, session, settings)
│   │   ├── stores/           # Zustand state stores
│   │   ├── services/         # API clients (REST, WebSocket)
│   │   ├── hooks/            # React custom hooks
│   │   ├── providers/        # Context providers (theme)
│   │   ├── config/           # Frontend config (terminal themes)
│   │   ├── styles/           # CSS (Tailwind globals)
│   │   ├── types/            # Frontend-specific types
│   │   ├── utils/            # Frontend utilities (layout navigation)
│   │   ├── App.tsx           # Root component
│   │   └── main.tsx          # Vite entry point
│   ├── dist/                 # Production build output
│   ├── public/               # Static assets
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── shared/                     # Type definitions (consumed by backend + frontend)
│   ├── types/
│   │   ├── models.ts         # Entity types (Session, Window, Pane, Layout)
│   │   ├── messages.ts       # WebSocket message schemas
│   │   └── index.ts          # Re-export all
│   ├── tmux/                 # Tmux compatibility layer
│   │   ├── command-defs.ts
│   │   ├── command-registry.ts
│   │   ├── format-parser.ts
│   │   ├── option-definitions.ts
│   │   └── target-parser.ts
│   ├── dist/                 # TypeScript declaration output
│   ├── package.json
│   └── tsconfig.json
├── package.json              # Root workspace manifest
├── eslint.config.js          # Flat ESLint config
├── .prettierrc                # Prettier formatting rules
├── docker-compose.yml
├── Dockerfile
├── .planning/
│   └── codebase/             # This directory - GSD analysis docs
└── .vscode/                  # VSCode workspace settings
```

## Directory Purposes

**backend/src/api/:**
- REST request routing and handler dispatch
- WebSocket server and client connection management
- Binary/JSON message encoding and decoding
- Message type definitions and validation
- Flow control (pause/resume signals)

**backend/src/services/:**
- Domain business logic separate from request handling
- `pty-service.ts`: node-pty lifecycle (spawn, write, resize, kill, event handlers)
- `session-service.ts`: CRUD for sessions, windows, panes; database transactions
- `layout-service.ts`: Layout tree operations (split, remove, serialize, parse)
- `broadcast-service.ts`: Multi-pane input forwarding state
- `command-service.ts`: Execute tmux commands from API
- `keybinding-service.ts`: Keybinding definitions and lookup
- `hook-service.ts`: Custom hooks and callbacks
- `shell-service.ts`: Shell resolution and validation
- `paste-buffer-service.ts`: Clipboard buffer management

**backend/src/db/:**
- SQLite connection initialization with WAL mode
- Database schema migrations (tables: sessions, windows, panes, pane_data)
- Transaction wrapper for atomic multi-step operations
- Connection pooling and closure

**backend/src/models/:**
- Type definitions mirroring database schema
- Entity interfaces for internal use
- Conversion between database rows and TypeScript objects

**backend/src/config/:**
- Environment variable parsing
- Default configuration values
- Port, host, database path, log level, WebSocket timeouts, pane limits

**backend/src/utils/:**
- `logger.ts`: Log level wrapper (info, warn, error, debug)
- `errors.ts`: Custom error classes with HTTP status codes
- Function: Centralize error handling and logging patterns

**frontend/src/components/:**
- `layout/`: Header, tabs, pane container, splitter, theme selector
- `terminal/`: Terminal pane, xterm.js wrapper, connection status, shell selector
- `session/`: Session list, save/import dialogs, restore interface
- `settings/`: User preferences UI
- `ui/`: Reusable UI elements (clipboard notification, context menu)

**frontend/src/stores/:**
- `session-store.ts`: Current session, windows, active window, saved sessions list
- `pane-store.ts`: Layout tree, pane map, active pane, zoom state, broadcast state
- `settings-store.ts`: Theme, font size, keybindings, shell preferences
- `keybinding-store.ts`: Loaded keybindings for command palette/help

**frontend/src/services/:**
- `websocket-client.ts`: WebSocket connection lifecycle, message routing, reconnection
- `session-api.ts`: REST client for session CRUD, import/export
- `keybinding-api.ts`: Fetch keybindings from backend
- `clipboard-service.ts`: System clipboard read/write
- `import-service.ts`: Import saved session data
- `export-service.ts`: Export current session to file

**frontend/src/hooks/:**
- `useWebSocket.ts`: Initialize WebSocket, return state + send methods
- `useMessageHandlers.ts`: Subscribe to WebSocket messages, update stores
- `useKeyBindings.ts`: Global keybinding capture and dispatch
- `useClipboard.ts`: Copy/paste operations
- `useCommandPrompt.ts`: Command palette state (command search/execute)
- `useCopyMode.ts`: Visual selection and copy mode toggle
- Others: utility hooks for formatting, animations, etc.

**shared/types/:**
- `models.ts`: Shared entity interfaces (Session, Window, Pane, Layout, etc.)
- `messages.ts`: WebSocket message type discriminated unions (ClientMessage, ServerMessage)
- `index.ts`: Re-exports for easy consumption

**shared/tmux/:**
- Tmux compatibility: command definitions, option parsing, target syntax
- Consumed by backend command service and frontend command palette

## Key File Locations

**Entry Points:**
- Backend: `backend/src/index.ts` (HTTP server, database init, graceful shutdown)
- Frontend: `frontend/src/main.tsx` (Vite entry) → `frontend/src/App.tsx` (root component)
- Shared: `shared/types/index.ts` (re-exports models, messages)

**Configuration:**
- Root workspaces: `package.json`
- Backend env: `backend/src/config/index.ts` (PORT, HOST, LOG_LEVEL, etc)
- Frontend Vite: `frontend/vite.config.ts`
- Linting: `eslint.config.js` (flat config, root level)
- Formatting: `.prettierrc` (2-space indent, single quotes, 100 char width)

**Core Logic:**
- Session persistence: `backend/src/services/session-service.ts`
- Layout tree: `backend/src/services/layout-service.ts`
- PTY management: `backend/src/services/pty-service.ts`
- WebSocket routing: `backend/src/api/websocket-server.ts`
- Terminal handlers: `backend/src/api/handlers/terminal-handler.ts`
- Session handlers: `backend/src/api/handlers/session-handler.ts`

**State Management:**
- Frontend session store: `frontend/src/stores/session-store.ts`
- Frontend pane store: `frontend/src/stores/pane-store.ts`
- Frontend settings store: `frontend/src/stores/settings-store.ts`

**Testing:**
- Backend: `backend/**/*.test.ts` or `backend/**/*.spec.ts` (co-located with source)
- Frontend: `frontend/**/*.test.tsx` or `frontend/**/*.spec.tsx` (co-located)
- Config: `vitest.config.ts` in each workspace

## Naming Conventions

**Files:**
- Handlers: `*-handler.ts` (e.g., `terminal-handler.ts`, `session-handler.ts`)
- Services: `*-service.ts` (e.g., `pty-service.ts`, `session-service.ts`)
- Stores: `*-store.ts` (e.g., `session-store.ts`, `pane-store.ts`)
- APIs: `*-api.ts` (e.g., `session-api.ts`, `keybinding-api.ts`)
- Hooks: `use*.ts` (camelCase with `use` prefix)
- Components: PascalCase, match export name (e.g., `TerminalPane.tsx` exports `TerminalPane`)
- Types: `*.ts` without suffix (e.g., `models.ts`, `messages.ts`)
- Utilities: `*-service.ts` or descriptive name (e.g., `errors.ts`, `logger.ts`)

**Directories:**
- Feature groups: kebab-case plural (e.g., `components/`, `services/`, `stores/`, `hooks/`)
- Sub-categories: kebab-case (e.g., `components/terminal/`, `components/session/`)

**Functions:**
- camelCase: `createSession()`, `splitLayout()`, `handleResize()`
- Async: no special prefix, but always return `Promise<T>`
- Event handlers: `on*` prefix (e.g., `onData()`, `onExit()`)
- Getters: plain names (e.g., `getPaneIds()`, `getDatabase()`)

**Variables:**
- camelCase: `sessionId`, `paneMap`, `isLoading`
- Constants: UPPER_SNAKE_CASE: `DEFAULT_COLS`, `HIGH_WATER_MARK`
- Private fields: prefix with `#` (TS private) or `private` keyword

**Types:**
- Interfaces/Types: PascalCase (e.g., `Session`, `PaneState`, `ClientMessage`)
- Unions: PascalCase (e.g., `ConnectionState`, `SplitDirection`)
- Type parameters: Single letter or meaningful (e.g., `T`, `K`, `V`)

## Where to Add New Code

**New Feature (e.g., window grouping):**
- Primary logic: `backend/src/services/` (e.g., `group-service.ts`)
- REST endpoints: `backend/src/api/routes/` (e.g., `groups.ts`)
- WebSocket handler: `backend/src/api/handlers/` (extend existing or new)
- Database schema: `backend/src/db/migrate.ts` (add migration)
- Shared types: `shared/types/models.ts` (add Group interface)
- Frontend store: `frontend/src/stores/` (e.g., `group-store.ts`)
- Frontend components: `frontend/src/components/` (e.g., `GroupPanel.tsx`)
- API client: `frontend/src/services/group-api.ts`

**New Component/Module:**
- Implementation: Follow feature location above
- Tests: Co-locate with source (e.g., `Service.test.ts` next to `service.ts`)
- Exports: Use barrel files in category directories (e.g., `components/index.ts`)

**Shared Utility (used by frontend and backend):**
- Shared types: `shared/types/` (e.g., `shared/types/utils.ts`)
- Shared helpers: `shared/types/` (can contain functions, not just types)
- Import in both: `import { helper } from '@webterm/shared'`

**Backend-only Utility:**
- Location: `backend/src/utils/` (e.g., `utils/path-resolver.ts`)
- Pattern: Export utility functions, no classes unless necessary

**Frontend-only Hook:**
- Location: `frontend/src/hooks/` (e.g., `useFormState.ts`)
- Pattern: Default export is the hook function
- Naming: `use*` prefix (React convention)

## Special Directories

**backend/data/:**
- Purpose: SQLite database file storage
- Generated: Yes (auto-created by `getDatabase()` if missing)
- Committed: No (in `.gitignore`)
- Production: Configurable via `WEBTERM_DB_PATH` env var

**backend/tmux-shim/:**
- Purpose: Shell scripts (tmux, tmux.cmd) for tmux compatibility
- Generated: No
- Committed: Yes
- Contains: Wrapper scripts that emulate tmux behavior

**frontend/dist/:**
- Purpose: Production build output (HTML, JS, CSS bundles)
- Generated: Yes (`npm run build`)
- Committed: No (in `.gitignore`)

**shared/dist/:**
- Purpose: TypeScript declaration files (.d.ts)
- Generated: Yes (`npm run build -w @webterm/shared`)
- Committed: No (in `.gitignore`)
- Note: Shared types are imported as raw `.ts` files in dev

**.planning/codebase/:**
- Purpose: GSD analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc)
- Generated: Yes (by GSD mapper)
- Committed: Yes
- Used by: GSD planner/executor for code generation context

---

*Structure analysis: 2026-03-23*
