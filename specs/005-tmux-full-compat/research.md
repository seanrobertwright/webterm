# Research: Full tmux Compatibility

**Phase 0 Output** | **Date**: 2026-02-22 | **Updated**: 2026-03-05

## R0: Critical Bug Investigation (Added 2026-03-03)

### Bug A: "+" Button Does Not Create New Window/Tab

**Decision**: Fix the callback clobbering between `useWebSocket` and `useMessageHandlers` that prevents `sessionId` from being set.

**Rationale**: The `useWebSocket` hook (line 129-135) calls `client.setCallbacks(...)` to register an `onMessage` handler that extracts `sessionId` from `connected` messages. But `useMessageHandlers` (line 188-190) subsequently calls `client.setCallbacks(...)` again, **overwriting** the previous callbacks. The `useMessageHandlers` `connected` case (line 22-25) is a no-op. Result: `sessionId` stays `null`, and `handleNewWindow` in App.tsx (line 232-236) silently exits because of the `if (sessionId)` guard.

**Fix approach**: Modify the WebSocket client to support a composable callback model (additive listeners) rather than the current "last writer wins" `setCallbacks`. Alternatively, have `useMessageHandlers` also set `sessionId` in the `connected` case by calling into `useWebSocket`'s state or a shared store.

**Simplest fix**: In `useMessageHandlers`, extract `sessionId` from the `connected` message and expose it via the session store or a callback, so App.tsx can access it independently. The `useWebSocket` hook's internal `sessionId` management should still work — the real fix is to make `setCallbacks` compose rather than replace.

**Alternatives considered**:
- Store sessionId in session-store: Adds coupling but solves immediately
- Merge hooks: Too large a refactor for a bug fix
- Event-based sessionId broadcast: Over-engineered

### Bug B: Ctrl+B Prefix Keybindings Not Working

**Decision**: The keybinding fallback path works correctly. The issue is downstream — actions like `newWindow` depend on `sessionId` which is null (Bug A). Other actions depending on `activePane` (split, navigate, close, zoom) may work if `activePane` is set.

**Rationale**: Code trace confirms prefix mode enters/exits correctly in the fallback path. `FALLBACK_BINDINGS` (line 156-176) has correct key definitions. `matchesBindingInPrefixMode` logic is correct for standard keys. The `handleKeybindingAction` switch in App.tsx processes actions correctly — but `newWindow` requires `sessionId`, which is null.

**Fix approach**: Fix Bug A first, then verify all keybindings work. If any still fail, investigate:
1. Whether `globalThis.webtermKeyHandler` is set at the time of key press
2. Whether the terminal's `attachCustomKeyEventHandler` is registered
3. Whether `_webtermHandled` flag causes any double-processing issues

### Bug D: "New Session" Creates Duplicate Window, Not New Session (Added 2026-03-05)

**Decision**: Implement true multi-session support on the frontend by adding `switchSession()` to WebSocketClient, store reset actions, and proper `handleNewSession`/`handleRestoreSession` in App.tsx.

**Root cause**: `App.tsx:415` wires `<SessionPanel onNewSession={handleNewWindow} />`. `handleNewWindow` sends `createWindow` for the *current* session — it never creates a new session. No `handleNewSession` function exists anywhere in the frontend. The `handleRestoreSession` is a stub with a TODO comment.

**Contributing factors**:
1. **Singleton WebSocket blocks session switching**: `WebSocketClient.connect()` (line 94-97) early-returns if already connected. There's no `switchSession()` method.
2. **Session deletion kills active session**: `SessionPanel.handleDelete` calls `DELETE /api/v1/sessions/:id`. The backend's `sessionService.deleteSession()` kills all PTYs via cascade. The panel doesn't prevent deleting the *currently active* session.
3. **Backend route data mismatch**: `handleDeleteSession` in `routes/sessions.ts:268` uses `store.sessions.delete(id)` (in-memory), but session data lives in SQLite via `session-service.ts`. Deleting from the in-memory store doesn't clean up PTYs or DB records.

**Fix approach** (6 changes):
1. Add `switchSession(newSessionId)` to `WebSocketClient` — disconnects then reconnects
2. Add `resetForSessionSwitch()` to session-store and pane-store — clears session-specific state
3. Implement `handleNewSession` in App.tsx — calls `POST /api/v1/sessions`, resets stores, switches WS
4. Implement `handleRestoreSession` in App.tsx — resets stores, switches WS to existing session
5. Guard active session deletion in SessionPanel — disable delete on currently active session
6. Fix `connect()` guard — allow reconnection when session ID differs

**Alternatives considered**:
- Multiple concurrent WebSocket connections: Over-engineered; only one session visible at a time
- Server-side session switching message: Fragile; requires re-wiring PTY event handlers mid-connection
- Full store reset (new instances): Would break all existing Zustand subscriptions

### Bug C: Keybinding Store Never Loaded from Backend

**Decision**: Add a REST endpoint `GET /api/v1/keybindings` and frontend fetch-on-mount to populate the keybinding store.

