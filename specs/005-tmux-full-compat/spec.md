# Feature Specification: Full tmux Compatibility

**Feature Branch**: `005-tmux-full-compat`
**Created**: 2026-02-22
**Status**: Draft
**Input**: User description: "I want all the additional remaining tmux functionality implemented in this application. Deeply research what else is needed to make this a FULLY COMPATIBLE TMUX application."

## Gap Analysis Summary

WebTerm currently implements basic session/window/pane CRUD, horizontal/vertical splits, recursive layout trees, broadcast mode, pane zoom, basic Ctrl+B prefix keybindings, simple copy/paste, session persistence, output buffering for reconnection, terminal themes, and shell selection.

The following major tmux feature areas are **missing or incomplete**:

| Category | Status | Gap |
| -------- | ------ | --- |
| Copy mode / scrollback | Missing | No vi/emacs navigation, search, keyboard selection, scrollback browsing |
| Command prompt | Missing | No `:` command entry, no command parsing/execution engine |
| Key binding system | Partial | Hardcoded only; no user customization, key tables, bind/unbind |
| Pane operations | Partial | Missing swap, move, break-pane, join-pane, rotate, mark, display-panes, respawn, pipe, capture |
| Window operations | Partial | Missing rename, number select (0-9), swap, move, last-window, find, link/unlink, automatic-rename |
| Built-in layouts | Missing | No preset layouts (even-h, even-v, main-h, main-v, tiled), no layout cycling |
| Status bar | Missing | No customizable status line, no window list, no activity flags, no clock |
| Mouse support | Partial | Splitter drag only; no click-to-focus pane, no scroll in copy mode, no word/line selection |
| Session operations | Partial | Missing detach, session switching within client, lock, session groups |
| Configuration/options | Minimal | Font/theme only; no hierarchical option system (global/session/window/pane) |
| Activity monitoring | Missing | No monitor-activity, monitor-silence, bell monitoring, visual notifications |
| Paste buffers | Missing | No named buffers, no buffer list, no buffer management |
| Hooks | Missing | No lifecycle or event hooks |
| Format/template system | Missing | No dynamic format strings for status bar, titles, etc. |
| Interactive modes | Missing | No choose-tree, choose-buffer, choose-client, customize-mode |
| Popup/menu system | Missing | No display-popup, no display-menu |
| Multi-client support | Missing | No multiple browsers viewing/controlling the same session |
| Environment management | Missing | No per-session environment variables |
| Clock mode | Missing | No large clock display |
| Pane border customization | Missing | No border styles, labels, or indicators |

**Scope Note**: Some tmux features are inherently Unix/terminal-specific and translate differently in a web context. Unix sockets become WebSocket connections, terminal capabilities are handled by the browser, `suspend-client` (SIGTSTP) has no browser equivalent, and control mode (iTerm2 integration) is not applicable. This spec adapts those concepts to their web equivalents where meaningful and omits features that have no web analog.

**Explicitly excluded from this spec** (future candidates):
- Session groups (shared window sets across sessions)
- Window linking/unlinking (`link-window`, `unlink-window`)
- `pipe-pane` (pipe pane output to shell command)
- `run-shell` / `if-shell` / `wait-for` (shell execution and synchronization primitives)
- `server-access` (ACL management -- not applicable in trusted-network model)
- Command chaining (`\;`), brace grouping (`{}`), conditional execution

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Copy Mode and Scrollback Navigation (Priority: P1)

A user working in a terminal pane wants to scroll back through output history to find a previous command result, search for a specific string, and copy a block of text using keyboard-only navigation -- exactly as they would in tmux copy mode.

**Why this priority**: Copy mode is the single most-used advanced tmux feature. Without it, users cannot review past output, search terminal history, or perform precise text selection via keyboard. This is the primary feature gap that prevents WebTerm from feeling like a real tmux replacement.

**Independent Test**: Can be fully tested by entering copy mode in any pane, scrolling through history, searching for text, selecting a region, and yanking it to a paste buffer, then pasting it back into the terminal.

**Acceptance Scenarios**:

1. **Given** a pane with scrollback output, **When** user presses `Ctrl+B [`, **Then** the pane enters copy mode with a visible cursor that can be moved independently of the terminal cursor
2. **Given** copy mode is active, **When** user presses `k`/`j`/`h`/`l` (vi mode) or arrow keys, **Then** the cursor moves up/down/left/right through the scrollback buffer
3. **Given** copy mode is active, **When** user presses `/` and types a search query, **Then** matching text is highlighted and the cursor jumps to the first match; `n`/`N` navigate between matches
4. **Given** copy mode is active, **When** user presses `Space` to begin selection, moves cursor, then presses `Enter`, **Then** the selected text is copied to the paste buffer and copy mode exits
5. **Given** text has been copied to a paste buffer, **When** user presses `Ctrl+B ]`, **Then** the buffer contents are pasted into the active pane
6. **Given** copy mode is active, **When** user presses `q` or `Escape`, **Then** copy mode exits and the pane returns to normal terminal display
7. **Given** copy mode is active, **When** user presses `g` or `G`, **Then** the cursor jumps to the top or bottom of the scrollback buffer
8. **Given** copy mode is active, **When** user presses `w`/`b`/`e`, **Then** the cursor moves forward/backward by word boundaries
9. **Given** copy mode is active, **When** user presses `0`/`$`/`^`, **Then** the cursor jumps to start of line / end of line / first non-blank character

---

