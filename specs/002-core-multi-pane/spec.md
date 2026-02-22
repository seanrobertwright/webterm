# Feature Specification: Core Multi-Pane Support

**Feature Branch**: `002-core-multi-pane`
**Created**: 2026-02-21
**Status**: Draft
**Input**: Gap analysis of `001-tmux-web-terminal` implementation — pane splitting, layout updates, and window management are stubbed but not functional.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pane Splitting (Priority: P1)

A user presses Ctrl+B % or Ctrl+B " to split the currently focused terminal pane vertically or horizontally. A new PTY is spawned, inserted into the layout tree, and rendered in the UI. The original pane and new pane each occupy half the available space. The user can continue splitting panes up to the 16-pane limit.

**Why this priority**: Splitting is the core operation that makes WebTerm a multiplexer rather than a single terminal. Without it, all other multi-pane features (navigation, resize, close) have nothing to operate on.

**Independent Test**: Open the app, press Ctrl+B %, verify two side-by-side terminals appear. Type a command in each — they should be independent shells. Repeat with Ctrl+B " for horizontal split.

**Acceptance Scenarios**:

1. **Given** a single terminal pane is focused, **When** the user presses Ctrl+B %, **Then** a vertical split creates two side-by-side panes each running an independent shell
2. **Given** a single terminal pane is focused, **When** the user presses Ctrl+B ", **Then** a horizontal split creates two stacked panes each running an independent shell
3. **Given** 16 panes exist, **When** the user tries to split again, **Then** an error message is displayed and no new pane is created
4. **Given** a pane is in a nested layout (split of a split), **When** the user splits it, **Then** the correct pane in the layout tree is replaced with a new split node
5. **Given** a split occurs, **When** the layout updates, **Then** both panes resize their terminal emulators (cols/rows) to fit the new dimensions

---

### User Story 2 - Layout Tree Synchronization (Priority: P2)

When panes are created, closed, or split, the backend maintains the authoritative layout tree and sends layout updates to the frontend. The frontend renders the updated tree correctly, including cascading layout collapses when panes are closed (e.g., closing one side of a 2-pane split collapses back to a single pane).

**Why this priority**: Without correct layout synchronization, the frontend and backend diverge — panes appear but don't correspond to actual PTYs, or close operations leave orphaned UI elements.

**Independent Test**: Split a pane, close one side, verify layout collapses. Split multiple times, close a middle pane, verify remaining panes expand correctly.

**Acceptance Scenarios**:

1. **Given** a 2-pane split exists, **When** one pane is closed, **Then** the remaining pane expands to fill the full area and the split node collapses to a leaf
2. **Given** pane creation returns a `paneCreated` message, **When** the frontend processes it, **Then** the new pane is added to both the layout tree and the pane store
3. **Given** a `paneClosed` message arrives, **When** the frontend processes it, **Then** the pane is removed from the store and the layout tree is updated with redistributed sizes

---

### User Story 3 - Window Tabs (Priority: P3)

Users can create multiple windows (Ctrl+B c), each containing its own independent layout of panes. A tab bar appears showing all windows. Users switch between windows using tabs or keyboard shortcuts (Ctrl+B n/p for next/previous). Each window maintains its own layout state.

**Why this priority**: Windows provide organizational grouping beyond pane splits. This is important for power users managing many terminals, but the core split/close workflow must work first.

**Independent Test**: Press Ctrl+B c to create a new window, see a tab bar appear. Click between tabs to switch windows. Each window should have its own pane layout.

**Acceptance Scenarios**:

1. **Given** a single window exists, **When** the user presses Ctrl+B c, **Then** a new window is created with a single pane and a tab bar appears
2. **Given** multiple windows exist, **When** the user clicks a window tab, **Then** the display switches to that window's layout
3. **Given** multiple windows exist, **When** the user presses Ctrl+B n, **Then** the next window becomes active
4. **Given** a window's last pane is closed, **When** no panes remain, **Then** the window is removed and the next window becomes active
5. **Given** the window tab bar is visible, **When** the user clicks the "+" button, **Then** a new window is created

---

### Edge Cases

- What happens when splitting a pane that is currently zoomed? The zoom should be exited before the split occurs.
- What happens when the backend fails to spawn a PTY during split? An error message should be sent to the client and the layout should remain unchanged.
- What happens when the WebSocket disconnects during a split operation? The frontend should show the disconnection overlay; on reconnect, the session state is resynchronized.
- What happens when the user rapidly splits many times? Each split should complete before the next begins (sequential processing of split messages).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Backend `handleSplit()` MUST spawn a new PTY, update the layout tree using `splitLayout()`, and send the updated layout to the client
- **FR-002**: Backend `handleCreate()` MUST insert the new pane into the window's layout tree (not just return a disconnected leaf)
- **FR-003**: Backend MUST validate pane count against `MAX_PANES_PER_WINDOW` (16) before spawning a new PTY on split
- **FR-004**: Backend `handleClose()` MUST use `removePane()` from layout-service to produce the correct collapsed layout
- **FR-005**: Frontend MUST render `WindowTabs` component in `App.tsx` when multiple windows exist
- **FR-006**: Frontend MUST handle `newWindow`, `nextWindow`, `prevWindow` keybinding actions by calling appropriate session store methods
- **FR-007**: Frontend MUST switch pane store state when the active window changes (load that window's layout and panes)
- **FR-008**: System MUST persist layout changes to SQLite after each split/close operation

### Key Entities

- **Layout**: Recursive tree structure with `leaf`, `horizontal`, and `vertical` nodes. Split nodes have `children[]` and `sizes[]`.
- **Window**: Container for a layout tree and its panes. Has `id`, `name`, `index`, `sessionId`.
- **Pane**: Individual terminal instance. Has `id`, `windowId`, `shell`, `cols`, `rows`, `connectionState`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a 4-pane layout (2x2 grid) within 10 seconds using keyboard shortcuts
- **SC-002**: Closing a pane in a multi-pane layout takes less than 200ms from keypress to layout update
- **SC-003**: Layout tree state is consistent between frontend and backend after any sequence of split/close operations
- **SC-004**: System correctly enforces the 16-pane-per-window limit with a user-visible error message
- **SC-005**: Window switching occurs in under 100ms with no visible flicker
