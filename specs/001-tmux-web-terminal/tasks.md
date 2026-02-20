# Tasks: Web Terminal Multiplexer (WebTerm)

**Input**: Design documents from `/specs/001-tmux-web-terminal/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

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

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create monorepo structure with backend/, frontend/, shared/ directories
- [X] T002 Initialize backend Node.js project with TypeScript in backend/package.json
- [X] T003 [P] Initialize frontend Vite + React project with TypeScript in frontend/package.json
- [X] T004 [P] Create shared types package in shared/package.json
- [X] T005 Configure root package.json with workspaces and dev scripts
- [X] T006 [P] Configure TypeScript in backend/tsconfig.json with strict mode
- [X] T007 [P] Configure TypeScript in frontend/tsconfig.json with strict mode
- [X] T008 [P] Configure ESLint in .eslintrc.cjs (shared config)
- [X] T009 [P] Configure Prettier in .prettierrc
- [X] T010 Install backend dependencies: node-pty, ws, better-sqlite3, uuid in backend/package.json
- [X] T011 [P] Install frontend dependencies: @xterm/xterm, @xterm/addon-fit, @xterm/addon-webgl in frontend/package.json
- [X] T012 [P] Install GlitchCN/UI components via npx shadcn@latest add @glitchcn/all in frontend/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T013 Define shared model types (Session, Window, Pane, Layout) in shared/types/models.ts
- [X] T014 [P] Define WebSocket message types (input, output, resize, create, close) in shared/types/messages.ts
- [X] T015 Setup SQLite database connection with WAL mode in backend/src/db/database.ts
- [X] T016 Create database schema (sessions, windows, panes tables) in backend/src/db/schema.sql
- [X] T017 Implement database migration runner in backend/src/db/migrate.ts
- [X] T018 [P] Create base HTTP server with WebSocket upgrade in backend/src/index.ts
- [X] T019 [P] Create base React app structure in frontend/src/App.tsx
- [X] T020 [P] Configure Vite dev server proxy for WebSocket in frontend/vite.config.ts
- [X] T021 Setup GlitchCN/UI theme and base styles in frontend/src/styles/globals.css
- [X] T022 Create error types and error handling utilities in backend/src/utils/errors.ts
- [X] T023 [P] Create logger utility in backend/src/utils/logger.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Single Terminal Session (Priority: P1) 🎯 MVP

**Goal**: User opens the app and gets a fully functional terminal that can execute commands and display output with ANSI color support.

**Independent Test**: Open app, run `echo "Hello WebTerm"`, see output. Run `ls --color`, see colors.

### Backend Implementation for US1

- [X] T024 [US1] Implement shell detection service in backend/src/services/shell-service.ts
- [X] T025 [US1] Implement PTY spawning and management in backend/src/services/pty-service.ts
- [X] T026 [US1] Create Pane model with validation in backend/src/models/pane.ts
- [X] T026a [US1] Create Terminal runtime class (PTY handle, buffer) in backend/src/models/terminal.ts
- [X] T027 [US1] Implement WebSocket server with connection handling in backend/src/api/websocket-server.ts
- [X] T028 [US1] Implement terminal input/output handler in backend/src/api/handlers/terminal-handler.ts
- [X] T029 [US1] Implement binary message encoding/decoding in backend/src/api/protocol.ts
- [X] T030 [US1] Handle PTY resize events in backend/src/services/pty-service.ts
- [X] T031 [US1] Implement PTY cleanup on disconnect in backend/src/services/pty-service.ts

### Frontend Implementation for US1

- [X] T032 [US1] Create WebSocket client service in frontend/src/services/websocket-client.ts
- [X] T033 [US1] Create useWebSocket hook in frontend/src/hooks/useWebSocket.ts
- [X] T034 [US1] Create base Terminal component with xterm.js in frontend/src/components/terminal/Terminal.tsx
- [X] T035 [US1] Implement useTerminal hook for xterm lifecycle in frontend/src/hooks/useTerminal.ts
- [X] T036 [US1] Add FitAddon integration for terminal resize in frontend/src/components/terminal/Terminal.tsx
- [X] T037 [US1] Implement terminal input handling (onData → WebSocket) in frontend/src/components/terminal/Terminal.tsx
- [X] T038 [US1] Implement terminal output rendering (WebSocket → write) in frontend/src/components/terminal/Terminal.tsx
- [X] T039 [US1] Add scrollback buffer configuration (10,000 lines) in frontend/src/components/terminal/Terminal.tsx
- [X] T040 [US1] Create pane store for state management in frontend/src/stores/pane-store.ts
- [X] T041 [US1] Add terminal resize observer with debounce in frontend/src/hooks/useTerminal.ts
- [X] T042 [US1] Add connection status indicator UI in frontend/src/components/terminal/ConnectionStatus.tsx
- [X] T043 [US1] Style terminal container with GlitchCN theme in frontend/src/components/terminal/Terminal.tsx

**Checkpoint**: Single terminal fully functional. User can type commands, see output, scroll history.

---

## Phase 4: User Story 2 - Multiple Terminal Panes (Priority: P2)

**Goal**: User can split terminal into multiple panes (horizontal/vertical), resize panes by dragging, and navigate between panes using keyboard shortcuts.

**Independent Test**: Press Ctrl+B %, see vertical split. Press Ctrl+B ", see horizontal split. Drag border to resize.

### Backend Implementation for US2

- [X] T044 [US2] Create Window model in backend/src/models/window.ts
- [X] T045 [US2] Create Layout model with tree structure in backend/src/models/layout.ts
- [X] T046 [US2] Implement split pane logic in backend/src/services/layout-service.ts
- [X] T047 [US2] Handle create pane WebSocket message in backend/src/api/handlers/terminal-handler.ts
- [X] T048 [US2] Handle close pane WebSocket message in backend/src/api/handlers/terminal-handler.ts
- [X] T049 [US2] Handle split WebSocket message in backend/src/api/handlers/terminal-handler.ts
- [X] T050 [US2] Send layout updates to client on pane changes in backend/src/api/handlers/terminal-handler.ts
- [X] T050a [US2] Implement pane count limit validation (max 16) in backend/src/services/layout-service.ts

### Frontend Implementation for US2

- [X] T051 [US2] Create PaneContainer component for layout rendering in frontend/src/components/layout/PaneContainer.tsx
- [X] T052 [US2] Create PaneSplitter component for resizable borders in frontend/src/components/layout/PaneSplitter.tsx
- [X] T053 [US2] Implement recursive layout rendering in frontend/src/components/layout/PaneContainer.tsx
- [X] T054 [US2] Add pane resize logic (drag handler) in frontend/src/components/layout/PaneSplitter.tsx
- [X] T055 [US2] Create useKeyBindings hook for tmux shortcuts in frontend/src/hooks/useKeyBindings.ts
- [X] T056 [US2] Implement Ctrl+B prefix key detection in frontend/src/hooks/useKeyBindings.ts
- [X] T057 [US2] Add split vertical (Ctrl+B %) keybinding in frontend/src/hooks/useKeyBindings.ts
- [X] T058 [US2] Add split horizontal (Ctrl+B ") keybinding in frontend/src/hooks/useKeyBindings.ts
- [X] T059 [US2] Add pane navigation (Ctrl+B arrows) keybindings in frontend/src/hooks/useKeyBindings.ts
- [X] T060 [US2] Add close pane (Ctrl+B x) keybinding in frontend/src/hooks/useKeyBindings.ts
- [X] T061 [US2] Add visual focus indicator for active pane in frontend/src/components/layout/PaneContainer.tsx
- [X] T062 [US2] Update pane store with layout state in frontend/src/stores/pane-store.ts
- [X] T063 [US2] Add pane minimum size constraints in frontend/src/components/layout/PaneSplitter.tsx
- [X] T064 [US2] Create TerminalPane wrapper component in frontend/src/components/terminal/TerminalPane.tsx

**Checkpoint**: Multi-pane layout fully functional. User can split, resize, navigate, and close panes.

---

## Phase 5: User Story 3 - AI CLI Tool Integration (Priority: P3)

**Goal**: AI CLI tools (Claude Code, Gemini CLI, Codex) run correctly with streaming output, special formatting, and responsive interaction.

**Independent Test**: Run Claude Code, see streaming responses, verify box drawing characters render correctly.

### Backend Implementation for US3

- [X] T065 [US3] Implement flow control (backpressure) in backend/src/services/pty-service.ts
- [X] T066 [US3] Add watermark-based pause/resume in backend/src/api/handlers/terminal-handler.ts
- [X] T067 [US3] Send flow control messages to client in backend/src/api/handlers/terminal-handler.ts

### Frontend Implementation for US3

- [X] T068 [US3] Enable WebGL renderer addon in frontend/src/components/terminal/Terminal.tsx
- [X] T069 [US3] Handle WebGL context loss gracefully in frontend/src/components/terminal/Terminal.tsx
- [X] T070 [US3] Optimize terminal write batching for high throughput in frontend/src/components/terminal/Terminal.tsx
- [X] T071 [US3] Handle flow control messages from server in frontend/src/services/websocket-client.ts
- [X] T072 [US3] Add progress indicator for paused output in frontend/src/components/terminal/Terminal.tsx

**Checkpoint**: AI CLI tools render correctly with streaming output and no visual artifacts.

---

## Phase 6: User Story 4 - Inter-Terminal Communication (Priority: P4)

**Goal**: Users can copy/paste between panes and use broadcast mode to send input to multiple panes simultaneously.

**Independent Test**: Select text in one pane, Ctrl+C, focus another pane, Ctrl+V. Enable broadcast, type in one pane, see input in all.

### Backend Implementation for US4

- [X] T073 [US4] Handle focus message for broadcast tracking in backend/src/api/handlers/terminal-handler.ts
- [X] T074 [US4] Implement broadcast mode state in backend/src/services/broadcast-service.ts
- [X] T075 [US4] Handle broadcast toggle message in backend/src/api/handlers/terminal-handler.ts
- [X] T076 [US4] Route input to multiple panes in broadcast mode in backend/src/api/handlers/terminal-handler.ts

### Frontend Implementation for US4

- [X] T077 [US4] Create clipboard service with fallback in frontend/src/services/clipboard-service.ts
- [X] T078 [US4] Implement terminal text selection handling in frontend/src/components/terminal/Terminal.tsx
- [X] T079 [US4] Add copy keybinding (Ctrl+Shift+C or right-click) in frontend/src/hooks/useKeyBindings.ts
- [X] T080 [US4] Add paste keybinding (Ctrl+Shift+V) in frontend/src/hooks/useKeyBindings.ts
- [X] T081 [US4] Create broadcast mode toggle UI in frontend/src/components/layout/BroadcastToggle.tsx
- [X] T082 [US4] Add broadcast mode indicator on panes in frontend/src/components/terminal/TerminalPane.tsx
- [X] T083 [US4] Update pane store with broadcast state in frontend/src/stores/pane-store.ts

**Checkpoint**: Copy/paste works between panes. Broadcast mode sends input to all selected panes.

---

## Phase 7: User Story 5 - Session Persistence (Priority: P5)

**Goal**: Users can save session layouts with names and restore them later. Layout is recreated accurately.

**Independent Test**: Create multi-pane layout, save with name, reload page, restore session, verify layout matches.

### Backend Implementation for US5

- [X] T084 [US5] Create Session model in backend/src/models/session.ts
- [X] T085 [US5] Implement session CRUD in backend/src/services/session-service.ts
- [X] T086 [US5] Implement session persistence (save layout to SQLite) in backend/src/services/session-service.ts
- [X] T087 [US5] Implement session restoration (load layout, spawn PTYs) in backend/src/services/session-service.ts
- [X] T088 [US5] Create REST API router in backend/src/api/rest-router.ts
- [X] T089 [US5] Implement GET /sessions endpoint in backend/src/api/routes/sessions.ts
- [X] T090 [US5] Implement GET /sessions/:id endpoint in backend/src/api/routes/sessions.ts
- [X] T091 [US5] Implement POST /sessions endpoint in backend/src/api/routes/sessions.ts
- [X] T092 [US5] Implement PATCH /sessions/:id endpoint in backend/src/api/routes/sessions.ts
- [X] T093 [US5] Implement DELETE /sessions/:id endpoint in backend/src/api/routes/sessions.ts
- [X] T094 [US5] Implement POST /sessions/:id/save endpoint in backend/src/api/routes/sessions.ts
- [X] T095 [US5] Handle session handler WebSocket messages in backend/src/api/handlers/session-handler.ts

### Frontend Implementation for US5

- [X] T096 [US5] Create session store in frontend/src/stores/session-store.ts
- [X] T097 [US5] Create session list component in frontend/src/components/session/SessionList.tsx
- [X] T098 [US5] Create save session dialog in frontend/src/components/session/SaveSessionDialog.tsx
- [X] T099 [US5] Create restore session confirmation in frontend/src/components/session/RestoreSession.tsx
- [X] T100 [US5] Add session management keybindings (Ctrl+B S for save) in frontend/src/hooks/useKeyBindings.ts
- [X] T101 [US5] Implement session API client in frontend/src/services/session-api.ts
- [X] T102 [US5] Add session menu to UI header in frontend/src/components/layout/Header.tsx

**Checkpoint**: Sessions can be saved, listed, and restored with accurate layout recreation.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final polish, edge case handling, and production readiness

- [X] T103 Implement reconnection logic with exponential backoff in frontend/src/services/websocket-client.ts
- [X] T104 [P] Add disconnection overlay UI in frontend/src/components/terminal/DisconnectionOverlay.tsx
- [X] T105 Implement output buffering during disconnect in backend/src/api/websocket-server.ts
- [X] T106 [P] Add exit code display when PTY exits in frontend/src/components/terminal/TerminalPane.tsx
- [X] T107 [P] Add restart terminal option on exit in frontend/src/components/terminal/TerminalPane.tsx
- [X] T108 Implement GET /health endpoint in backend/src/api/routes/health.ts
- [X] T109 [P] Implement GET /system/info endpoint in backend/src/api/routes/system.ts
- [X] T110 [P] Add shell selector dropdown in frontend/src/components/terminal/ShellSelector.tsx
- [X] T111 Create Window tabs component in frontend/src/components/layout/WindowTabs.tsx
- [X] T112 Add new window keybinding (Ctrl+B c) in frontend/src/hooks/useKeyBindings.ts
- [X] T113 [P] Add next/prev window keybindings (Ctrl+B n/p) in frontend/src/hooks/useKeyBindings.ts
- [X] T114 [P] Add zoom pane keybinding (Ctrl+B z) in frontend/src/hooks/useKeyBindings.ts
- [X] T115 Add keyboard shortcut help overlay (Ctrl+B ?) in frontend/src/components/layout/KeybindingsHelp.tsx
- [X] T116 [P] Configure production build optimization in frontend/vite.config.ts
- [X] T117 [P] Add environment configuration management in backend/src/config/index.ts
- [X] T118 Create README.md with setup and usage instructions

---

## Dependencies

### User Story Dependencies

```
US1 (Single Terminal) ← Foundation
     ↓