### User Story 2 - Command Prompt and Command Execution (Priority: P1)

A user wants to type tmux-style commands directly (e.g., `split-window -h`, `swap-pane -D`, `select-layout tiled`) via a command prompt, just as they would with tmux's `Prefix :` prompt. This is the gateway to all advanced operations that don't have a dedicated keybinding.

**Why this priority**: The command prompt is the backbone of tmux -- it provides access to every single tmux operation. Without it, users are limited to the small subset of operations that have keybindings. This also provides the foundation for configuration, scripting, and power-user workflows.

**Independent Test**: Can be fully tested by pressing `Ctrl+B :` to open the prompt, typing a command like `split-window -v`, and verifying the pane splits vertically.

**Acceptance Scenarios**:

1. **Given** a user is in any pane, **When** they press `Ctrl+B :`, **Then** a command prompt appears at the bottom of the screen with a `:` prefix and blinking cursor
2. **Given** the command prompt is open, **When** user types `split-window -h` and presses Enter, **Then** the active pane splits horizontally and the prompt closes
3. **Given** the command prompt is open, **When** user types an invalid command, **Then** an error message is displayed briefly in the status area
4. **Given** the command prompt is open, **When** user presses Escape, **Then** the prompt closes without executing anything
5. **Given** the command prompt is open, **When** user starts typing a command name, **Then** tab-completion suggests matching command names
6. **Given** the command prompt is open, **When** user presses Up/Down arrow, **Then** previous commands from history are cycled through
7. **Given** a command that requires a target (e.g., `swap-pane -t 2`), **When** user provides the target argument, **Then** the command executes against the specified target

---

### User Story 3 - Customizable Key Bindings (Priority: P1)

A user wants to customize their keybindings -- rebind the prefix key, add new shortcuts, remove defaults, and create bindings in different key tables (root, prefix, copy-mode-vi) -- just as they would with `bind-key` and `unbind-key` in tmux.

**Why this priority**: Keybinding customization is fundamental to the tmux experience. Every tmux user customizes their bindings. The current hardcoded bindings cannot be changed, which makes the application unusable for users with muscle memory from their own tmux configurations.

**Independent Test**: Can be fully tested by using the command prompt to bind a new key (e.g., `bind-key r source-file` equivalent), verifying it works, then unbinding it and verifying it no longer triggers.

**Acceptance Scenarios**:

1. **Given** default keybindings are active, **When** user executes `bind-key h split-window -h` via the command prompt, **Then** pressing `Ctrl+B h` splits the window horizontally
2. **Given** a custom binding exists, **When** user executes `unbind-key h`, **Then** pressing `Ctrl+B h` no longer triggers the split
3. **Given** the default prefix is `Ctrl+B`, **When** user executes `set-option -g prefix C-a`, **Then** `Ctrl+A` becomes the new prefix key and `Ctrl+B` no longer activates prefix mode
4. **Given** a user wants to list all bindings, **When** they execute `list-keys`, **Then** all current key bindings are displayed organized by key table
5. **Given** a user wants a root-level binding (no prefix needed), **When** they execute `bind-key -n C-h select-pane -L`, **Then** pressing `Ctrl+H` directly (without prefix) selects the left pane
6. **Given** copy-mode-vi key table, **When** user executes `bind-key -T copy-mode-vi v send-keys -X begin-selection`, **Then** pressing `v` in copy mode begins selection

---

### User Story 4 - Complete Pane Operations (Priority: P1)

A user needs the full suite of pane manipulation commands: swap panes, move panes between windows, break a pane out into its own window, join a pane from another window, display pane numbers for quick selection, rotate pane positions, mark a pane for later operations, and capture pane contents to a buffer.

**Why this priority**: These operations are core to efficient tmux workflow. Without swap-pane, break-pane, and join-pane, users cannot rearrange their workspace effectively. Display-panes is essential for quick pane selection in complex layouts.

**Independent Test**: Can be fully tested by creating a multi-pane layout, then using each pane operation (swap, break, join, rotate, display-panes, mark, capture) and verifying the layout updates correctly.

**Acceptance Scenarios**:

1. **Given** two panes exist, **When** user executes `swap-pane -D` or presses `Ctrl+B }`, **Then** the active pane swaps position with the next pane in the layout
2. **Given** two panes exist, **When** user executes `swap-pane -U` or presses `Ctrl+B {`, **Then** the active pane swaps position with the previous pane
3. **Given** a pane in a multi-pane window, **When** user executes `break-pane` or presses `Ctrl+B !`, **Then** the pane is removed from the current window and placed in a new window
4. **Given** a pane in window 1, **When** user executes `join-pane -t :2` to join it to window 2, **Then** the pane moves from window 1 into window 2's layout
5. **Given** multiple panes, **When** user presses `Ctrl+B q` (display-panes), **Then** each pane briefly displays its index number as a large overlay; pressing a number selects that pane
6. **Given** multiple panes, **When** user executes `rotate-window` or presses `Ctrl+B Ctrl+O`, **Then** pane positions rotate within the current layout structure
7. **Given** any pane, **When** user presses `Ctrl+B m`, **Then** the pane is marked (visually indicated); marked panes can be referenced as targets in commands using `{marked}`
8. **Given** a pane with content, **When** user executes `capture-pane`, **Then** the visible pane content (and optionally scrollback) is saved to a paste buffer
9. **Given** a pane whose process has exited, **When** user executes `respawn-pane`, **Then** a new shell process is started in the same pane without changing the layout

---