**Rationale**: `keybinding-store.ts` has `loaded: false` as initial state. `setAllTables`/`setLoaded` are defined but never called. Backend's `KeyBindingService` has full CRUD with SQLite persistence + default bindings. But no API route exposes this data and no frontend code fetches it. Until loaded, the store falls back to `FALLBACK_BINDINGS` — which works but prevents user customization.

**Fix approach**:
1. Add REST route `GET /api/v1/keybindings` in `backend/src/api/routes/`
2. Add frontend service function to fetch keybindings
3. Call in App.tsx on mount, populate store via `setAllTables`

**Alternatives considered**:
- Include in WebSocket `connected` payload: Couples keybindings to connection lifecycle
- Hardcode defaults only: Works but blocks user customization feature

---

## R1: Copy Mode Implementation in xterm.js

**Decision**: Build a custom copy mode as a React hook (`useCopyMode`) that intercepts keyboard input via `attachCustomKeyEventHandler`, maintains a virtual cursor in JS state, and uses xterm.js programmatic selection APIs + Decoration API for visual feedback.

**Rationale**: xterm.js has no built-in copy mode or vi-navigation. However, it provides all the low-level primitives needed: buffer line-by-line access (`buf.getLine(y).translateToString()`), programmatic selection (`terminal.select(col, row, length)`), scroll control (`scrollToLine`), and the Decoration API for cursor rendering. The existing SearchAddon demonstrates the pattern of reading the buffer and creating decorations.

**Alternatives considered**:
- Third-party addon: None exists for vi-mode copy. No `@xterm/addon-copy-mode`.
- Server-side copy mode: Would require sending every keystroke over WebSocket and streaming buffer content back. Adds latency and complexity. Client-side is simpler since xterm.js already has the full buffer.
- Reuse SearchAddon for search: Yes, delegate `/` and `?` search to the existing SearchAddon's `findNext`/`findPrevious` methods rather than reimplementing regex search.

**Key APIs**:
- `terminal.attachCustomKeyEventHandler(fn)` — return `false` to block PTY input during copy mode
- `terminal.buffer.active.getLine(y).translateToString(true)` — read buffer content line by line
- `terminal.select(column, row, length)` — programmatic selection (row = absolute buffer index)
- `terminal.selectLines(startRow, endRow)` — line-mode selection
- `terminal.getSelection()` — get selected text as string
- `terminal.registerMarker(offset)` + `terminal.registerDecoration({marker, x, width, backgroundColor})` — render copy mode cursor
- `terminal.scrollToLine(n)` — follow virtual cursor through scrollback

**Pitfalls**:
- `registerMarker` offset is relative to PTY cursor, not absolute — must recalculate on each move
- Must exit copy mode on alt-screen switch (`terminal.buffer.onBufferChange`)
- Decoration API requires `allowProposedApi: true` (already set in project)
- WebGL renderer uses overlay divs for decorations (works fine for cursor indicator)

---

## R2: Command Parser Architecture

**Decision**: Hand-written tokenizer + declarative command registry with schema-driven flag resolution. No third-party parsing libraries.

**Rationale**: Generic CLI parsers (yargs-parser, minimist) require the flag schema before parsing, but tmux-style parsing discovers the schema from the command name (token[0]). A hand-written tokenizer (~50 lines) and registry-driven parser (~80 lines) give precise control over tmux flag conventions while supporting tab-completion natively.

**Alternatives considered**:
- `yargs-parser` / `minimist`: Cannot handle per-command flag schemas or tmux's flag clustering (`-hD`). No completion API.
- PEG parser (chevrotain, peggy): Overpowered for this use case. The grammar is simple enough for hand-written parsing.
- Full tmux parser replication: Out of scope per clarification (no `\;` chaining, `{}` braces, `if-shell`).

**Architecture**:
1. **Tokenizer** (`shared/`): Shell-like string splitting with quote handling. Produces `string[]` tokens.
2. **CommandRegistry** (`shared/`): Map of command name/alias → `CommandDef` with `FlagDef[]` (each flag declares `takesValue: boolean`) and `ArgDef[]` (with `completionKind` metadata).
3. **Parser**: Consumes tokens, resolves flags against command's `FlagDef[]`, produces `ParsedCommand { command, flags: Map, positional: string[], target: TmuxTarget }`.
4. **Target parser**: Dedicated regex parser for `session:window.pane` specifiers.
5. **Action lifter**: `liftAction(ParsedCommand) → TmuxCommandAction` — maps runtime parse result to strongly-typed discriminated union (matches existing `KeybindingAction` pattern).
6. **Completion**: `registry.complete(partial)` returns typed `CompletionResult` for the frontend autocomplete UI.

**Placement**: All parser code in `shared/` (consumed by both backend for execution and frontend for autocomplete).

---

## R3: Foreground Process Detection for Auto-Rename

