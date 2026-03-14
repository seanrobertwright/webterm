# Tasks: Full tmux Compatibility

**Input**: Design documents from `/specs/005-tmux-full-compat/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in spec. Test tasks are omitted. Add tests per story if desired.

**Organization**: Tasks are grouped by user story (18 stories) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Shared types**: `shared/types/` (models.ts, messages.ts)
- **Shared tmux**: `shared/tmux/` (new command infrastructure)
- **Backend services**: `backend/src/services/`
- **Backend DB**: `backend/src/db/`
- **Frontend hooks**: `frontend/src/hooks/`
- **Frontend components**: `frontend/src/components/`
- **Frontend stores**: `frontend/src/stores/`

---

## Phase 1: Setup (Schema & Types)

**Purpose**: Database migrations, shared type definitions, and WebSocket message contracts required by all subsequent phases.

- [x] T001 Create database migration for new tables (key_bindings, options, hooks) and ALTER existing tables (sessions +last_window_id, windows +auto_rename/last_active_at/monitor_activity/monitor_silence/monitor_bell, panes +title/marked) in backend/src/db/schema.sql
- [x] T002 [P] Update shared/types/models.ts with new entity interfaces (PasteBuffer, KeyBinding, Option, Hook, CommandDef, FormatVariable) and extend Session, Window, Pane interfaces with new fields per data-model.md
- [x] T003 [P] Update shared/types/messages.ts with all 13 new ClientMessage types (executeCommand, swapPane, breakPane, joinPane, rotateWindow, renameWindow, selectLayout, detachSession, switchSession, capturePane, respawnPane, requestChooseTree, requestDisplayPanes, setClientFlag) and 11 new ServerMessage types (commandResult, commandError, paneTitleChanged, statusBarUpdate, activityAlert, displayPanesData, chooseTreeData, sessionSwitched, sessionDetached, optionChanged, windowRenamed) per contracts/websocket-messages.md

---

## Phase 2: Foundational (Command Infrastructure)

**Purpose**: Shared command registry, parser, and core backend services that MUST be complete before user story implementation.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 [P] Implement tokenizer function (shell-like string splitting with single/double quote handling, backslash escapes) in shared/tmux/command-registry.ts
- [x] T005 [P] Implement parseTarget() function for tmux target specifiers (session:window.pane, :windowIdx, .paneIdx) in shared/tmux/target-parser.ts
- [x] T006 [P] Implement format string parser supporting #{variable_name} substitution, #{?condition,true_value,false_value} conditionals, and %H/%M/%S strftime codes in shared/tmux/format-parser.ts
- [x] T007 [P] Define option definitions catalog (~50 options: status, status-position, status-left, status-right, status-interval, mouse, prefix, mode-keys, base-index, pane-border-style, pane-active-border-style, buffer-limit, etc.) with name, type, default, scope, description in shared/tmux/option-definitions.ts
- [x] T008 [P] Implement OptionService with get/set/unset/showAll methods, hierarchical scope resolution (pane > window > session > global > default), and SQLite persistence in backend/src/services/option-service.ts
- [x] T009 Implement CommandRegistry class with register(), resolve(), commandNames(), complete(partial), and parse(input) methods using the tokenizer in shared/tmux/command-registry.ts
- [x] T010 Register all 40 command definitions (5 session, 10 window, 10 pane, 3 layout, 3 key binding, 3 option, 4 buffer, 2 hook, 3 display, 2 interactive + capture-pane) with aliases, flags (short, takesValue), and args per contracts/command-registry.md in shared/tmux/command-defs.ts
- [x] T011 Implement CommandService dispatch engine: accept ParsedCommand, route to handler by command name, return result/error; add skeleton handlers for all 40 commands in backend/src/services/command-service.ts
- [x] T012 Add executeCommand WebSocket message handler that tokenizes/parses via shared CommandRegistry, dispatches to CommandService, and sends commandResult/commandError response in backend/src/services/websocket-server.ts

**Checkpoint**: Command infrastructure ready. Commands can be sent via WebSocket and dispatched. User story implementation can begin.

---

## Phase 3: User Story 1 - Copy Mode and Scrollback Navigation (Priority: P1)

**Goal**: Users can enter copy mode, navigate scrollback with vi keys, search text, select regions, yank to paste buffer, and paste back into the terminal.

**Independent Test**: Press Ctrl+B [ to enter copy mode, navigate with h/j/k/l, search with /, select with Space...Enter, then Ctrl+B ] to paste.

### Implementation for User Story 1

- [x] T013 [P] [US1] Implement PasteBufferService as in-memory stack with add(name, content), getMostRecent(), getByName(name), list(), delete(name), configurable buffer-limit with oldest-eviction in backend/src/services/paste-buffer-service.ts
- [x] T014 [P] [US1] Create useCopyMode hook with state management (active, cursorRow, cursorCol, selectionStart, selectionActive, searchQuery), entry/exit logic, and keyboard interceptor via terminal.attachCustomKeyEventHandler in frontend/src/hooks/useCopyMode.ts
- [x] T015 [US1] Implement vi-mode cursor movement commands (h/j/k/l, w/b/e, 0/$, ^, g/G, Ctrl+U/Ctrl+D, Ctrl+B/Ctrl+F, H/M/L) with buffer line reading via getLine().translateToString() and scroll following via scrollToLine in frontend/src/hooks/useCopyMode.ts
- [x] T016 [US1] Implement forward search (/) and backward search (?) in copy mode using xterm.js SearchAddon findNext/findPrevious, with n/N for next/previous match navigation in frontend/src/hooks/useCopyMode.ts
- [x] T017 [US1] Implement visual selection: Space to begin selection, cursor movement extends selection, Enter/y to yank and exit, v to toggle rectangle mode, V for line selection, using terminal.select() and terminal.getSelection() in frontend/src/hooks/useCopyMode.ts
- [x] T018 [US1] Render copy mode visual indicators: virtual cursor via Decoration API (registerMarker + registerDecoration), "-- COPY --" mode label overlay, selection highlighting styling in frontend/src/hooks/useCopyMode.ts
- [x] T019 [US1] Wire copy mode yank to send selected text to backend PasteBufferService via WebSocket; wire Prefix ] paste to read most recent buffer from backend and write to active pane PTY via websocket-server.ts; handle buffer exit on alt-screen switch in backend/src/services/websocket-server.ts

**Checkpoint**: Copy mode fully functional. Users can browse scrollback, search, select, copy, and paste.

---

## Phase 4: User Story 2 - Command Prompt and Command Execution (Priority: P1)

**Goal**: Users can open a command prompt with Prefix :, type tmux commands with tab-completion and history, and execute them.

**Independent Test**: Press Ctrl+B :, type `split-window -h`, press Enter, verify pane splits horizontally.

### Implementation for User Story 2

- [x] T020 [P] [US2] Create useCommandPrompt hook with state management (isOpen, input, cursorPosition, historyIndex, completions, errorMessage) and open/close/submit logic in frontend/src/hooks/useCommandPrompt.ts
- [x] T021 [P] [US2] Create CommandPrompt overlay component with styled input field at bottom of screen, completion dropdown list, error message display, and Tailwind styling in frontend/src/components/CommandPrompt.tsx
- [x] T022 [US2] Implement tab-completion in CommandPrompt: call CommandRegistry.complete(partial) on Tab press, render completion dropdown with keyboard navigation (Up/Down/Enter to select) in frontend/src/components/CommandPrompt.tsx
- [x] T023 [US2] Implement command history in useCommandPrompt: store executed commands in array, Up/Down arrow to cycle through history, persist history in sessionStorage in frontend/src/hooks/useCommandPrompt.ts
- [x] T024 [US2] Wire command submission: send executeCommand WebSocket message on Enter, display commandResult output or commandError message in status area, auto-close prompt on success in frontend/src/hooks/useCommandPrompt.ts
- [x] T025 [US2] Wire Prefix : keybinding to open CommandPrompt, Escape to close without executing, in frontend/src/hooks/useKeyBindings.ts

**Checkpoint**: Command prompt functional. Users can execute any registered command.

---

## Phase 5: User Story 3 - Customizable Key Bindings (Priority: P1)

**Goal**: Users can bind/unbind keys, change the prefix key, create bindings in different key tables, with customizations persisted across sessions.

**Independent Test**: Execute `bind-key h split-window -h` via command prompt, press Ctrl+B h, verify pane splits. Execute `unbind-key h`, verify it no longer works.

### Implementation for User Story 3

- [x] T026 [P] [US3] Implement KeyBindingService with CRUD operations (bind, unbind, getByTable, getAll), default bindings loader from code constants, and SQLite persistence for custom bindings in backend/src/services/keybinding-service.ts
- [x] T027 [P] [US3] Load all default tmux key bindings (prefix table: 40+ bindings, copy-mode-vi table: 20+ bindings per contracts/command-registry.md) as code constants in KeyBindingService in backend/src/services/keybinding-service.ts
- [x] T028 [US3] Add bind-key, unbind-key, list-keys command handlers to CommandService: bind-key supports -T (key table), -n (root table shorthand); list-keys formats output by table in backend/src/services/command-service.ts
- [x] T029 [US3] Create keybinding-store Zustand store that fetches bindings from server on connect, caches by key table, and updates on bind/unbind responses in frontend/src/stores/keybinding-store.ts
- [x] T030 [US3] Refactor useKeyBindings hook to look up bindings from keybinding-store by key table (root, prefix, copy-mode-vi) instead of hardcoded switch statements; support dynamic prefix key from options in frontend/src/hooks/useKeyBindings.ts
- [x] T031 [US3] Implement prefix key change: when `set-option -g prefix` is executed, update key interceptor to listen for new prefix key, send optionChanged to clients in frontend/src/hooks/useKeyBindings.ts

**Checkpoint**: Key binding system functional. All default bindings work, users can customize.

---

## Phase 6: User Story 4 - Complete Pane Operations (Priority: P1)

**Goal**: Full suite of pane manipulation: swap, break, join, rotate, display-panes, mark, capture, respawn.

**Independent Test**: Create multi-pane layout, execute `swap-pane -D`, `break-pane`, `join-pane`, `rotate-window`, `display-panes`, verify each operation updates the layout correctly.

### Implementation for User Story 4

- [x] T032 [P] [US4] Add swap-pane command handler (-D for next, -U for previous, -t for target): swap two panes' positions in the layout tree via LayoutService in backend/src/services/command-service.ts
- [x] T033 [P] [US4] Implement swapPanesInLayout helper in LayoutService: locate both leaf nodes by paneId and swap their paneId values in backend/src/services/layout-service.ts
- [x] T034 [US4] Add break-pane command handler: extract pane from current window's layout tree, create new window with single-pane layout, handle last-pane-in-window edge case in backend/src/services/command-service.ts
- [x] T035 [US4] Add join-pane command handler (-t target, -h/-v direction): remove pane from source window, insert into target window's layout tree as split in backend/src/services/command-service.ts
- [x] T036 [US4] Add rotate-window command handler: rotate pane IDs within the layout tree's leaf nodes (forward/backward) in backend/src/services/command-service.ts
- [x] T037 [US4] Add select-pane -m (mark) and -M (unmark) command handlers: set/clear Pane.marked flag, track single marked pane per session in backend/src/services/command-service.ts
- [x] T038 [US4] Add capture-pane command handler: send capturePane message to client, client reads visible terminal content via buffer API, sends back to PasteBufferService in backend/src/services/command-service.ts
- [x] T039 [US4] Add respawn-pane command handler: kill existing PTY process, spawn new shell in same pane via PtyService.respawn() in backend/src/services/command-service.ts and backend/src/services/pty-service.ts
- [x] T040 [P] [US4] Create DisplayPanes overlay component: render large pane index numbers as overlays positioned over each pane, keyboard number selection to focus pane, auto-dismiss after configurable duration in frontend/src/components/DisplayPanes.tsx
- [x] T041 [US4] Add display-panes command handler and requestDisplayPanes/displayPanesData WebSocket message handlers in backend/src/services/websocket-server.ts

**Checkpoint**: All pane operations functional. Users can rearrange panes freely.

---

## Phase 7: User Story 5 - Complete Window Operations (Priority: P1)

**Goal**: Full window management: number selection (0-9), rename, swap, move, last-window toggle, automatic rename, find-window.

**Independent Test**: Create 3 windows, press Ctrl+B 2 to select by number, Ctrl+B , to rename, Ctrl+B l to toggle last window.

### Implementation for User Story 5

- [x] T042 [P] [US5] Add select-window command handler for index-based selection (-t :N), wire Prefix 0-9 keybindings to select-window -t :0 through :9 in backend/src/services/command-service.ts
- [x] T043 [P] [US5] Add rename-window command handler and renameWindow WebSocket message handler; wire Prefix , to open rename prompt in CommandPrompt component in backend/src/services/command-service.ts
- [x] T044 [P] [US5] Add swap-window (-t target) and move-window (-t target-index) command handlers: update window indices in SessionService in backend/src/services/command-service.ts
- [x] T045 [US5] Implement last-window tracking: update Session.lastWindowId on every window switch in SessionService; add last-window command handler (Prefix l) in backend/src/services/session-service.ts
- [x] T046 [US5] Implement automatic window renaming: poll pty.process at 500ms interval on Linux/macOS, parse OSC 0/2 title sequences from PTY output on all platforms, update Pane.currentCommand and Window name in backend/src/services/pty-service.ts
- [x] T047 [US5] Add paneTitleChanged and windowRenamed server message handlers: send title updates to clients, update window tab labels in frontend session-store in backend/src/services/websocket-server.ts
- [x] T048 [US5] Add find-window command handler: search pane content and titles across all windows in session, return matching window list to client in backend/src/services/command-service.ts

**Checkpoint**: Window operations fully functional. Number selection, rename, swap, auto-rename all work.

---

## Phase 8: User Story 6 - Built-in Layouts and Layout Cycling (Priority: P2)

**Goal**: Five preset layouts (even-horizontal, even-vertical, main-horizontal, main-vertical, tiled) with Prefix Space cycling.

**Independent Test**: Create 4 panes, press Ctrl+B Space repeatedly to cycle through all 5 layouts, verify each arranges panes correctly.

### Implementation for User Story 6

- [x] T049 [P] [US6] Implement even-horizontal and even-vertical preset layout algorithms as pure functions (paneIds, containerSize) => Layout in backend/src/services/layout-service.ts
- [x] T050 [P] [US6] Implement main-horizontal and main-vertical preset layout algorithms (first pane gets 50%, remaining split equally) in backend/src/services/layout-service.ts
- [x] T051 [P] [US6] Implement tiled preset layout algorithm (grid: cols=ceil(sqrt(n)), rows=ceil(n/cols)) in backend/src/services/layout-service.ts
- [x] T052 [US6] Add select-layout and next-layout command handlers, implement layout cycling state (even-h > even-v > main-h > main-v > tiled > repeat), add selectLayout WebSocket message handler, wire Prefix Space to next-layout in backend/src/services/command-service.ts

**Checkpoint**: All 5 preset layouts work. Layout cycling via Prefix Space functional.

---

## Phase 9: User Story 7 - Customizable Status Bar (Priority: P2)

**Goal**: tmux-style status bar with session name, window list with activity flags, clock, configurable left/right content with format strings.

**Independent Test**: Verify status bar appears at bottom showing session name (left), window tabs with active highlight (center), and clock (right). Set `status-position top` and verify it moves.

### Implementation for User Story 7

- [x] T053 [P] [US7] Create StatusBar React component with three-section flex layout (left | center window-list | right), fixed positioning at bottom, Tailwind styling matching tmux green-on-black default in frontend/src/components/StatusBar.tsx
- [x] T054 [P] [US7] Create useFormatString hook that resolves format variables (session_name, window_index, window_name, pane_current_command, host, host_short, pane_width, pane_height) from session/pane store state using shared format parser in frontend/src/hooks/useFormatString.ts
- [x] T055 [US7] Implement window list rendering in StatusBar center: clickable window tabs with index:name, active window highlight (reverse video), last-window marker (-), flags (# activity, ! bell, ~ silence, Z zoom) in frontend/src/components/StatusBar.tsx
- [x] T056 [US7] Wire StatusBar to stores for live data, implement configurable refresh via status-interval option, render status-left and status-right format strings with time formatting in frontend/src/components/StatusBar.tsx
- [x] T057 [US7] Add status bar configurability: status option (on/off), status-position (top/bottom), status-style colors, show/hide toggle, read options from OptionService in frontend/src/components/StatusBar.tsx

**Checkpoint**: Status bar fully functional with window list, format strings, and configurability.

---

## Phase 10: User Story 8 - Enhanced Mouse Support (Priority: P2)

**Goal**: Click-to-focus pane, scroll to browse history, drag borders to resize, double/triple-click word/line selection, status bar click.

**Independent Test**: Enable mouse mode, click a pane to focus it, scroll wheel up to enter copy mode, drag a border to resize.

### Implementation for User Story 8

- [x] T058 [P] [US8] Implement mouse click-to-focus: detect which pane was clicked from mouse coordinates, send focus WebSocket message, respect mouse option toggle in frontend/src/hooks/useMouse.ts
- [x] T059 [P] [US8] Implement mouse wheel scroll-to-copy-mode: wheel up on pane triggers copy mode entry and scroll, wheel down exits copy mode at bottom of buffer in frontend/src/hooks/useMouse.ts
- [x] T060 [US8] Implement double-click word selection and triple-click line selection using xterm.js mouse events, copy selected text to paste buffer in frontend/src/hooks/useMouse.ts
- [x] T061 [US8] Implement click-to-select-window in status bar: add click event handlers on window tab elements in StatusBar to send switchWindow message in frontend/src/components/StatusBar.tsx

**Checkpoint**: Full mouse support functional. All mouse interactions work with mouse option toggle.

---

## Phase 11: User Story 9 - Session Detach, Switch, and Multi-Session Management (Priority: P2)

**Goal**: Detach from sessions, switch between sessions, browse sessions via choose-tree interactive UI.

**Independent Test**: Create 2 sessions, press Ctrl+B d to detach, reconnect, press Ctrl+B s to see choose-tree, select other session.

### Implementation for User Story 9

- [x] T062 [P] [US9] Add detach-client command handler: send sessionDetached message to client, clean up client connection state, preserve session processes in backend/src/services/command-service.ts
- [x] T063 [P] [US9] Add switch-client command handler (-n next, -p previous, -t target): switch client to different session, send sessionSwitched with full session state in backend/src/services/command-service.ts
- [x] T064 [US9] Add requestChooseTree/chooseTreeData WebSocket handlers: gather all sessions with windows and panes hierarchy, include pane titles, sizes, and active states in backend/src/services/websocket-server.ts
- [x] T065 [US9] Create ChooseTree component: hierarchical tree view (sessions > windows > panes), keyboard navigation (Up/Down/Left/Right), Enter to select and switch, Escape to close in frontend/src/components/ChooseTree.tsx
- [x] T066 [US9] Handle session detach on frontend: on sessionDetached message, disconnect WebSocket and redirect to session list page; on session select, reconnect with new sessionId in frontend/src/stores/session-store.ts

**Checkpoint**: Session management functional. Detach, switch, and choose-tree browsing all work.

---

## Phase 12: User Story 10 - Activity, Bell, and Silence Monitoring (Priority: P2)

**Goal**: Monitor background windows for new output (activity), bell signals, and silence timeouts, with visual notifications.

**Independent Test**: Enable monitor-activity on window 2, switch to window 1, generate output in window 2, verify activity flag appears in window tab.

### Implementation for User Story 10

- [x] T067 [P] [US10] Implement monitor-activity: on PTY output, check if target window is not the active window for any client, set Window.activityFlag if monitor-activity option is enabled in backend/src/services/websocket-server.ts
- [x] T068 [P] [US10] Implement monitor-silence: maintain per-window timer that resets on PTY output, fire silence event when timer exceeds Window.monitorSilence seconds in backend/src/services/websocket-server.ts
- [x] T069 [P] [US10] Implement monitor-bell: detect BEL character (0x07) in PTY output byte stream, set Window.bellFlag when detected in a non-active window in backend/src/services/pty-service.ts
- [x] T070 [US10] Send activityAlert WebSocket messages to connected clients when activity/bell/silence events fire, include window ID and alert type in backend/src/services/websocket-server.ts
- [x] T071 [US10] Handle monitoring notifications on frontend: display toast/status message on activityAlert, update window tab flags in session-store, clear flags when user switches to the notified window in frontend/src/stores/session-store.ts

**Checkpoint**: Activity monitoring functional. Background window events trigger visible notifications.

---

## Phase 13: User Story 11 - Paste Buffers System (Priority: P3)

**Goal**: Manage multiple named paste buffers: list, view, delete, paste from specific buffer.

**Independent Test**: Copy text multiple times in copy mode, execute `list-buffers` to see all, `paste-buffer -b buffer1` to paste from a specific buffer.

### Implementation for User Story 11

- [x] T072 [P] [US11] Add list-buffers command handler: format buffer list with name, size, and content preview (first 50 chars) in backend/src/services/command-service.ts
- [x] T073 [P] [US11] Add show-buffer command handler (-b name): display full buffer content in backend/src/services/command-service.ts
- [x] T074 [US11] Add paste-buffer command handler (-b name for specific buffer, default to most recent): read buffer content from PasteBufferService and write to active pane PTY in backend/src/services/command-service.ts
- [x] T075 [US11] Add delete-buffer command handler (-b name) and set-buffer command handler (-b name, content); implement buffer limit eviction logging in backend/src/services/command-service.ts

**Checkpoint**: Paste buffer management functional. Full CRUD on buffers via commands.

---

## Phase 14: User Story 12 - Configuration and Options System (Priority: P3)

**Goal**: Hierarchical options (global/session/window/pane), set-option/show-options commands, option persistence, source-file loading.

**Independent Test**: Execute `set-option -g status-position top`, verify status bar moves. Execute `set-option status-position bottom` (session scope), verify override. Reconnect and verify persistence.

### Implementation for User Story 12

- [x] T076 [P] [US12] Add set-option command handler with scope flags (-g global, -s session, -w window, -p pane), -u (unset/reset to default), type validation against option definitions in backend/src/services/command-service.ts
- [x] T077 [P] [US12] Add show-options command handler: display all options at specified scope with current values; support -g for globals, -v for values only in backend/src/services/command-service.ts
- [x] T078 [US12] Add source-file command handler: read text file line-by-line, execute each non-empty non-comment line as a command via CommandService, report errors with line numbers in backend/src/services/command-service.ts
- [x] T079 [US12] Broadcast optionChanged WebSocket message to relevant clients when options are modified via set-option; scope filtering so pane options only notify pane's client in backend/src/services/websocket-server.ts
- [x] T080 [US12] Subscribe to optionChanged messages in frontend stores: apply option values that affect UI (mouse toggle, status bar visibility/position, prefix key, base-index) in frontend/src/stores/session-store.ts

**Checkpoint**: Options system functional. Hierarchical scoping, persistence, and source-file all work.

---

## Phase 15: User Story 13 - Hooks and Event System (Priority: P3)

**Goal**: Register commands to execute on lifecycle events (after-new-window, pane-died, session-renamed, etc.).

**Independent Test**: Execute `set-hook after-new-window 'rename-window "new"'`, create a new window, verify it's automatically named "new".

### Implementation for User Story 13

- [x] T081 [P] [US13] Implement HookService with register(event, command, scope), unregister(event, scope), listAll(), fire(event, context) methods and SQLite persistence in backend/src/services/hook-service.ts
- [x] T082 [US13] Add set-hook and show-hooks command handlers to CommandService: set-hook registers event+command, -u flag unregisters, show-hooks lists all with event and command in backend/src/services/command-service.ts
- [x] T083 [US13] Integrate HookService.fire() calls at lifecycle event points: after-new-window, after-new-pane, pane-died, after-kill-window, session-renamed, window-renamed, client-attached, client-detached in backend/src/services/session-service.ts and backend/src/services/websocket-server.ts
- [x] T084 [US13] Implement hook command execution: fire() looks up hooks by event name, executes each command string via CommandService.execute() in ordering sequence in backend/src/services/hook-service.ts

**Checkpoint**: Hook system functional. Lifecycle events trigger registered commands.

---

## Phase 16: User Story 14 - Interactive Browser Modes (Priority: P3)

**Goal**: Enhanced choose-tree with filtering/sorting/kill, choose-buffer for interactive buffer selection.

**Independent Test**: Press Ctrl+B w, navigate tree with arrows, press f to filter, O to sort, Enter to select. Press Ctrl+B = for choose-buffer.

### Implementation for User Story 14

- [x] T085 [US14] Enhance ChooseTree component: add filter input (f key), sort cycling (O key: name/index/time), kill with confirmation (x key), expand/collapse all, pane content preview panel in frontend/src/components/ChooseTree.tsx
- [x] T086 [US14] Add choose-tree command handler with -s (start at sessions) and -w (start at windows) flags to CommandService in backend/src/services/command-service.ts
- [x] T087 [P] [US14] Create ChooseBuffer component: interactive buffer list with content preview, keyboard navigation, Enter to paste selected buffer, Escape to cancel in frontend/src/components/ChooseBuffer.tsx
- [x] T088 [US14] Add choose-buffer command handler: send buffer list data with full content to client for interactive selection in backend/src/services/command-service.ts

**Checkpoint**: Interactive modes functional. choose-tree and choose-buffer both work with full keyboard navigation.

---

## Phase 17: User Story 15 - Popup and Menu System (Priority: P3)

**Goal**: Popup overlays for command output and context menus with selectable actions.

**Independent Test**: Execute `display-popup "echo hello"`, verify popup overlay shows "hello". Right-click a pane, verify context menu appears with actions.

### Implementation for User Story 15

- [x] T089 [P] [US15] Create Popup overlay component with configurable width/height/position, content area, close on Escape/q, optional auto-close on command exit (-E flag) in frontend/src/components/Popup.tsx
- [x] T090 [US15] Add display-popup command handler: if command specified, execute and stream output to client; support -w/-h for size, -x/-y for position in backend/src/services/command-service.ts
- [x] T091 [P] [US15] Create ContextMenu component with action items (split-h, split-v, close, zoom, copy, paste, mark), keyboard nav (Up/Down/Enter), mouse click, auto-dismiss on blur in frontend/src/components/ContextMenu.tsx
- [x] T092 [US15] Wire right-click context menu to pane containers: show ContextMenu on contextmenu event with pane-specific actions, execute selected action via CommandService in frontend/src/hooks/useKeyBindings.ts

**Checkpoint**: Popup and menu system functional. Overlays and context menus work.

---

## Phase 18: User Story 16 - Multi-Client Session Sharing (Priority: P3)

**Goal**: Multiple browser tabs/browsers can connect to the same session simultaneously with real-time sync and optional read-only mode.

**Independent Test**: Open same session in two browser tabs, type in one tab, verify output appears in both tabs simultaneously.

### Implementation for User Story 16

- [x] T093 [US16] Refactor WebSocket connection tracking from single-client to multi-client per session: maintain Set of connections per sessionId, add per-client metadata (readOnly, activeWindowId, connectedAt) in backend/src/services/websocket-server.ts
- [x] T094 [US16] Broadcast PTY output to all clients connected to the same session; broadcast layout/window updates to all session clients in backend/src/services/websocket-server.ts
- [x] T095 [US16] Add setClientFlag message handler: support readOnly flag that blocks input forwarding to PTY for flagged clients in backend/src/services/websocket-server.ts
- [x] T096 [US16] Add list-clients command handler: return connected client info (client ID, session, read-only flag, connected duration) in backend/src/services/command-service.ts

**Checkpoint**: Multi-client functional. Multiple browsers share sessions in real-time.

---

## Phase 19: User Story 17 - Pane Border Customization and Visual Display (Priority: P3)

**Goal**: Configurable pane border styles, active pane colors, border labels, and clock mode.

**Independent Test**: Set `pane-border-style fg=blue`, verify borders turn blue. Set `pane-active-border-style fg=green`, verify active border is green. Press Ctrl+B t for clock mode.

### Implementation for User Story 17

- [x] T097 [P] [US17] Implement configurable pane border styles: read pane-border-style and pane-active-border-style options, apply as CSS border-color on pane containers, support single/double/heavy/simple line styles via CSS in frontend (pane container component)
- [x] T098 [US17] Implement pane border labels: read pane-border-status option (top/bottom/off), render pane title or currentCommand as label text positioned at top/bottom of pane border in frontend (pane container component)
- [x] T099 [US17] Create ClockMode component: large ASCII art clock display filling pane area, update every second, triggered by clock-mode command (Prefix t), exit on any keypress in frontend/src/components/ClockMode.tsx

**Checkpoint**: Visual customization functional. Borders, labels, and clock mode work.

---

## Phase 20: User Story 18 - Format and Template System (Priority: P3)

**Goal**: Dynamic format string interpolation with ~20 variables, conditionals, and time formatting for use in status bar, border labels, and display commands.

**Independent Test**: Set `status-right "#{session_name} | %H:%M"`, verify status bar shows session name and current time updating at status-interval.

### Implementation for User Story 18

- [x] T100 [P] [US18] Implement format variable resolvers for ~20 variables: session_name, window_index, window_name, window_active, window_flags, pane_current_command, pane_current_path, pane_active, pane_index, host, host_short, pane_width, pane_height, window_panes, session_windows, pane_synchronized, window_zoomed_flag, client_width, client_height in shared/tmux/format-parser.ts
- [x] T101 [US18] Implement conditional format evaluation: parse #{?var,true_val,false_val} syntax, resolve var as boolean, select branch, support nested conditionals in shared/tmux/format-parser.ts
- [x] T102 [US18] Implement strftime-style time formatting (%H, %M, %S, %Y, %m, %d, %a, %b) for status bar clock rendering in shared/tmux/format-parser.ts
- [x] T103 [US18] Integrate format string rendering across all consumers: status bar left/right sections, pane border labels, display-message command output, window automatic rename format in frontend/src/hooks/useFormatString.ts

**Checkpoint**: Format system fully functional. All display surfaces render dynamic format strings.

---

## Phase 21: Polish & Cross-Cutting Concerns

**Purpose**: Integration verification, edge cases, and performance validation across all user stories.

- [x] T104 Verify all default Prefix keybindings from contracts/command-registry.md are wired to their command handlers and work end-to-end (40+ bindings across prefix and copy-mode-vi tables)
- [x] T105 [P] Add display-message command handler: show transient message in status bar area with configurable duration in backend/src/services/command-service.ts
- [x] T106 Validate edge cases per spec: copy mode + broadcast interaction (pause broadcast), break-pane on last pane (create new window), option wrong-scope error messages, buffer limit eviction, mouse/keyboard copy mode conflict, popup with background output, simultaneous multi-client input serialization
- [x] T107 Performance validation: verify <50ms keystroke-to-display latency, <2s initial load with all new components, 60fps terminal rendering with status bar active, <500KB gzipped JS bundle impact
- [x] T108 Run quickstart.md validation: execute all developer workflow scenarios from quickstart.md to verify end-to-end functionality

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) - BLOCKS all user stories
- **P1 User Stories (Phases 3-7)**: All depend on Foundational (Phase 2) completion
  - Can proceed in parallel or sequentially in priority order
- **P2 User Stories (Phases 8-12)**: Depend on Foundational (Phase 2) completion
  - US8 (Mouse) partially depends on US1 (Copy Mode) for scroll-to-copy-mode
- **P3 User Stories (Phases 13-20)**: Depend on Foundational (Phase 2) completion
  - US14 (Interactive Modes) enhances ChooseTree from US9 (Session Management)
- **Polish (Phase 21)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story | Depends On | Notes |
|-------|-----------|-------|
| US1 Copy Mode (P1) | Foundational only | Fully independent |
| US2 Command Prompt (P1) | Foundational only | Fully independent |
| US3 Key Bindings (P1) | Foundational only | Fully independent |
| US4 Pane Operations (P1) | Foundational only | Fully independent |
| US5 Window Operations (P1) | Foundational only | Fully independent |
| US6 Layouts (P2) | Foundational only | Fully independent |
| US7 Status Bar (P2) | Foundational only | Benefits from US18 (format resolvers) and US10 (activity flags) |
| US8 Mouse (P2) | US1 (for scroll-to-copy) | Can implement click-to-focus independently |
| US9 Session Management (P2) | Foundational only | Creates ChooseTree component |
| US10 Activity Monitoring (P2) | Foundational only | Integrates with US7 status bar for flag display |
| US11 Paste Buffers (P3) | Foundational only | PasteBufferService created in US1 |
| US12 Options (P3) | Foundational only | OptionService created in foundational |
| US13 Hooks (P3) | Foundational only | Creates HookService in this phase |
| US14 Interactive Modes (P3) | US9 (ChooseTree base) | Enhances ChooseTree, adds ChooseBuffer |
| US15 Popups/Menus (P3) | Foundational only | Fully independent |
| US16 Multi-Client (P3) | Foundational only | Modifies websocket-server.ts |
| US17 Pane Borders (P3) | Foundational only | Benefits from US18 (format strings for labels) |
| US18 Format System (P3) | Foundational only | Extends format-parser from foundational |

### Within Each User Story

- Models/services before UI components
- Backend handlers before frontend wiring
- Core implementation before integration points
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel (different files)
- **Phase 2**: T004, T005, T006, T007, T008 can all run in parallel (different files); then T009, T010 sequentially; then T011, T012
- **Phase 2 backend services**: T008 (OptionService) runs in parallel with shared code tasks
- **After Foundational**: All P1 stories (US1-US5) can start in parallel
- **After P1 complete**: All P2 stories (US6-US10) can start in parallel
- **After P2 complete**: All P3 stories (US11-US18) can start in parallel
- **Within stories**: Tasks marked [P] can run concurrently

---

## Parallel Example: Foundational Phase

```
Wave 1 (all parallel - different files):
  T004: Tokenizer in shared/tmux/command-registry.ts
  T005: Target parser in shared/tmux/target-parser.ts
  T006: Format parser in shared/tmux/format-parser.ts
  T007: Option definitions in shared/tmux/option-definitions.ts
  T008: OptionService in backend/src/services/option-service.ts