### User Story 5 - Complete Window Operations (Priority: P1)

A user needs full window management: rename windows, select windows by number (0-9), swap window positions, move windows to different indices, quickly jump to the last active window, and have windows automatically rename based on the running command.

**Why this priority**: Window operations are used constantly in tmux. Number-based window selection (Prefix 0-9) is one of the most frequent operations. Window renaming and last-window switching are essential for navigating workspaces with many windows.

**Independent Test**: Can be fully tested by creating multiple windows, renaming them, switching between them by number, swapping their order, and verifying last-window toggling works.

**Acceptance Scenarios**:

1. **Given** multiple windows exist, **When** user presses `Ctrl+B 0` through `Ctrl+B 9`, **Then** the window at that index becomes active
2. **Given** any window, **When** user presses `Ctrl+B ,` (comma), **Then** a rename prompt appears; entering a new name updates the window tab label
3. **Given** two windows at indices 1 and 3, **When** user executes `swap-window -t 3`, **Then** the active window swaps position/index with window 3
4. **Given** any window, **When** user executes `move-window -t 5`, **Then** the active window moves to index 5
5. **Given** user was on window 2 and switched to window 4, **When** user presses `Ctrl+B l` (last-window), **Then** window 2 becomes active again; pressing it again toggles back to window 4
6. **Given** automatic-rename is enabled and a pane is running `vim`, **When** the user observes the window tab, **Then** it shows `vim` as the window name; when vim exits, it reverts to the shell name
7. **Given** a window, **When** user executes `find-window searchterm`, **Then** windows containing the search term in their pane content or title are listed for selection

---

### User Story 6 - Built-in Layouts and Layout Cycling (Priority: P2)

A user wants to quickly apply preset layouts (even-horizontal, even-vertical, main-horizontal, main-vertical, tiled) to organize panes, and cycle through layouts with a single keystroke, just as in tmux.

**Why this priority**: Preset layouts eliminate manual resizing for common arrangements. Layout cycling with `Prefix Space` is a frequently used shortcut that lets users quickly find the best arrangement for their current task.

**Independent Test**: Can be fully tested by creating 4 panes, then pressing `Ctrl+B Space` repeatedly to cycle through all 5 preset layouts, verifying each layout arranges panes correctly.

**Acceptance Scenarios**:

1. **Given** 4 panes in a window, **When** user executes `select-layout even-horizontal`, **Then** all panes are arranged side-by-side with equal widths
2. **Given** 4 panes in a window, **When** user executes `select-layout even-vertical`, **Then** all panes are stacked vertically with equal heights
3. **Given** 4 panes in a window, **When** user executes `select-layout main-horizontal`, **Then** one pane occupies the top half and the remaining panes split the bottom half equally
4. **Given** 4 panes in a window, **When** user executes `select-layout main-vertical`, **Then** one pane occupies the left half and the remaining panes split the right half equally
5. **Given** 4 panes in a window, **When** user executes `select-layout tiled`, **Then** panes are arranged in a grid pattern (2x2 for 4 panes)
6. **Given** any multi-pane window, **When** user presses `Ctrl+B Space`, **Then** the layout cycles to the next preset layout in sequence (even-horizontal -> even-vertical -> main-horizontal -> main-vertical -> tiled -> repeat)
7. **Given** a preset layout is active, **When** a new pane is added, **Then** the layout automatically rebalances to incorporate the new pane

---

### User Story 7 - Customizable Status Bar (Priority: P2)

A user wants a tmux-style status bar at the bottom of the screen showing the session name, window list with activity indicators, clock, and custom information sections -- with full control over formatting, colors, and content.

**Why this priority**: The status bar is the primary information display in tmux. It provides at-a-glance session context, window navigation, and activity awareness. Without it, users lack the visual feedback they expect from a terminal multiplexer.

**Independent Test**: Can be fully tested by configuring status bar options (left/right content, colors, refresh interval) and verifying the status bar renders correctly with live-updating content.

**Acceptance Scenarios**:

1. **Given** a session is active, **When** the user looks at the bottom of the screen, **Then** a status bar displays the session name on the left, window list in the center, and system information on the right
2. **Given** multiple windows exist, **When** the user views the status bar, **Then** all windows are listed with their index and name; the active window is visually highlighted; windows with activity show a flag indicator
3. **Given** the status bar is showing, **When** user configures `status-left` with custom content, **Then** the left section updates to show the configured content
4. **Given** the status bar is showing, **When** user configures `status-right` with a clock format, **Then** the right section shows a live-updating clock
5. **Given** a window has unseen output (activity), **When** user views the status bar, **Then** that window shows an activity indicator (e.g., `#` flag)
6. **Given** status bar is displayed, **When** user sets `status off`, **Then** the status bar hides; setting `status on` shows it again
7. **Given** the status bar, **When** user configures colors and styles, **Then** foreground, background, and text attributes (bold, italic, etc.) render correctly

---

### User Story 8 - Enhanced Mouse Support (Priority: P2)

A user wants full mouse interaction: click a pane to focus it, scroll the mouse wheel to enter copy mode and scroll through history, drag pane borders to resize, click window names in the status bar to switch, and double/triple-click for word/line selection.

**Why this priority**: Mouse support dramatically improves accessibility and enables casual users to interact with the terminal multiplexer intuitively without memorizing keyboard shortcuts. tmux users who enable mouse mode expect all these interactions.

