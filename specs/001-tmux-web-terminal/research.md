# Research: Web Terminal Multiplexer (WebTerm)

**Branch**: `001-tmux-web-terminal`  
**Date**: 2026-02-17  
**Status**: Complete

## Research Overview

This document consolidates research findings for all technology choices and resolves NEEDS CLARIFICATION items from the Technical Context.

---

## 1. Terminal Emulation (xterm.js)

### Decision
Use `@xterm/xterm` v6.0.0 with WebGL renderer and essential addons.

### Rationale
- Industry standard (powers VS Code terminal)
- Full VT100/VT220/xterm emulation with automatic ANSI sequence parsing
- WebGL renderer essential for high-throughput (1000+ lines/sec)
- React integration via `useRef` + `useEffect` pattern

### Key Findings
- **React integration**: Use `useRef` for terminal instance, `useEffect` for lifecycle, always call `dispose()` on cleanup
- **Renderer**: WebGL by default (`@xterm/addon-webgl`), handles context loss gracefully
- **Scrollback**: 10,000 lines ≈ 1-2MB memory—acceptable within 200MB constraint
- **Resize**: Use `@xterm/addon-fit` with debounced `ResizeObserver`
- **Input**: `onData` for PTY forwarding; `attachCustomKeyEventHandler` for tmux prefix key interception
- **Performance**: Enable flow control (watermark-based), disable cursor blink during high output

### Essential Addons
| Addon | Purpose |
|-------|---------|
| `@xterm/addon-fit` | Auto-fit terminal to container |
| `@xterm/addon-webgl` | GPU-accelerated rendering |
| `@xterm/addon-web-links` | Clickable URLs |
| `@xterm/addon-search` | Find in terminal buffer |
| `@xterm/addon-serialize` | Save/restore terminal state |

### Alternatives Considered
- **Custom terminal renderer**: Rejected—reinventing the wheel, massive effort
- **Hyper terminal**: Rejected—Electron-based, not embeddable

---

## 2. PTY Management (node-pty)

### Decision
Use `node-pty` v1.1.0 for cross-platform pseudo-terminal spawning.

### Rationale
- Microsoft-maintained, powers VS Code terminal
- ConPTY backend on Windows (modern, full ANSI support)
- Unified API across Windows/Linux/macOS

### Key Findings
- **Windows shells**: Use `powershell.exe` or `pwsh.exe` over `cmd.exe` (ConPTY optimized)
- **Unix shells**: Respect `$SHELL` env var, fallback to `/bin/bash`
- **Environment**: MUST include `SystemRoot` on Windows (PowerShell fails without it)
- **Input**: Use `\r` (carriage return) for Enter, not `\n`
- **Resize**: `pty.resize(cols, rows)` syncs PTY dimensions
- **Cleanup**: Call `kill()` and listen to `onExit`; process tree kill on Windows requires `taskkill`
- **Buffer sync**: Call `pty.clear()` when frontend buffer is cleared

### Shell Detection Pattern
```typescript
function getDefaultShell(): string {
  if (os.platform() === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }
  return process.env.SHELL || '/bin/bash';
}
```

### Alternatives Considered
- **pty.js**: Rejected—abandoned, node-pty is the successor
- **SSH-based**: Rejected—adds complexity for local deployment use case

---

## 3. WebSocket Communication (ws)

### Decision
Use `ws` v8.19.0 with single multiplexed connection and binary message protocol.

### Rationale
- Most widely used Node.js WebSocket library (~50M weekly downloads)
- Native `http.Server` integration enables port sharing
- Binary protocol avoids JSON parsing overhead at high throughput

### Key Findings
- **Multiplexing**: Single WebSocket per browser tab, messages include `paneId` for routing
- **Message format**: Binary `[type:1][paneId:16][payload:N]` for output; JSON for control messages
- **Reconnection**: Stateful sessions with output buffering during disconnect, exponential backoff
- **Flow control**: Backpressure via `bufferedAmount` + PTY pause/resume
- **Heartbeat**: Server ping every 30s, 10s timeout, auto-pong from client

### Message Types
| Type | Code | Payload |
|------|------|---------|
| Input | 0x01 | Raw bytes to PTY |
| Output | 0x02 | Raw bytes from PTY |
| Resize | 0x03 | JSON `{cols, rows}` |
| Control | 0xFF | JSON for create/destroy/etc |

### Alternatives Considered
- **Socket.io**: Rejected—adds abstraction overhead, unnecessary for this use case
- **SSE + HTTP POST**: Rejected—two connections, higher latency for input

---

## 4. Session Persistence (better-sqlite3)

### Decision
Use `better-sqlite3` v12.6.2 with WAL mode for session and layout persistence.

### Rationale
- Synchronous API is 2-24x faster than async alternatives
- Simple file-based storage perfect for single-user local deployment
- JSON column support for flexible layout storage

