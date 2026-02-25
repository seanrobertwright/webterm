# Tasks: Core Multi-Pane Support

**Input**: Design documents from `/specs/002-core-multi-pane/`
**Prerequisites**: spec.md ✅, existing codebase from `001-tmux-web-terminal` ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

This is a **web app** project:
- Backend: `backend/src/`
- Frontend: `frontend/src/`
- Shared: `shared/types/`

---

## Phase 1: User Story 1 - Pane Splitting (Priority: P1)

**Goal**: Ctrl+B % and Ctrl+B " create real pane splits with functioning PTYs and updated layout trees.

**Independent Test**: Press Ctrl+B %, verify two terminals appear side by side. Run commands independently in each.

### Backend Implementation for US1

- [x] T001 [US1] Complete `handleSplit()` in backend/src/api/handlers/terminal-handler.ts — replace placeholder with: validate pane limit using `validatePaneLimit()` from layout-service, spawn PTY via `ptyManager.spawn()`, call `splitLayout()` to produce new layout tree, persist layout to DB via session-service, send `paneCreated` with real pane and full updated layout
- [x] T002 [US1] Fix `handleCreate()` in backend/src/api/handlers/terminal-handler.ts — currently returns a disconnected leaf layout. Must accept the current window layout, insert the new pane using layout-service, persist to DB, and return the full updated layout tree
- [x] T003 [US1] Fix `handleClose()` in backend/src/api/handlers/terminal-handler.ts — use `removePane()` from layout-service to compute the collapsed layout tree instead of returning an empty placeholder leaf. Persist updated layout to DB
- [x] T004 [US1] Add window context tracking to `TerminalHandlerContext` in backend/src/api/handlers/terminal-handler.ts — store `windowId` and current `layout` so split/close operations have access to the current layout tree without a DB read on every operation
- [x] T005 [US1] Wire PTY output handler for new panes — ensure `sendOutputToClient()` is registered for each PTY spawned during split (currently only done during initial pane creation in websocket-server.ts)

### Frontend Integration for US1

- [x] T006 [US1] Connect `splitVertical` and `splitHorizontal` keybinding actions to WebSocket `split` message in frontend/src/App.tsx or a new useActions hook — when useKeyBindings fires these actions, send `{ type: 'split', payload: { paneId: activePane, direction: 'v'|'h' } }` via sendMessage
- [x] T007 [US1] Connect `closePane` keybinding action to WebSocket `close` message — send `{ type: 'close', payload: { paneId: activePane } }` via sendMessage
- [x] T008 [US1] Verify `useMessageHandlers` correctly processes `paneCreated` messages with the full layout tree — ensure `addPane()` and `setLayout()` are called so the new pane appears in the UI

**Checkpoint**: Pane splitting and closing fully functional. User can create multi-pane layouts with Ctrl+B shortcuts.

---

## Phase 2: User Story 2 - Layout Tree Synchronization (Priority: P2)

**Goal**: Layout tree is always consistent between backend and frontend after any pane operation.

**Independent Test**: Create 4+ panes, close various panes, verify remaining panes expand correctly.

- [x] T009 [US2] Add layout persistence on every mutation — in backend/src/api/handlers/terminal-handler.ts, after every split/create/close operation, call `sessionService.updateWindowLayout(windowId, layout)` to write the layout to SQLite
- [x] T010 [US2] Handle layout validation on reconnect — when a client reconnects (gets `connected` message), load the persisted layout from DB and send it to the client as a `layoutUpdated` message
- [x] T011 [US2] Add `setActivePane` call in `useMessageHandlers` when `paneCreated` — auto-focus the newly created pane after a split so the user can type immediately
- [x] T012 [US2] Ensure terminal resize fires after layout change — when `setLayout()` updates the pane store and React re-renders PaneContainer, each TerminalPane's FitAddon should trigger a resize. Verify the `ResizeObserver` in useTerminal handles this correctly

**Checkpoint**: Layout state survives reconnects and remains consistent through any sequence of operations.

---

## Phase 3: User Story 3 - Window Tabs (Priority: P3)

**Goal**: Users can create, switch, and close windows with a visible tab bar.

**Independent Test**: Press Ctrl+B c, see tab bar. Switch between windows. Each has independent pane layouts.

### Backend Implementation for US3

- [x] T013 [US3] Implement `handleCreateWindow()` in backend/src/api/handlers/session-handler.ts — create a new window in the session via session-service, spawn an initial pane, create a leaf layout, persist to DB, send `windowCreated` message
- [x] T014 [US3] Implement `handleCloseWindow()` in backend/src/api/handlers/session-handler.ts — kill all PTYs in the window, remove window from session, persist to DB, send `windowClosed` message

### Frontend Implementation for US3

- [x] T015 [US3] Render `WindowTabs` in App.tsx — import and place WindowTabs between Header and main content. Pass windows from session store, activeWindowId, and callbacks for tab click/close/new
- [x] T016 [US3] Implement window switching in App.tsx — when `onTabClick` fires or `setActiveWindow` is called, update session store's activeWindowId and reload the pane store with the selected window's layout and panes
- [x] T017 [US3] Connect `newWindow`, `nextWindow`, `prevWindow` keybinding actions — wire these actions in App.tsx to send the appropriate WebSocket message (for newWindow) or call session store's `setActiveWindow` with the next/prev window ID
- [x] T018 [US3] Handle window auto-close — when the last pane in a window is closed, auto-close the window and send `windowClosed` message to the client

**Checkpoint**: Multi-window support fully functional. Tab bar visible, switching works, keyboard shortcuts operational.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (US1)**: No dependencies — can start immediately. This is the critical blocker.
- **Phase 2 (US2)**: Depends on Phase 1 — requires working split/close to validate synchronization.
- **Phase 3 (US3)**: Depends on Phase 1 — window creation follows the same patterns as pane creation.

### Within Each Phase

- Backend tasks before frontend integration (backend produces the data the frontend consumes)
- T001 is the highest priority single task — `handleSplit()` is the core blocker

### Parallel Opportunities

- T002, T003 can run in parallel with T001 (different handler functions)
- T006, T007 can run in parallel (different keybinding actions, same file but different functions)
- T013, T014 can run in parallel (different handler functions)
- T015, T016, T017 depend on T013 (need `windowCreated` message to test)

---

## Summary

| Phase | Task Count | Parallel Tasks |
|-------|------------|----------------|
| Phase 1: Pane Splitting (P1) | 8 | 4 |
| Phase 2: Layout Sync (P2) | 4 | 1 |
| Phase 3: Window Tabs (P3) | 6 | 3 |
| **Total** | **18** | **8** |

---

## Implementation Strategy

### MVP First (Phase 1 Only)

1. Complete T001 (handleSplit) — this unblocks Ctrl+B % and Ctrl+B "
2. Complete T004-T005 (context tracking + PTY output wiring)
3. Complete T006-T007 (frontend keybinding → WebSocket message)
4. Complete T002-T003 (fix create/close)
5. **STOP and VALIDATE**: Test splitting, closing, and layout updates
6. Proceed to Phase 2 for robustness, Phase 3 for windows