**Independent Test**: Can be fully tested by enabling mouse mode, then clicking panes to focus them, scrolling to browse history, dragging borders to resize, and double-clicking to select words.

**Acceptance Scenarios**:

1. **Given** mouse mode is enabled and multiple panes exist, **When** user clicks inside a pane, **Then** that pane becomes the active/focused pane
2. **Given** mouse mode is enabled, **When** user scrolls the mouse wheel up in a pane, **Then** the pane enters copy mode and scrolls up through the scrollback buffer
3. **Given** mouse mode is enabled, **When** user drags a pane border, **Then** the adjacent panes resize smoothly following the mouse cursor
4. **Given** mouse mode is enabled and a status bar is showing, **When** user clicks a window name in the status bar, **Then** that window becomes active
5. **Given** mouse mode is enabled, **When** user double-clicks a word in a pane, **Then** the word is selected (highlighted)
6. **Given** mouse mode is enabled, **When** user triple-clicks a line in a pane, **Then** the entire line is selected
7. **Given** mouse mode is enabled, **When** user clicks and drags in a pane, **Then** a text selection is created following the mouse

---

### User Story 9 - Session Detach, Switch, and Multi-Session Management (Priority: P2)

A user wants to detach from a session (leaving it running), switch between multiple sessions within the same browser, and manage sessions via an interactive tree browser (choose-tree) that shows all sessions, windows, and panes hierarchically.

**Why this priority**: Multi-session management is a core tmux workflow. Users run multiple sessions for different projects and switch between them. The choose-tree browser provides the best overview of all running sessions and their contents.

**Independent Test**: Can be fully tested by creating multiple sessions, detaching from one, attaching to another, using choose-tree to browse and switch, and verifying detached sessions persist.

**Acceptance Scenarios**:

1. **Given** a user is in an active session, **When** they press `Ctrl+B d`, **Then** the session detaches (disconnects cleanly), returning to a session list or landing page, while the session's processes continue running
2. **Given** multiple sessions exist, **When** user presses `Ctrl+B s` (choose-tree for sessions), **Then** an interactive tree view appears showing all sessions with their windows and panes; user can navigate and select one to switch to
3. **Given** user is in session A, **When** they press `Ctrl+B (` or `Ctrl+B )`, **Then** the client switches to the previous or next session
4. **Given** choose-tree is open, **When** user expands a session node, **Then** all windows under that session are shown; expanding a window shows its panes with a preview of their content
5. **Given** choose-tree is open, **When** user presses `x` on a session/window/pane, **Then** the selected item is killed (with confirmation)
6. **Given** a detached session, **When** user selects it from the session list, **Then** the client reattaches to that session and all terminal output is restored

---

### User Story 10 - Activity, Bell, and Silence Monitoring (Priority: P2)

A user running long processes across multiple windows wants to be notified when a window has new output (activity), receives a bell signal, or has been silent for a specified duration -- exactly as tmux's monitor-activity, monitor-bell, and monitor-silence features work.

**Why this priority**: Monitoring is essential for users who run builds, tests, or long-running processes in background windows. Without it, users must manually check each window for updates, which defeats the purpose of a multiplexer.

**Independent Test**: Can be fully tested by enabling monitor-activity on a window, switching to a different window, generating output in the monitored window, and verifying a visual notification appears.

**Acceptance Scenarios**:

1. **Given** monitor-activity is enabled on window 2 and user is viewing window 1, **When** output occurs in window 2, **Then** window 2's tab shows an activity indicator and a status bar message says "Activity in window 2"
2. **Given** monitor-bell is enabled, **When** a process in a background window sends a bell character (`\a`), **Then** the window tab shows a bell indicator and a notification appears
3. **Given** monitor-silence is set to 30 seconds on a window, **When** no output occurs for 30 seconds, **Then** a notification alerts the user of silence in that window
4. **Given** an activity notification is showing, **When** user switches to the notified window, **Then** the activity indicator clears
5. **Given** visual-activity is set to `on`, **When** activity is detected, **Then** a message appears in the status bar rather than (or in addition to) a window flag

---

### User Story 11 - Paste Buffers System (Priority: P3)

A user wants to manage multiple named paste buffers -- listing them, viewing their contents, deleting them, and pasting from a specific buffer -- just like tmux's buffer system that maintains a stack of recently copied text.

**Why this priority**: Paste buffers extend the basic clipboard with a history of copied text. Power users rely on this to collect and reuse multiple snippets. It also integrates with copy mode and capture-pane operations.

**Independent Test**: Can be fully tested by copying text multiple times in copy mode, listing all buffers, viewing a specific buffer's content, and pasting from a non-default buffer.

**Acceptance Scenarios**:

1. **Given** user has copied text multiple times in copy mode, **When** they execute `list-buffers`, **Then** all paste buffers are listed with their name, size, and a preview of their content
2. **Given** multiple buffers exist, **When** user executes `paste-buffer -b buffer1`, **Then** the content of the named buffer is pasted into the active pane
3. **Given** the buffer list is showing, **When** user executes `choose-buffer`, **Then** an interactive buffer picker appears; selecting a buffer pastes it
4. **Given** a buffer named `buffer0`, **When** user executes `show-buffer -b buffer0`, **Then** the full contents of that buffer are displayed
5. **Given** an existing buffer, **When** user executes `delete-buffer -b buffer0`, **Then** the buffer is removed from the buffer list
6. **Given** user copies text in copy mode, **When** the buffer limit is reached, **Then** the oldest buffer is automatically removed to make room for the new one

---