### Key Findings
- **Setup**: Enable WAL mode immediately after connection
- **Schema**: Sessions → Windows → Panes hierarchy with foreign keys
- **JSON storage**: TEXT column with `JSON.stringify/parse` in application layer
- **Transactions**: Use `db.transaction()` wrapper for atomic multi-table operations
- **Performance**: WAL mode + 32MB cache + prepared statements
- **Error handling**: Catch `SqliteError`, check `.code` for specific errors

### Essential Pragmas
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 32000;
```

### Alternatives Considered
- **localStorage**: Rejected—client-only, lost on browser data clear
- **JSON file**: Rejected—no transactions, corruption risk on crash

---

## 5. Frontend Stack (Vite + React + GlitchCN/UI)

### Decision
Use Vite v6.x with React 19 and GlitchCN/UI component library.

### Rationale
- Vite provides fast HMR and optimized production builds
- GlitchCN/UI offers cyberpunk/terminal aesthetic perfect for the application
- shadcn-based means copy-paste components, minimal bundle impact

### Key Findings
- **GlitchCN/UI**: 142KB bundle, 12 components (Cards, Buttons, Alerts, Tables, Dialogs, Inputs, Progress, Tabs)
- **Installation**: `npx shadcn@latest add @glitchcn/all`
- **Styling**: Terminal/cyberpunk theme built-in, React-ready, TypeScript support
- **Total bundle estimate**: GlitchCN (~142KB) + xterm.js (~150KB) + React (~45KB) + app code ≈ 400KB < 500KB limit

### Alternatives Considered
- **shadcn/ui vanilla**: Missing terminal aesthetic that fits the application
- **Material UI**: Too heavy, wrong aesthetic

---

## 6. Keybinding System

### Decision
Implement tmux-like prefix key system (Ctrl+B) with configurable bindings.

### Rationale
- User requested tmux-like experience
- Prefix key prevents conflicts with terminal application shortcuts
- Power users already familiar with tmux conventions

### Key Bindings (Default)
| Binding | Action |
|---------|--------|
| Ctrl+B % | Vertical split |
| Ctrl+B " | Horizontal split |
| Ctrl+B ← | Focus left pane |
| Ctrl+B → | Focus right pane |
| Ctrl+B ↑ | Focus up pane |
| Ctrl+B ↓ | Focus down pane |
| Ctrl+B x | Close current pane |
| Ctrl+B z | Toggle pane zoom |
| Ctrl+B c | Create new window |
| Ctrl+B n | Next window |
| Ctrl+B p | Previous window |
| Ctrl+B : | Command mode (future) |

### Implementation Approach
- xterm.js `attachCustomKeyEventHandler` captures Ctrl+B
- Enter "prefix mode" and capture next key
- Dispatch action based on key combination
- Visual indicator (border color change) shows prefix mode active

---

## 7. Performance Strategy

### Decision
Layered performance optimization targeting all Constitution requirements.

### Targets vs Approach
| Target | Constitution Req | Approach |
|--------|-----------------|----------|
| Initial load <2s | IV. Performance | Vite code splitting, lazy-load non-critical |
| Input latency <50ms | IV. Performance | Direct WebSocket binary, no framework overhead in hot path |
| Memory <200MB | IV. Performance | 10K scrollback limit, WebGL renderer, dispose unused terminals |
| 60fps render | IV. Performance | WebGL renderer, batched writes |
| Bundle <500KB | IV. Performance | GlitchCN (142KB) + xterm (150KB) + React (45KB) ≈ 400KB |
| 1000 lines/sec | Spec SC-008 | Flow control, watermark-based backpressure |

---

## 8. Testing Strategy

### Decision
Three-tier testing: Vitest (unit), Vitest (integration), Playwright (E2E).

### Rationale
- All tools work with TypeScript and Vite
- Vitest provides fast feedback for unit and integration tests
- Playwright enables real browser testing for terminal interaction

### Coverage Mapping
| Component | Test Type | Focus |
|-----------|-----------|-------|
| PTY Service | Unit | Shell detection, resize, cleanup |
| Session Service | Unit | CRUD operations, transactions |
| WebSocket Handler | Integration | Message routing, reconnection |
| Terminal Component | E2E | Input/output, ANSI rendering |
| Pane Splitting | E2E | Layout creation, resize, navigation |
| Keybindings | E2E | Prefix key, action dispatch |

---

## Summary: All Clarifications Resolved

| Item | Resolution |
|------|------------|
| Terminal emulation library | @xterm/xterm v6.0.0 |
| PTY management | node-pty v1.1.0 |
| WebSocket library | ws v8.19.0 |
| Database | better-sqlite3 v12.6.2 |
| Build tool | Vite v6.x |
| UI framework | React 19 + GlitchCN/UI |
| Message protocol | Binary for I/O, JSON for control |
| Shell support | Windows (PowerShell, CMD), Unix (bash, $SHELL) |
| Keybinding scheme | tmux-like with Ctrl+B prefix |
| Session storage | SQLite with WAL mode |
