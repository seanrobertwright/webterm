# External Integrations

**Analysis Date:** 2026-03-23

## APIs & External Services

**None detected.**

This codebase does not integrate with external APIs, cloud services (AWS, GCP, Azure), or third-party SaaS platforms. All functionality is self-contained.

## Data Storage

**Databases:**
- SQLite (local file-based)
  - Client: `better-sqlite3` 12.6.2
  - Location: `./data/webterm.db` (dev) or `~/.webterm/data/webterm.db` (production)
  - Configuration: `backend/src/db/database.ts`
  - WAL mode enabled for concurrent access
  - Foreign key constraints enabled
  - Schema migrations in `backend/src/db/migrate.ts`

**File Storage:**
- Local filesystem only
- No cloud storage integration
- No object storage (S3, GCS, etc.)

**Caching:**
- None - WebSocket-driven real-time communication, no HTTP caching layer
- SQLite in-memory cache configurable via pragma

## Authentication & Identity

**Auth Provider:**
- Custom/None - No authentication provider
- Implementation approach:
  - Sessions identified by `sessionId` parameter in WebSocket connection (`/ws?sessionId=...`)
  - No login/authentication mechanism
  - All sessions and panes are accessible within the same server instance
  - Suitable for single-user or trusted network scenarios

**Security Notes:**
- WebSocket connections are unencrypted (ws://, not wss://)
- No user isolation - consider adding authentication for multi-user deployments
- See CONCERNS.md for security considerations

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service
- Errors logged locally via `backend/src/utils/logger.ts`

**Logs:**
- Console-based logging with configurable level (`LOG_LEVEL` env var)
- No structured logging or log aggregation
- No remote log shipping

**Health Check:**
- HTTP endpoint at `/health` for basic server health
- Route: `backend/src/api/routes/health.ts`

## CI/CD & Deployment

**Hosting:**
- Self-hosted (any Node.js 20+ environment)
- Docker support with multi-stage Dockerfile:
  - `dev-backend` - Development backend with hot reload
  - `dev-frontend` - Development frontend with HMR
  - `prod` - Optimized production build
- `docker-compose.yml` for local dev environment

**CI Pipeline:**
- None detected in codebase
- No GitHub Actions, GitLab CI, or other CI/CD configuration

**Deployment Model:**
- Backend serves both REST API and frontend static files in production
- Single Node.js process (no clustering)
- Database persists to local filesystem

## Environment Configuration

**Required env vars (minimal):**
- `PORT` - Server port (defaults to 9174 if not set)
- `HOST` - Bind host (defaults to localhost)

**Optional env vars:**
- `WEBTERM_DB_PATH` - Database file location
- `WEBTERM_DATA_DIR` - Data directory in production
- `NODE_ENV` - 'production' or 'development'
- `LOG_LEVEL` - debug/info/warn/error
- `BACKEND_HOST` - Frontend proxy target (Docker dev)
- `WS_HEARTBEAT_INTERVAL` - Heartbeat timing
- `WS_HEARTBEAT_TIMEOUT` - Heartbeat timeout
- `MAX_PANES_PER_WINDOW` - Pane limit
- `PTY_BUFFER_SIZE` - Output buffer size

**Secrets location:**
- No secrets required or expected
- `.env` files in `.gitignore` (if used for local overrides)
- Consider adding `.env` support for future auth/API keys

## Webhooks & Callbacks

**Incoming:**
- None - No webhook receivers implemented

**Outgoing:**
- None - No webhook senders implemented
- Command hooks available locally: `backend/src/services/hook-service.ts` (internal only)

## Communication Protocols

**WebSocket:**
- Connection: `ws://host:port/ws?sessionId=...`
- Binary protocol for terminal I/O:
  - Format: `[type:1][paneIdLen:1][paneId:N][payload:M]`
  - Type 0x01: INPUT (client → server)
  - Type 0x02: OUTPUT (server → client)
- JSON protocol for control messages:
  - Types: resize, split, create, close, focus, broadcast, createWindow, closeWindow, renameWindow, etc.
  - Defined in `shared/types/messages.ts`

**REST API:**
- Routes in `backend/src/api/routes/`:
  - `/api/v1/sessions` - Session CRUD
  - `/api/v1/system` - System info
  - `/api/v1/commands` - tmux command emulation
  - `/api/v1/keybindings` - Keybinding config
  - `/health` - Health check
- Response format: JSON
- No authentication on API endpoints

## Terminal Multiplexing Compatibility

**tmux Emulation:**
- Partial tmux command compatibility for CLI scripting
- Implementation: `backend/src/services/command-service.ts`
- Command definitions: `shared/tmux/command-defs.ts`
- Target parser: `shared/tmux/target-parser.ts`
- Shims provided: `backend/src/tmux-shim/` (tmux/tmux.cmd for path masking)

---

*Integration audit: 2026-03-23*