**Decision**: Hybrid three-tier approach: (1) Poll `pty.process` on Linux/macOS at 500ms, (2) Intercept OSC 0/2 title escape sequences from PTY output on all platforms, (3) Use `windows-process-tree` package on Windows as fallback.

**Rationale**: `pty.process` (from `@lydell/node-pty`) calls `tcgetpgrp()` + `/proc` reads natively on Linux/macOS — the exact same mechanism tmux uses. It returns the foreground process name reliably. On Windows, ConPTY does not expose foreground process info, so `pty.process` is static. The OSC escape sequence approach works cross-platform because modern shells emit `OSC 0;title` sequences that xterm.js can detect.

**Alternatives considered**:
- Pure OSC-only approach: Most reliable cross-platform, but requires shells to emit title sequences (not all do by default).
- `ps` command polling: Spawns a child process every 500ms. Too expensive.
- Event-driven only: No event exists; polling is required for `pty.process`.

**Platform behavior**:
| Platform | `pty.process` | Polling | OSC fallback |
|----------|--------------|---------|--------------|
| Linux | Works (tcgetpgrp + /proc) | 500ms | Yes |
| macOS | Works (proc_pidinfo) | 500ms | Yes |
| Windows | Static (always returns shell name) | `windows-process-tree` at 1s | Yes (recommended primary) |

**tmux comparison**: tmux polls at `status-interval` (default 15s, typically set to 1s). WebTerm's 500ms is more responsive.

**Implementation**: In `pty-service.ts`, add a title polling interval per PTY (Linux/macOS only). Parse OSC 0/2 from PTY output stream on all platforms. Add `paneTitleChanged` server→client message. Frontend `useMessageHandlers` updates window name.

---

## R4: Preset Layout Algorithms

**Decision**: Implement five layout algorithms as pure functions that take a pane count and container dimensions, returning a `Layout` tree.

**Rationale**: Each preset layout has a well-defined algorithm:

- **even-horizontal**: All panes side-by-side, equal widths. Single `horizontal` node with `sizes = [1/n, 1/n, ...]`.
- **even-vertical**: All panes stacked, equal heights. Single `vertical` node with `sizes = [1/n, 1/n, ...]`.
- **main-horizontal**: First pane at top (50% height), remaining panes split horizontally below. Vertical root with 2 children: leaf (main pane) + horizontal node (others).
- **main-vertical**: First pane on left (50% width), remaining panes stacked vertically on right. Horizontal root with 2 children: leaf (main pane) + vertical node (others).
- **tiled**: Grid layout. Calculate `cols = ceil(sqrt(n))`, `rows = ceil(n/cols)`. Vertical root with `rows` horizontal children.

**Placement**: In `backend/src/services/layout-service.ts` alongside existing layout operations.

---

## R5: Multi-Client WebSocket Architecture

**Decision**: Extend the existing WebSocket server to support multiple connections per session. Each connection is a "client" that can independently set its active pane. The server broadcasts PTY output to all clients attached to a session.

**Rationale**: The existing `websocket-server.ts` already maps one WebSocket connection to one session. Multi-client requires changing this to a one-to-many mapping: one session can have many WebSocket connections. Each client maintains its own view state (active window, focused pane) but shares the session's PTY processes.

**Key changes**:
- Connection map changes from `Map<WebSocket, SessionInfo>` to tracking multiple connections per session
- PTY output broadcasts to all connected clients for the same session
- Input from any client goes to the shared PTY
- Each client can independently navigate windows (unless following mode is enabled)
- Read-only flag per client prevents input forwarding

---

## R6: Status Bar Rendering

**Decision**: Implement the status bar as a React component rendered outside the xterm.js terminal, using the format string system for dynamic content. The status bar is a standard HTML element with CSS styling, not rendered inside the terminal.

**Rationale**: xterm.js renders inside a canvas (WebGL). Putting the status bar inside the terminal would require complex canvas manipulation. A separate React component below/above the terminal container is simpler, more flexible for styling, and allows direct React state management for dynamic updates.

**Structure**: Three-section layout (left | center/window-list | right) with configurable content via format strings. Window list is interactive (clickable for mouse mode). Refresh interval configurable via `status-interval` option.

---

## R7: Format String Parser

**Decision**: Implement a simple template parser supporting `#{variable_name}` substitution and `#{?condition,true_value,false_value}` conditionals. Start with ~20 most-used variables.

**Rationale**: The full tmux format system has 170+ variables and complex operators. Starting with the most commonly used variables covers 90%+ of real configs. The parser is a simple string scanner that finds `#{...}` patterns and resolves them from a context object.

**Initial variables**: `session_name`, `window_index`, `window_name`, `window_active`, `window_flags`, `pane_current_command`, `pane_current_path`, `pane_active`, `pane_index`, `host`, `host_short`, `pane_width`, `pane_height`, `window_panes`, `session_windows`, `pane_synchronized`, `window_zoomed_flag`, `client_width`, `client_height`.

**Time formatting**: Support `%H`, `%M`, `%S`, `%Y`, `%m`, `%d` strftime-style codes for the status bar clock.
