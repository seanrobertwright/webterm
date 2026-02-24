# Quickstart: Full tmux Compatibility

**Phase 1 Output** | **Date**: 2026-02-22

## Prerequisites

- Node.js 20+ with npm workspaces
- Existing WebTerm dev environment (`npm install` completed)
- Familiarity with tmux concepts (sessions, windows, panes, key tables, options)

## Dev Environment

```bash
# Start dev servers (backend + frontend)
npm run dev

# Run tests for a specific workspace
npm run test -w @webterm/backend
npm run test -w @webterm/frontend

# Type check all workspaces
npm run typecheck
```

## Key File Locations

### Shared (consumed by both backend and frontend)

| Path | Purpose |
|------|---------|
| `shared/types/messages.ts` | WebSocket message types (add new Client/ServerMessage variants here) |
| `shared/types/models.ts` | Data model interfaces (Session, Window, Pane, Layout, etc.) |
| `shared/tmux/command-registry.ts` | **NEW** — Command definitions, parser, tokenizer |
| `shared/tmux/format-parser.ts` | **NEW** — Format string `#{variable}` parser |
| `shared/tmux/option-definitions.ts` | **NEW** — Option name → type/default/scope catalog |

### Backend

| Path | Purpose |
|------|---------|
| `backend/src/services/session-service.ts` | Session/window/pane CRUD (extend for new fields) |
| `backend/src/services/layout-service.ts` | Layout tree ops (add preset layout algorithms) |
| `backend/src/services/pty-service.ts` | PTY management (add title polling, OSC parsing) |
| `backend/src/services/websocket-server.ts` | WebSocket routing (add new message handlers) |
| `backend/src/services/command-service.ts` | **NEW** — Command execution engine |
| `backend/src/services/keybinding-service.ts` | **NEW** — Key binding storage and lookup |
| `backend/src/services/option-service.ts` | **NEW** — Hierarchical option resolution |
| `backend/src/services/hook-service.ts` | **NEW** — Hook registration and lifecycle events |
| `backend/src/services/paste-buffer-service.ts` | **NEW** — In-memory paste buffer stack |
| `backend/src/db/schema.sql` | Database schema (add key_bindings, options, hooks tables) |

### Frontend

| Path | Purpose |
|------|---------|
| `frontend/src/hooks/useKeyBindings.ts` | Key binding handler (replace hardcoded bindings with registry) |
| `frontend/src/hooks/useCopyMode.ts` | **NEW** — Vi-mode copy mode (virtual cursor, selection, yank) |
| `frontend/src/hooks/useCommandPrompt.ts` | **NEW** — `:` command prompt with autocomplete |
| `frontend/src/components/StatusBar.tsx` | **NEW** — tmux-style status bar (left | windows | right) |
| `frontend/src/components/CommandPrompt.tsx` | **NEW** — Overlay command input with completions |
| `frontend/src/components/ChooseTree.tsx` | **NEW** — Interactive session/window/pane browser |
| `frontend/src/components/DisplayPanes.tsx` | **NEW** — Pane number overlay |
| `frontend/src/stores/session-store.ts` | Zustand store (extend for multi-session, options state) |

## Architecture Patterns

### Adding a New tmux Command

1. **Define** the command in `shared/tmux/command-registry.ts`:
   ```typescript
   registry.register({
     name: 'new-window',
     aliases: ['neww'],
     description: 'Create a new window',
     flags: [
       { short: 'n', takesValue: true, description: 'Window name' },
       { short: 't', takesValue: true, description: 'Target session' },
     ],
     args: [],
   });
   ```

2. **Handle** in `backend/src/services/command-service.ts`:
   ```typescript
   case 'new-window': {
     const name = parsed.flags.get('n') as string | undefined;
     // ... create window via session-service
   }
   ```

3. **Add WebSocket message** (if needed) in `shared/types/messages.ts` and handler in `websocket-server.ts`.

### Adding a New Option

1. **Define** in `shared/tmux/option-definitions.ts` with name, type, default, scope, and description.
2. **Store/resolve** via `option-service.ts` which walks the scope hierarchy.
3. **Notify clients** via `optionChanged` server message when values change.

### Copy Mode Flow

1. User presses `Prefix [` → frontend enters copy mode
2. `useCopyMode` hook intercepts all keyboard input via `attachCustomKeyEventHandler`
3. Virtual cursor maintained in React state, rendered via xterm.js Decoration API
4. Selection tracked and applied via `terminal.select()` / `terminal.selectLines()`
5. On yank (`Enter`/`y`), selection text sent to backend as paste buffer, exits copy mode

### Command Prompt Flow

1. User presses `Prefix :` → frontend shows command prompt overlay
2. Typing triggers `registry.complete(partial)` for autocomplete suggestions
3. On submit, `executeCommand` message sent to backend
4. Backend parses via shared `CommandRegistry`, executes via `command-service.ts`
5. Backend responds with `commandResult` or `commandError`

## Database Migrations

Three new tables and column additions to existing tables. See `data-model.md` for full DDL. Run migrations before testing new features:

```sql
-- New tables: key_bindings, options, hooks
-- Altered tables: sessions (+last_window_id), windows (+auto_rename, +last_active_at, +monitor_*), panes (+title, +marked)
```

## Testing Strategy

- **Unit tests**: Command parser tokenizer, format string parser, option resolution, layout algorithms
- **Integration tests**: Command execution end-to-end, WebSocket message roundtrips, copy mode selection
- **E2E tests**: Key binding workflows, command prompt interaction, status bar rendering
- **Coverage target**: 80% per constitution