### User Story 12 - Configuration and Options System (Priority: P3)

A user wants to configure WebTerm behavior through a hierarchical options system (global, session, window, pane scopes) using set-option / show-options commands, with options persisted across sessions -- similar to tmux's option system and .tmux.conf.

**Why this priority**: A proper options system is the foundation for all customization. It enables users to configure status bar content, key bindings, mouse behavior, display styles, and every other configurable aspect of the application in a systematic way.

**Independent Test**: Can be fully tested by setting an option at global scope, overriding it at session scope, verifying the session uses the override while other sessions use the global value, and confirming options persist across reconnections.

**Acceptance Scenarios**:

1. **Given** default options are active, **When** user executes `set-option -g status-position top`, **Then** the status bar moves to the top of the screen for all sessions
2. **Given** a global option value, **When** user executes `set-option status-position bottom` (session scope), **Then** the current session overrides the global value and shows the status bar at the bottom while other sessions remain at the top
3. **Given** an option is set, **When** user executes `show-options -g`, **Then** all global options and their current values are displayed
4. **Given** options have been set, **When** the user disconnects and reconnects, **Then** all option values are preserved
5. **Given** a user wants to reset an option, **When** they execute `set-option -u option-name`, **Then** the option reverts to the inherited (or default) value
6. **Given** a configuration string or set of commands, **When** user loads them (equivalent to `source-file`), **Then** all commands are executed in sequence, configuring the session

---

### User Story 13 - Hooks and Event System (Priority: P3)

A user wants to register hook commands that run automatically when lifecycle events occur (e.g., after a new window is created, after a pane is closed, when a session is renamed) to automate their workflow -- just as tmux's hook system allows.

**Why this priority**: Hooks enable automation and workflow customization. They allow actions like automatically renaming windows when created, running cleanup commands when panes close, or displaying notifications on events.

**Independent Test**: Can be fully tested by setting a hook (e.g., `set-hook after-new-window 'rename-window "new"'`), creating a new window, and verifying the hook command executed automatically.

**Acceptance Scenarios**:

1. **Given** a hook is set for `after-new-window`, **When** a new window is created, **Then** the hook command executes automatically
2. **Given** a hook is set for `pane-died`, **When** a pane's process exits, **Then** the hook command executes
3. **Given** a hook is set, **When** user executes `show-hooks`, **Then** all registered hooks are listed with their trigger events and commands
4. **Given** a hook exists, **When** user executes `set-hook -u after-new-window`, **Then** the hook is removed
5. **Given** multiple hooks are set for the same event, **When** the event fires, **Then** all hooks execute in the order they were registered

---

### User Story 14 - Interactive Browser Modes (Priority: P3)

A user wants interactive browser/picker interfaces for sessions (choose-tree), buffers (choose-buffer), and options (customize-mode) that allow hierarchical browsing, filtering, sorting, and in-place actions like killing sessions or selecting items.

**Why this priority**: Interactive modes provide the most discoverable and user-friendly way to manage complex state. choose-tree in particular is one of the best features of modern tmux -- it gives users a complete overview of their workspace with the ability to navigate and act on any item.

**Independent Test**: Can be fully tested by pressing `Ctrl+B s` or `Ctrl+B w` to open choose-tree, navigating the hierarchy, filtering results, and selecting items to switch to.

**Acceptance Scenarios**:

1. **Given** multiple sessions and windows exist, **When** user presses `Ctrl+B w` (choose-tree starting at windows), **Then** an interactive tree view appears showing sessions > windows > panes with a preview pane
2. **Given** choose-tree is open, **When** user presses Up/Down to navigate and Right/Left to expand/collapse nodes, **Then** the tree navigates as expected; a preview of the selected item is shown
3. **Given** choose-tree is open, **When** user presses `f` and types a filter string, **Then** only items matching the filter are shown
4. **Given** choose-tree is open, **When** user presses `O`, **Then** the sort order cycles between name, index, and time
5. **Given** choose-tree is open, **When** user presses Enter on a window, **Then** the client switches to that window and choose-tree closes
6. **Given** choose-buffer is open, **When** user selects a buffer, **Then** the buffer content is pasted into the active pane

---

### User Story 15 - Popup and Menu System (Priority: P3)

A user wants to display popup overlays that can run commands or show content, and context menus with selectable actions, similar to tmux's `display-popup` and `display-menu` commands.

**Why this priority**: Popups and menus provide a clean way to run auxiliary commands (like file pickers, git status, quick notes) without leaving the current pane, and context menus provide a discoverable way to access actions without memorizing keybindings.

**Independent Test**: Can be fully tested by executing `display-popup` with a command, verifying the popup overlay appears with the command's output, and dismissing it; and by right-clicking to open a context menu and selecting an action.

**Acceptance Scenarios**:

1. **Given** any active session, **When** user executes `display-popup "echo hello"`, **Then** a centered popup overlay appears showing the command output; pressing Escape or `q` dismisses it
2. **Given** a popup is open, **When** the popup command exits, **Then** the popup automatically closes (if configured with `-E`)
3. **Given** a popup is desired, **When** user specifies size and position options, **Then** the popup renders at the specified dimensions and location within the terminal viewport
4. **Given** mouse mode is enabled, **When** user right-clicks in a pane, **Then** a context menu appears with common actions (split, close, zoom, copy, paste, etc.)
5. **Given** a context menu is open, **When** user clicks an action or presses its shortcut key, **Then** the action executes and the menu closes

---

