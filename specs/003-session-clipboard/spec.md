# Feature Specification: Session Management UI & Clipboard Integration

**Feature Branch**: `003-session-clipboard`
**Created**: 2026-02-21
**Status**: Draft
**Input**: Gap analysis of `001-tmux-web-terminal` implementation — backend session persistence is complete but frontend UI is not integrated; clipboard service exists but is not connected to keybindings or terminal selection.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Session Save & Restore UI (Priority: P1)

A user creates a multi-pane terminal layout, then saves it with a name (Ctrl+B S or via menu). Later, after closing the browser, the user returns and sees their saved sessions listed. They select one and the exact pane layout is restored with new terminal instances.

**Why this priority**: Session persistence is the primary differentiator for long-running workflows. The backend infrastructure is complete — this story wires the existing frontend components into the application.

**Independent Test**: Create a 2-pane layout. Press Ctrl+B S, enter a name, save. Refresh the page. Open session list, click "Restore" — verify the 2-pane layout reappears.

**Acceptance Scenarios**:

1. **Given** a multi-pane layout exists, **When** the user presses Ctrl+B S, **Then** a save dialog appears with a name input field
2. **Given** the save dialog is open, **When** the user enters a name and confirms, **Then** the session is saved via the REST API and a success notification appears
3. **Given** the user clicks the menu button in the header, **When** the session menu opens, **Then** a list of saved sessions is displayed with names, timestamps, and window/pane counts
4. **Given** a saved session is listed, **When** the user clicks "Restore", **Then** the current session is replaced with the saved layout and new PTYs are spawned
5. **Given** a saved session is listed, **When** the user clicks "Delete", **Then** the session is removed after confirmation

---

### User Story 2 - Copy & Paste Between Panes (Priority: P2)

A user selects text in one terminal pane using the mouse, copies it with Ctrl+Shift+C, switches to another pane, and pastes with Ctrl+Shift+V. The clipboard service handles browser API permissions and falls back to an in-app clipboard when the browser clipboard is unavailable.

**Why this priority**: Copy/paste is the most basic form of inter-terminal communication and a fundamental terminal capability. The clipboard service (`clipboard-service.ts`) is fully implemented — this story connects it to the keybindings and terminal selection API.

**Independent Test**: Run `echo "test data"` in one pane. Select the output text with the mouse. Press Ctrl+Shift+C. Focus another pane. Press Ctrl+Shift+V — verify "test data" is typed into the second pane.

**Acceptance Scenarios**:

1. **Given** text is selected in a terminal pane, **When** the user presses Ctrl+Shift+C, **Then** the selected text is copied to the clipboard (browser or in-app fallback)
2. **Given** text has been copied, **When** the user presses Ctrl+Shift+V in any pane, **Then** the clipboard contents are sent as terminal input to the focused pane
3. **Given** the browser denies clipboard API access, **When** the user copies text, **Then** the in-app clipboard is used and a notification informs the user
4. **Given** the user right-clicks in a terminal pane, **When** the context menu appears, **Then** copy and paste options are available

---

### User Story 3 - Session Name Editing (Priority: P3)

The user can click the session name in the header to edit it inline. The updated name is persisted to the backend.

**Why this priority**: A small UX improvement that completes the session management story. Lower priority because it doesn't affect core functionality.

**Independent Test**: Click the session name in the header. Edit the text. Press Enter. Refresh the page — verify the name persisted.

**Acceptance Scenarios**:

1. **Given** the header displays the session name, **When** the user clicks it, **Then** an inline text input appears with the current name selected
2. **Given** the inline edit is active, **When** the user presses Enter, **Then** the name is saved via the REST API and the input reverts to display mode
3. **Given** the inline edit is active, **When** the user presses Escape, **Then** the edit is cancelled and the original name is restored

---

### Edge Cases

- What happens when the user tries to restore a session while terminals are running? A confirmation dialog should warn that current terminals will be closed.
- What happens when session restoration fails (e.g., database error)? An error message should be displayed and the current session should remain intact.
- What happens when copying empty selection? The copy operation should be silently ignored.
- What happens when pasting into a pane that has exited? The paste should be silently ignored (no PTY to receive input).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Frontend MUST render a session management panel accessible from the header menu button
- **FR-002**: Frontend MUST integrate `SaveSessionDialog` component, triggered by Ctrl+B S keybinding action or menu
- **FR-003**: Frontend MUST integrate `SessionList` component in the session panel, displaying all saved sessions from the REST API
- **FR-004**: Frontend MUST call `POST /api/v1/sessions/:id/save` when saving and `POST /api/v1/sessions` + layout restoration when restoring
- **FR-005**: Frontend MUST connect Ctrl+Shift+C keybinding to `copyToClipboard()` with text from xterm.js selection API (`terminal.getSelection()`)
- **FR-006**: Frontend MUST connect Ctrl+Shift+V keybinding to `pasteFromClipboard()` and send result as terminal input via WebSocket
- **FR-007**: Frontend MUST handle clipboard permission denial gracefully, falling back to in-app clipboard with user notification
- **FR-008**: Header session name MUST be editable inline, with changes persisted via `PATCH /api/v1/sessions/:id`

### Key Entities

- **SessionListItem**: Lightweight session reference with `id`, `name`, `createdAt`, `windowCount`, `paneCount` — used in the session list.
- **ClipboardResult**: Return type from clipboard operations with `success`, `data`, and `error` fields.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can save a session in under 5 seconds (shortcut → dialog → confirm)
- **SC-002**: Session list loads and displays all saved sessions within 1 second
- **SC-003**: Restoring a 4-pane session recreates the exact layout within 3 seconds
- **SC-004**: Copy/paste between panes works on first attempt for 95% of users
- **SC-005**: Clipboard fallback to in-app clipboard occurs transparently when browser API is unavailable
- **SC-006**: Session name edits persist across page refreshes
