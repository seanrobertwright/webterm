# Implementation Plan: Frontend Multi-Session Support

**Branch**: `005-tmux-full-compat` | **Date**: 2026-03-05 | **Spec**: [spec.md](./spec.md)
**Input**: Root cause analysis of session duplication and cascade-deletion bugs

## Summary

The frontend has no true multi-session support. "New Session" creates a window tab (not a session), the singleton WebSocket client cannot switch sessions, and deleting any session from the panel kills the active session's PTYs. This plan fixes session lifecycle on the frontend: proper creation, switching, independent deletion, and detach/attach semantics.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, ESM)
**Primary Dependencies**: React 19, Zustand (state), xterm.js (terminal), Vite (build)
**Storage**: SQLite via better-sqlite3 (backend); Zustand stores (frontend)
**Testing**: Vitest (unit/integration), Playwright (E2E)
**Target Platform**: Modern browsers (Chrome, Firefox, Edge, Safari)
**Project Type**: Web application (monorepo: backend + frontend + shared)
**Performance Goals**: <50ms input latency, <100ms session switch
**Constraints**: Single WebSocket connection per browser tab (singleton pattern)
**Scale/Scope**: Typical usage 1-10 concurrent sessions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality - Modularity | PASS | Changes scoped to websocket-client, session-store, App.tsx, SessionPanel |
| I. Code Quality - Type Safety | PASS | All new APIs will use strict TypeScript types |
| II. Testing - Unit Tests | PASS | New session lifecycle functions will have unit tests |
| II. Testing - Integration Tests | PASS | WebSocket reconnect flow needs integration test |
| III. UX - Responsive Feedback | PASS | Session switch must show loading state during reconnect |
| III. UX - Keyboard Navigation | PASS | Session switching via keybinding (tmux `(` / `)`) |
| IV. Performance - Input Latency | PASS | Session switch is a disconnect/reconnect; no impact on steady-state latency |

No violations. Gate passes.

## Root Cause Analysis

### Bug 1: New session duplicates first session

**Location**: `frontend/src/App.tsx:415`
```tsx
<SessionPanel onNewSession={handleNewWindow} />
```

`handleNewWindow` sends `createWindow` for the *current* session. There is no `handleNewSession` function. The frontend has no code to:
1. Call `POST /api/v1/sessions` to create a new backend session
2. Disconnect the current WebSocket
3. Reconnect with the new session ID
4. Reset frontend stores (pane-store, session-store)

### Bug 2: Closing one session terminates all

**Locations**:
- `frontend/src/components/session/SessionPanel.tsx:42-49` — `handleDelete` calls `DELETE /api/v1/sessions/:id`
- `backend/src/services/session-service.ts:309-329` — `deleteSession` kills all PTYs and cascade-deletes
- The SessionPanel lists *all* sessions including the *active* one. Deleting the active session destroys the live connection.

**Contributing factor**: `backend/src/api/routes/sessions.ts:245-274` — `handleDeleteSession` uses an in-memory store (`store.sessions.delete`) that's separate from `session-service.ts` which uses SQLite. There may be a data-source mismatch.

### Bug 3: Restore is a no-op

**Location**: `frontend/src/App.tsx:307-315`
```tsx
const handleRestoreSession = useCallback(async (restoreSessionId: string) => {
  const session = await fetchSession(restoreSessionId);
  // TODO: Switch WebSocket to the restored session
  console.log('[App] Session restored:', session.id);
}, []);
```

### Structural Issue: Singleton WebSocket blocks session switching

**Location**: `frontend/src/services/websocket-client.ts:94-97`
```tsx
connect(sessionId?: string): void {
  if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
    return; // ← silently refuses to switch sessions
  }
```

The `connect()` method early-returns if already connected. There is no `switchSession()` or `reconnect()` method.

## Project Structure

### Documentation (this feature)

```text
specs/005-tmux-full-compat/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (affected files)

```text
frontend/
├── src/
│   ├── App.tsx                              # Wire new session handlers
│   ├── services/
│   │   ├── websocket-client.ts              # Add switchSession(), fix connect() guard
│   │   └── session-api.ts                   # Already has createSession/deleteSession (OK)
│   ├── stores/
│   │   ├── session-store.ts                 # Add resetForSessionSwitch action
│   │   └── pane-store.ts                    # Add reset action for session switch
│   ├── hooks/
│   │   └── useWebSocket.ts                  # Expose switchSession from hook
│   └── components/
│       └── session/
│           └── SessionPanel.tsx             # Fix onNewSession, guard active session delete

backend/
├── src/
│   ├── api/
│   │   ├── routes/sessions.ts               # Investigate store vs service mismatch
│   │   └── websocket-server.ts              # Verify clean disconnect/reconnect
│   └── services/
│       └── session-service.ts               # Already correct (creates unique sessions)
```

## Design

### Change 1: Add `switchSession()` to WebSocketClient

Add a method that disconnects the current WebSocket and reconnects with a new session ID. Unlike `connect()`, this method explicitly closes the existing connection first.

```typescript
switchSession(newSessionId: string): void {
  this.disconnect();
  this.connect(newSessionId);
}
```

### Change 2: Add store reset actions

**session-store**: `resetForSessionSwitch()` — clears `currentSession`, `windows`, `activeWindowId`
**pane-store**: `resetForSessionSwitch()` — clears `layout`, `panes`, `activePane`, `zoomedPane`

These must fire *before* the WebSocket reconnects so stale state doesn't flash.

### Change 3: Implement `handleNewSession` in App.tsx

```typescript
const handleNewSession = useCallback(async () => {
  const session = await apiCreateSession();     // POST /api/v1/sessions
  sessionStore.resetForSessionSwitch();
  paneStore.resetForSessionSwitch();
  client.switchSession(session.id);             // disconnect + reconnect
}, []);
```

Wire this to `<SessionPanel onNewSession={handleNewSession} />` instead of `handleNewWindow`.

### Change 4: Implement `handleRestoreSession` in App.tsx

Replace the TODO stub with the same pattern as `handleNewSession`, but using the existing session ID:

```typescript
const handleRestoreSession = useCallback(async (sessionId: string) => {
  sessionStore.resetForSessionSwitch();
  paneStore.resetForSessionSwitch();
  client.switchSession(sessionId);
}, []);
```

### Change 5: Guard active session deletion in SessionPanel

In `SessionPanel.handleDelete`:
- If the session being deleted is the *currently active* session, either:
  - (a) Prevent deletion with a warning ("Cannot delete active session"), or
  - (b) Switch to another session first, then delete
- Only allow deletion of *inactive* sessions without side effects

### Change 6: Fix `connect()` guard for session switching

The current guard silently drops the call. Modify it to allow reconnection when the requested session ID differs from the current one:

```typescript
connect(sessionId?: string): void {
  if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
    // Allow if switching to a different session
    if (sessionId && sessionId !== this.sessionId) {
      this.disconnect();
    } else {
      return;
    }
  }
  // ... rest of connect logic
}
```

## Complexity Tracking

No constitution violations. No complexity justifications needed.