### User Story 16 - Multi-Client Session Sharing (Priority: P3)

A user wants multiple browser tabs (or browsers on different machines on the same trusted network) to connect to the same session simultaneously, with all clients seeing the same terminal output in real-time -- similar to tmux's multi-client attach capability. No authentication is required; access is open to any client that can reach the server, mirroring tmux's Unix socket permission model. Optionally, some clients can be set to read-only mode.

**Why this priority**: Multi-client support is a key tmux feature for pair programming, remote assistance, and monitoring. It differentiates a terminal multiplexer from a simple terminal emulator.

**Independent Test**: Can be fully tested by opening two browser tabs connected to the same session, typing in one tab, and verifying the output appears in both tabs simultaneously.

**Acceptance Scenarios**:

1. **Given** a session is active in one browser tab, **When** another tab connects to the same session, **Then** both tabs show identical terminal output and receive updates in real-time
2. **Given** two clients are viewing the same session, **When** one client types input, **Then** the input appears in both clients' terminals
3. **Given** two clients are connected, **When** one client is set to read-only mode, **Then** that client can view but not send input to the terminal
4. **Given** multiple clients are connected, **When** one client switches windows, **Then** other clients can either follow or maintain their own independent view (configurable)
5. **Given** multiple clients are attached, **When** user executes a client-listing command, **Then** all connected clients are listed with their connection details

---

### User Story 17 - Pane Border Customization and Visual Display (Priority: P3)

A user wants customizable pane borders with options for border style (single, double, heavy, simple), active pane highlighting (color or arrows), border labels showing pane title or running command, and clock mode display.

**Why this priority**: Visual customization helps users quickly identify panes and their context. Border labels showing the running command are particularly useful for complex layouts. Clock mode is a minor but expected tmux feature.

**Independent Test**: Can be fully tested by setting border styles and verifying visual changes, enabling border labels and verifying pane titles appear, and pressing `Ctrl+B t` to enter clock mode.

**Acceptance Scenarios**:

1. **Given** multiple panes exist, **When** user sets `pane-border-style fg=blue` and `pane-active-border-style fg=green`, **Then** inactive pane borders appear blue and the active pane border appears green
2. **Given** `pane-border-status` is set to `top`, **When** user views panes, **Then** each pane has a label at the top of its border showing the pane title or running command
3. **Given** any pane, **When** user presses `Ctrl+B t`, **Then** the pane shows a large ASCII clock display; pressing any key exits clock mode
4. **Given** `pane-border-indicators` is set to `arrows`, **When** user views the layout, **Then** arrows indicate which pane is active at the border intersections

---

### User Story 18 - Format and Template System (Priority: P3)

A user wants dynamic format strings that can be used in status bar content, pane border labels, window titles, and other display elements -- interpolating variables like session name, window index, pane command, hostname, and time.

**Why this priority**: The format system is what makes tmux's status bar and display features truly powerful. Without it, users can only show static text. With it, they can create rich, information-dense displays that update dynamically.

**Independent Test**: Can be fully tested by setting `status-right` to a format string containing variables like `#{session_name}` and `#{pane_current_command}`, and verifying the status bar shows the correct interpolated values that update in real-time.

**Acceptance Scenarios**:

1. **Given** a format string `#{session_name} - #{window_index}:#{window_name}`, **When** rendered in the status bar, **Then** it shows the current session name, window index, and window name with live updates
2. **Given** a conditional format `#{?pane_synchronized,SYNC,}`, **When** broadcast mode is on, **Then** it shows "SYNC"; when off, it shows nothing
3. **Given** a format with time `%H:%M`, **When** rendered in status-right, **Then** it shows the current time, updating at the configured status-interval
4. **Given** a pane running `vim`, **When** `#{pane_current_command}` is used in a format string, **Then** it resolves to "vim"

---

### Edge Cases

- What happens when copy mode is entered while broadcast mode is active? Broadcast should pause and resume when copy mode exits.
- What happens when a user tries to break-pane on the last remaining pane in a window? The operation should succeed by creating a new window for the pane and closing the now-empty window.
- What happens when a user sets an option at the wrong scope (e.g., window option as session option)? A clear error message should indicate the correct scope.
- What happens when the paste buffer limit is reached during a copy mode selection? The oldest buffer should be evicted to make room.
- What happens when mouse scroll and keyboard copy mode conflict? The most recent input method should take priority without corrupting state.
- What happens when a popup is open and the underlying pane produces output? The pane output should continue buffering and be visible once the popup closes.
- What happens when two clients try to send input simultaneously to the same pane? Inputs should be serialized in the order received by the server.
- What happens when a key binding references a command that doesn't exist? An error should be displayed without crashing.
- What happens when layout cycling is attempted on a single-pane window? The operation should be silently ignored since all layouts look the same with one pane.
- What happens when choose-tree is open and a session is deleted externally? The tree should refresh and remove the deleted entry.

## Requirements *(mandatory)*

### Functional Requirements

**Copy Mode & Scrollback**

- **FR-001**: System MUST maintain a scrollback buffer for each pane, configurable up to a maximum line count (default: 2000 lines)
- **FR-002**: System MUST provide a copy mode that allows keyboard-driven cursor movement through the scrollback buffer using vi-style key bindings (h/j/k/l, w/b/e, 0/$, g/G, Ctrl+U/Ctrl+D)
- **FR-003**: System MUST support text search within copy mode using `/` (forward) and `?` (backward) with `n`/`N` for next/previous match
- **FR-004**: System MUST support visual selection in copy mode (Space to begin, Enter to copy) that yanks selected text to a paste buffer
- **FR-005**: System MUST allow pasting from the most recent paste buffer via a keybinding