US2 (Multiple Panes) ← US1
     ↓
US3 (AI CLI Tools) ← US1 (can parallel with US2)
     ↓
US4 (Inter-Terminal) ← US2
     ↓
US5 (Session Persistence) ← US2
```

### MVP Path

**Minimum Viable Product**: Phase 1 → Phase 2 → Phase 3 (US1)

After MVP, stories can be developed in priority order (P2 → P3 → P4 → P5) or based on user feedback.

---

## Parallel Execution Opportunities

### Phase 1 (Setup)
- T003, T004 can run in parallel after T001
- T006, T007, T008, T009 can run in parallel after T002/T003
- T010, T011, T012 can run in parallel

### Phase 2 (Foundational)
- T014 can run in parallel with T013
- T018, T019, T020, T023 can run in parallel after T015-T017
- T021 can run in parallel with T19

### Phase 3 (US1)
- T024-T031 (backend) can run in parallel with T032-T043 (frontend) after foundation
- Within backend: T024, T026, T029 can start immediately; T025 depends on T024
- Within frontend: T032-T035 can start immediately; later tasks depend on these

### Phase 4+ (US2-US5)
- Backend and frontend tasks within each story can run in parallel
- US3 can run in parallel with US2 (both depend only on US1)
- US4 and US5 both depend on US2, but can run in parallel with each other

---

## Summary

| Phase | Task Count | Parallel Tasks |
|-------|------------|----------------|
| Phase 1: Setup | 12 | 8 |
| Phase 2: Foundational | 11 | 5 |
| Phase 3: US1 (P1) | 20 | 10 |
| Phase 4: US2 (P2) | 21 | 6 |
| Phase 5: US3 (P3) | 8 | 2 |
| Phase 6: US4 (P4) | 11 | 3 |
| Phase 7: US5 (P5) | 19 | 4 |
| Phase 8: Polish | 16 | 9 |
| **Total** | **118** | **47** |

---

## Implementation Strategy

1. **MVP First**: Complete Phases 1-3 for a working single terminal
2. **Incremental Delivery**: Each user story is independently deployable
3. **Parallel Development**: Backend and frontend teams can work simultaneously
4. **Test as You Go**: Each checkpoint is a testable milestone