Wave 2 (after T004 completes):
  T009: CommandRegistry class in shared/tmux/command-registry.ts
  T010: Command definitions in shared/tmux/command-defs.ts

Wave 3 (after T009, T010 complete):
  T011: CommandService in backend/src/services/command-service.ts
  T012: WebSocket handler in backend/src/services/websocket-server.ts
```

## Parallel Example: P1 User Stories (after Foundational)

```
All 5 P1 stories can start simultaneously:
  Team A: US1 - Copy Mode (frontend-heavy)
  Team B: US2 - Command Prompt (frontend + backend)
  Team C: US3 - Key Bindings (backend + frontend refactor)
  Team D: US4 - Pane Operations (backend-heavy)
  Team E: US5 - Window Operations (backend-heavy)
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup (3 tasks)
2. Complete Phase 2: Foundational (9 tasks)
3. Complete Phase 3: US1 - Copy Mode (7 tasks)
4. Complete Phase 4: US2 - Command Prompt (6 tasks)
5. **STOP and VALIDATE**: Test copy mode and command prompt independently
6. Deploy/demo MVP with copy mode + command execution

### Incremental Delivery

1. Setup + Foundational → Command infrastructure ready
2. Add P1 stories (US1-US5) → Core tmux parity → Deploy/Demo
3. Add P2 stories (US6-US10) → Layouts, status bar, mouse, sessions, monitoring → Deploy/Demo
4. Add P3 stories (US11-US18) → Full feature set → Deploy/Demo
5. Polish phase → Edge cases, performance, validation → Release

### Single Developer Strategy

Follow phases sequentially in priority order:
1. Setup → Foundational → US1 → US2 → US3 → US4 → US5 (P1 complete)
2. US6 → US7 → US8 → US9 → US10 (P2 complete)
3. US18 → US12 → US11 → US13 → US14 → US15 → US16 → US17 (P3 complete)
4. Polish

Note: For single developer, recommended P3 order puts US18 and US12 first since other P3 stories benefit from format strings and options system.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable after foundational phase
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Tests not included — add test tasks per story if TDD approach desired
- Total: 108 tasks across 21 phases (18 user stories + setup + foundational + polish)