**Command System**

- **FR-006**: System MUST provide a command prompt (triggered by `Prefix :`) that accepts text input and executes commands
- **FR-007**: System MUST implement a command parser that recognizes command names, flags, arguments, and simple target specifiers (`:windowIdx`, `.paneIdx`) consistent with tmux command syntax. Command chaining (`\;`), brace grouping (`{}`), and conditional commands (`if-shell`) are deferred to a future iteration
- **FR-008**: System MUST support command history (Up/Down arrow navigation) in the command prompt
- **FR-009**: System MUST support tab-completion for command names in the command prompt
- **FR-010**: System MUST display error messages for invalid or failed commands

**Key Bindings**

- **FR-011**: System MUST support binding custom key combinations to commands via `bind-key`
- **FR-012**: System MUST support unbinding keys via `unbind-key`
- **FR-013**: System MUST support multiple key tables (at minimum: root, prefix, copy-mode-vi)
- **FR-014**: System MUST support changing the prefix key via the `prefix` option
- **FR-015**: System MUST provide all default tmux keybindings as the baseline configuration
- **FR-016**: System MUST persist custom key bindings across sessions

**Pane Operations**

- **FR-017**: System MUST support swapping two panes' positions within a window layout
- **FR-018**: System MUST support breaking a pane out of a multi-pane window into a new window
- **FR-019**: System MUST support joining a pane from one window into another window's layout
- **FR-020**: System MUST display pane index numbers as overlays on demand (display-panes) with keyboard selection
- **FR-021**: System MUST support rotating pane positions within a layout
- **FR-022**: System MUST support marking a pane for reference in subsequent commands
- **FR-023**: System MUST support capturing visible pane content (and optionally scrollback) to a paste buffer
- **FR-024**: System MUST support respawning a new process in a pane whose process has exited

**Window Operations**

- **FR-025**: System MUST support selecting windows by index number (0-9) via keybindings
- **FR-026**: System MUST support renaming windows via keybinding (Prefix ,) and command
- **FR-027**: System MUST support swapping two windows' indices
- **FR-028**: System MUST support moving a window to a different index
- **FR-029**: System MUST track and allow switching to the last-active window (Prefix l)
- **FR-030**: System MUST support automatic window renaming based on the currently running command in the active pane

**Built-in Layouts**

- **FR-031**: System MUST provide five preset layouts: even-horizontal, even-vertical, main-horizontal, main-vertical, and tiled
- **FR-032**: System MUST support cycling through preset layouts via keybinding (Prefix Space)
- **FR-033**: System MUST support selecting a specific layout by name via command

**Status Bar**

- **FR-034**: System MUST render a status bar with configurable left, center (window list), and right sections
- **FR-035**: Status bar MUST display the window list with the active window visually highlighted
- **FR-036**: Status bar MUST show activity/bell/silence indicators on window labels when monitoring is enabled
- **FR-037**: Status bar position MUST be configurable (top or bottom)
- **FR-038**: Status bar MUST support showing/hiding via option
- **FR-039**: Status bar content MUST support format string interpolation for dynamic values

**Mouse Support**

- **FR-040**: System MUST support mouse click to focus/select a pane
- **FR-041**: System MUST support mouse wheel scrolling to enter copy mode and scroll through history
- **FR-042**: System MUST support mouse drag on pane borders for resizing
- **FR-043**: System MUST support double-click to select a word and triple-click to select a line
- **FR-044**: System MUST support click-to-select window in the status bar
- **FR-045**: Mouse support MUST be togglable via a master `mouse` option (default: `on`, diverging from tmux's default of `off` to match web-native expectations)

**Session Management**

- **FR-046**: System MUST support clean session detach that preserves all processes and state
- **FR-047**: System MUST support switching between sessions within the same client
- **FR-048**: System MUST provide an interactive tree browser (choose-tree) for sessions, windows, and panes

**Activity Monitoring**

- **FR-049**: System MUST support per-window activity monitoring that flags windows with new output
- **FR-050**: System MUST support per-window silence monitoring with configurable timeout
- **FR-051**: System MUST support bell monitoring and notification
- **FR-052**: System MUST visually indicate monitored events in the status bar and optionally display a message

**Paste Buffers**

- **FR-053**: System MUST maintain a stack of paste buffers (configurable limit, default 50)
- **FR-054**: System MUST support listing, viewing, deleting, and selecting from paste buffers
- **FR-055**: System MUST support pasting from a specific named buffer

**Configuration/Options System**

- **FR-056**: System MUST support a hierarchical option system with global, session, window, and pane scopes
- **FR-057**: System MUST support `set-option` and `show-options` commands for managing options
- **FR-058**: System MUST persist option values across sessions and reconnections
- **FR-059**: System MUST support loading a batch of configuration commands from a text file using tmux command syntax (one command per line, equivalent to `source-file` loading a `.tmux.conf`-style file)

**Hooks**

- **FR-060**: System MUST support registering commands to execute on lifecycle events (after-new-window, pane-died, session-renamed, etc.)
- **FR-061**: System MUST support listing and removing hooks

**Interactive Modes**

- **FR-062**: System MUST provide choose-tree with hierarchical navigation, filtering, sorting, and preview
- **FR-063**: System MUST provide choose-buffer for interactive buffer selection

**Popups and Menus**

- **FR-064**: System MUST support displaying popup overlays that can run commands
- **FR-065**: System MUST support context menus with selectable actions

**Multi-Client**

- **FR-066**: System MUST allow multiple browser connections to view and interact with the same session simultaneously without requiring authentication (trusted-network model)
- **FR-067**: System MUST support read-only client mode

**Display**

- **FR-068**: System MUST support configurable pane border styles and active pane highlighting
- **FR-069**: System MUST support a clock mode display (Prefix t)
- **FR-070**: System MUST support a format string system for interpolating session/window/pane variables into display strings

### Key Entities

- **Paste Buffer**: A named text storage unit with content, creation timestamp, and size. Buffers are ordered in a stack; the most recently created is the default. Shared across all sessions within the application instance.
- **Key Binding**: A mapping from a key combination within a key table to a command string. Has scope (key table name), trigger (key combination), and action (command with arguments). Persisted per user.
- **Option**: A named configuration value with a scope (global, session, window, or pane), a type (string, number, boolean, array), and a default value. Inherits from parent scope when not explicitly set.
- **Hook**: A mapping from an event name to one or more commands that execute automatically when the event fires. Has scope (global or session) and ordering.
- **Format Variable**: A named value that resolves dynamically at render time to current state (e.g., session_name, pane_current_command, window_index). Used in format string interpolation.
- **Command**: A named operation with defined syntax (flags and arguments) that can be invoked via the command prompt, key bindings, hooks, or configuration loading.

## Clarifications

### Session 2026-02-22

- Q: What is the multi-client access control model? → A: No authentication; open access on the trusted network (same as tmux's Unix socket permission model). No user accounts, login, or invite system.
- Q: What level of tmux command syntax fidelity should the parser support? → A: Standard flags/arguments and simple target specifiers (`:windowIdx`, `.paneIdx`); skip command chaining (`\;`), brace grouping (`{}`), and conditional commands (`if-shell`) for now. These can be added later.
- Q: Should advanced tmux features (session groups, link/unlink windows, pipe-pane, run-shell, if-shell, wait-for, server-access) be in scope? → A: Exclude all from this spec. Document as future candidates. The 18 user stories already represent comprehensive scope.
- Q: Should mouse mode default to on or off in the web context? → A: Default mouse to `on` (web-native behavior). Unlike terminal tmux, all WebTerm users have a mouse. Users can disable via `set-option mouse off`.
- Q: What format should configuration files use for the source-file equivalent? → A: tmux command syntax (one command per line, same as `.tmux.conf`). Reuses the command parser and allows users to adapt their existing tmux configs directly.

## Assumptions

- Vi-mode keybindings will be the default for copy mode (consistent with tmux's `mode-keys vi` setting). Emacs-mode keybindings are out of scope for the initial implementation.
- The command parser will support the most commonly used tmux commands first, with additional commands added incrementally. Full 100% tmux command compatibility is a long-term goal.
- Format string support will start with the most commonly used variables (session_name, window_index, window_name, pane_current_command, host, time) and expand over time.
- The options system will persist to the existing SQLite database, extending the current schema.
- Multi-client support will leverage the existing WebSocket infrastructure, adding session-level connection multiplexing.
- Mouse interactions will be implemented using standard browser mouse events on the xterm.js terminal container, respecting the existing binary WebSocket protocol for input routing.
- The scrollback buffer size will be limited by available browser memory; a reasonable default of 2000 lines will be used with user-configurable maximum.
- Features that require Unix-specific capabilities (Unix domain sockets, SIGTSTP/suspend, terminfo manipulation, iTerm2 control mode) are excluded as they have no meaningful web equivalent.
- Automatic window renaming relies on the backend detecting the foreground process name from the PTY, which may have platform-specific behavior.
- Pane border rendering in the browser will use CSS/HTML rather than terminal drawing characters, which may differ visually from native tmux but will be functionally equivalent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can enter copy mode, search for text, navigate with vi keys, select a region, copy it, and paste it into another pane -- completing the full workflow in under 15 seconds for an experienced user
- **SC-002**: At least 40 of the most common tmux commands are recognized and executable via the command prompt (covering session, window, pane, layout, option, key binding, buffer, and hook operations)
- **SC-003**: Users can customize at least the prefix key, 20+ key bindings, and 10+ display/behavior options, with all customizations persisting across sessions
- **SC-004**: All 5 preset layouts (even-horizontal, even-vertical, main-horizontal, main-vertical, tiled) render correctly for any number of panes from 2 to 16
- **SC-005**: The status bar renders with correct window list, activity indicators, and custom format content, updating at a configurable interval (default 15 seconds) without perceptible UI lag
- **SC-006**: Mouse click-to-focus, scroll-to-browse-history, and drag-to-resize all work without conflicts with terminal mouse event passthrough
- **SC-007**: A tmux user can open WebTerm and perform their typical tmux workflow (create sessions, split panes, switch windows by number, copy text, run commands) using their muscle memory with at least 80% of tmux default keybindings working identically
- **SC-008**: Two browser tabs connected to the same session both display output in real-time with less than 200 milliseconds visual delay between them
- **SC-009**: The choose-tree interactive browser displays all sessions/windows/panes hierarchically and allows navigation, filtering, and selection within 2 seconds of invocation regardless of the number of sessions
- **SC-010**: Activity monitoring correctly flags background windows with new output within 1 second of the output occurring, and the flag clears when the user views that window
