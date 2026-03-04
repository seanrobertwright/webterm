# Manual Testing Plan: tmux Compatibility

> **Pre-requisites**: `npm install && npm run build:shared && npm run dev`
> Open browser at `http://localhost:5173`. You should see a terminal session with a status bar.
>
> **Convention**: `C-b` means press `Ctrl+B` then release, then press the next key.

---

## 0. Startup & Baseline

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 0.1 | Run `npm run dev` | Backend on :9174, Vite on :5173, no crashes |✔️|
| 0.2 | Open `http://localhost:5173` | Terminal renders, cursor blinking, shell prompt visible |✔️|
| 0.3 | Type `echo hello` + Enter | Output `hello` appears in terminal |✔️|
| 0.4 | Status bar visible at bottom | Shows session name, window tab(s), clock/time area |✔️|
| 0.5 | Resize browser window | Terminal reflows, no corruption or blank areas |✔️|

---

## 1. Prefix Key & Basic Navigation

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 1.1 | Press `C-b` | Status bar or visual indicator shows prefix mode active |❌|
| 1.2 | Press `C-b` then `?` | Should show list-keys or help (if bound) |❌|
| 1.3 | Press `C-b` then an unbound key (e.g. `Z`) | Prefix mode exits, key is ignored (not sent to terminal) |❌|
| 1.4 | Press `C-b` then wait 2+ seconds | Prefix mode should time out and cancel |❌|

---

## 2. Pane Splitting & Focus

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 2.1 | Press `C-b %` (shift+5) | Vertical split — two panes side by side, each with a shell | |
| 2.2 | Press `C-b "` (shift+') | Horizontal split — pane splits top/bottom | |
| 2.3 | Press `C-b o` | Focus cycles to next pane (border highlight changes) | |
| 2.4 | Press `C-b Up/Down/Left/Right` | Focus moves directionally between panes | |
| 2.5 | Type in focused pane | Only the focused pane receives input | |
| 2.6 | Press `C-b z` | Active pane zooms to fill entire window area | |
| 2.7 | Press `C-b z` again | Zoom toggles off, original layout restored | |
| 2.8 | Press `C-b x` | Prompts to close active pane (or closes it) | |
| 2.9 | Close all panes except one | Last pane remains, window still alive | |

---

## 3. Pane Resize

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 3.1 | With 2+ panes, drag the splitter bar with mouse | Panes resize smoothly, terminals reflow | |
| 3.2 | Press `C-b C-Up` / `C-b C-Down` | Active pane resizes vertically by 1 row | |
| 3.3 | Press `C-b C-Left` / `C-b C-Right` | Active pane resizes horizontally by 1 col | |
| 3.4 | Resize to extreme minimum | Pane doesn't collapse to 0; minimum size enforced | |

---

## 4. Window Operations

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 4.1 | Press `C-b c` | New window created, status bar shows second tab | |
| 4.2 | Press `C-b n` | Switch to next window | |
| 4.3 | Press `C-b p` | Switch to previous window | |
| 4.4 | Press `C-b 0` / `C-b 1` / `C-b 2` | Switch to window by index number | |
| 4.5 | Press `C-b l` | Switch to last-used window | |
| 4.6 | Press `C-b ,` | Rename current window — prompt appears, enter new name, status bar updates | |
| 4.7 | Press `C-b &` | Kill current window — prompts confirmation, window removed from tab bar | |
| 4.8 | Create 3+ windows, close the middle one | Remaining windows renumber correctly in status bar | |

---

## 5. Command Prompt

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 5.1 | Press `C-b :` | Command prompt appears at bottom of screen | |
| 5.2 | Type `list-sessions` + Enter | Output shows current session(s) with name/window count | |
| 5.3 | Type `list-keys` + Enter | Output lists all key bindings | |
| 5.4 | Type `list-buffers` + Enter | Output shows paste buffer list (may be empty) | |
| 5.5 | Type `show-options` + Enter | Output lists current options and values | |
| 5.6 | Type partial command + Tab | Tab completion suggests matching commands | |
| 5.7 | Press Up/Down in prompt | Command history navigation works | |
| 5.8 | Press Escape in prompt | Prompt closes without executing | |
| 5.9 | Type `bogus-command` + Enter | Error message displayed (not a crash) | |

---

## 6. Command Execution (via `:` prompt)

### 6a. Commands with real handlers

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 6a.1 | `:list-sessions` | Shows session list with IDs and names | |
| 6a.2 | `:list-clients` | Shows connected WebSocket clients | |
| 6a.3 | `:select-window -t :0` | Switches to window at index 0 | |
| 6a.4 | `:rename-window test-name` | Active window renamed in status bar | |
| 6a.5 | `:last-window` | Switches to previously active window | |
| 6a.6 | `:swap-window -t :1` | Swaps current window position with window 1 | |
| 6a.7 | `:move-window -t :5` | Moves current window to index 5 | |
| 6a.8 | `:find-window search-term` | Searches window names/content for match | |
| 6a.9 | `:select-pane -t .0` | Focus moves to pane 0 | |
| 6a.10 | `:select-pane -U` / `-D` / `-L` / `-R` | Directional pane selection | |
| 6a.11 | `:swap-pane -U` / `-D` | Swap pane with neighbor | |
| 6a.12 | `:break-pane` | Active pane becomes its own new window | |
| 6a.13 | `:join-pane -t :0` | Active pane moves into window 0 as a split | |
| 6a.14 | `:rotate-window` | Pane positions rotate within window | |
| 6a.15 | `:respawn-pane` | Restarts the shell in the active pane | |
| 6a.16 | `:display-panes` | Pane index overlay appears briefly | |
| 6a.17 | `:capture-pane` | Captures pane content to paste buffer | |
| 6a.18 | `:select-layout even-horizontal` | Panes arranged equally side by side | |
| 6a.19 | `:select-layout even-vertical` | Panes stacked equally top to bottom | |
| 6a.20 | `:select-layout main-horizontal` | One main pane on top, others below | |
| 6a.21 | `:select-layout main-vertical` | One main pane on left, others right | |
| 6a.22 | `:select-layout tiled` | Panes tiled in a grid | |
| 6a.23 | `:next-layout` | Cycle to next layout preset | |
| 6a.24 | `:previous-layout` | Cycle to previous layout preset | |
| 6a.25 | `:set-option status-position top` | Status bar moves to top of screen | |
| 6a.26 | `:set-option mouse on` | Mouse support toggled | |
| 6a.27 | `:show-options -g` | Lists all global options with values | |
| 6a.28 | `:bind-key -T prefix t new-window` | Binds `C-b t` to create new window | |
| 6a.29 | Press `C-b t` | New window created (verifies 6a.28) | |
| 6a.30 | `:unbind-key -T prefix t` | Removes the binding from 6a.28 | |
| 6a.31 | `:list-keys -T prefix` | Shows only prefix table bindings | |
| 6a.32 | `:set-buffer "hello world"` | Stores text in paste buffer | |
| 6a.33 | `:show-buffer` | Displays "hello world" | |
| 6a.34 | `:paste-buffer` | "hello world" pasted into active pane | |
| 6a.35 | `:delete-buffer` | Removes the buffer | |
| 6a.36 | `:set-hook after-new-window 'display-message "new!"'` | Registers hook | |
| 6a.37 | `:show-hooks` | Lists registered hooks including the one above | |
| 6a.38 | `:display-message "test message"` | Message shown in status area or overlay | |
| 6a.39 | `:display-popup` | Popup overlay appears | |
| 6a.40 | `:choose-tree` | Interactive session/window/pane tree browser opens | |
| 6a.41 | `:choose-buffer` | Interactive buffer picker opens | |
| 6a.42 | `:detach-client` | Session detaches — UI shows detached state | |
| 6a.43 | `:switch-client -t session-name` | Switches to a different session (need 2+ sessions) | |
| 6a.44 | `:source-file` with a config | Loads options/bindings from config (may need file) | |

### 6b. Stub commands (return success but do nothing)

These commands are registered but call `stubSuccess()` — they won't actually perform the action. Document what happens:

| # | Command | Expected behavior | Actual | Pass? |
|---|---------|-------------------|--------|-------|
| 6b.1 | `:new-session` | Should create session, **likely returns OK but does nothing** | | |
| 6b.2 | `:rename-session new-name` | Should rename session, **likely no-op** | | |
| 6b.3 | `:new-window` | Should create window, **likely no-op** (C-b c may use different path) | | |
| 6b.4 | `:kill-window` | Should kill window, **likely no-op** (C-b & may use different path) | | |
| 6b.5 | `:split-window` | Should split pane, **likely no-op** (C-b % / " may use different path) | | |
| 6b.6 | `:kill-pane` | Should kill pane, **likely no-op** | | |
| 6b.7 | `:resize-pane -U 5` | Should resize pane, **likely no-op** | | |
| 6b.8 | `:clock-mode` | Should show clock, **likely no-op** (C-b t may use different path) | | |

> **Note**: The stub commands above are the primary gap. The keybinding shortcuts (e.g. `C-b c` for new-window) likely work via direct WebSocket messages, bypassing the command service. But the `:command` equivalents are stubs.

---

## 7. Copy Mode (vi bindings)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 7.1 | Press `C-b [` | Enter copy mode — cursor appears, terminal input paused | |
| 7.2 | Press `h`, `j`, `k`, `l` | Cursor moves left, down, up, right | |
| 7.3 | Press `0` | Cursor jumps to beginning of line | |
| 7.4 | Press `$` | Cursor jumps to end of line | |
| 7.5 | Press `w` | Cursor jumps to next word start | |
| 7.6 | Press `b` | Cursor jumps to previous word start | |
| 7.7 | Press `e` | Cursor jumps to word end | |
| 7.8 | Press `g` | Cursor jumps to top of scrollback | |
| 7.9 | Press `G` | Cursor jumps to bottom of scrollback | |
| 7.10 | Press `C-u` | Scroll half page up | |
| 7.11 | Press `C-d` | Scroll half page down | |
| 7.12 | Press `Space` to begin selection | Selection starts, visual highlight appears | |
| 7.13 | Move cursor to extend selection | Highlighted region grows | |
| 7.14 | Press `Enter` or `y` to yank | Selection copied, exits copy mode | |
| 7.15 | Press `C-b ]` | Paste yanked text into terminal | |
| 7.16 | In copy mode, press `/` | Forward search prompt appears | |
| 7.17 | Type search term + Enter | Cursor jumps to first match, match highlighted | |
| 7.18 | Press `n` | Jump to next search match | |
| 7.19 | Press `N` | Jump to previous search match | |
| 7.20 | Press `?` | Backward search prompt appears | |
| 7.21 | Press `V` (if supported) | Line selection mode | |
| 7.22 | Press `q` or `Escape` | Exit copy mode, return to normal terminal | |

---

## 8. Mouse Support

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 8.1 | Click on a non-focused pane | That pane receives focus | |
| 8.2 | Scroll mouse wheel in a pane | Scrolls terminal scrollback (or enters copy mode) | |
| 8.3 | Click-drag on pane splitter | Resizes panes | |
| 8.4 | Click on a window tab in status bar | Switches to that window | |
| 8.5 | Right-click on a pane | Context menu appears (if implemented) | |

---

## 9. Status Bar & Format Strings

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 9.1 | Observe status bar left section | Shows session name | |
| 9.2 | Observe status bar center | Shows window tabs with names and indices | |
| 9.3 | Active window tab is visually distinct | Different color/style from inactive tabs | |
| 9.4 | Observe status bar right section | Shows time (updates periodically) | |
| 9.5 | `:set-option status-left "custom: #S"` | Left section updates with custom format | |
| 9.6 | `:set-option status-right "#H %H:%M"` | Right section updates with hostname and time | |
| 9.7 | `:set-option status-position top` | Status bar moves to top | |
| 9.8 | Window with activity shows flag | After activity in background window, flag char appears on tab | |

---

## 10. Interactive Modes

### 10a. Choose Tree (`C-b s` or `:choose-tree`)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 10a.1 | Open choose-tree | Tree view shows sessions > windows > panes hierarchy | |
| 10a.2 | Press `j` / `k` or Up/Down | Navigate between entries | |
| 10a.3 | Press Enter on a window | Switches to that window, tree closes | |
| 10a.4 | Press Enter on a session | Switches to that session | |
| 10a.5 | Type to filter | List filters to matching entries | |
| 10a.6 | Press `q` or Escape | Closes tree without action | |
| 10a.7 | Collapse/expand nodes | Tree nodes toggle with arrow keys or Enter | |

### 10b. Choose Buffer (`:choose-buffer`)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 10b.1 | Add buffers via `:set-buffer`, then open choose-buffer | Buffer list displays | |
| 10b.2 | Navigate and select a buffer | Buffer content pasted into terminal | |
| 10b.3 | Press Escape | Closes without action | |

### 10c. Display Panes (`:display-panes`)

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 10c.1 | Open display-panes with 2+ panes | Large pane index numbers overlay each pane | |
| 10c.2 | Press a number key | Focus switches to that pane | |
| 10c.3 | Wait without pressing | Overlay disappears after timeout | |

### 10d. Clock Mode

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 10d.1 | Press `C-b t` (if bound) | Large clock display fills the pane | |
| 10d.2 | Press any key | Clock mode exits, returns to terminal | |

---

## 11. Session Management

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 11.1 | `:detach-client` | UI shows detached/disconnected state | |
| 11.2 | Reload the page | Reconnects to existing session (session persisted) | |
| 11.3 | Open a second browser tab to same URL | Both tabs show the same session (multi-client) | |
| 11.4 | Type in tab 1 | Output appears in both tabs | |
| 11.5 | Create a second session (via UI if available) | Two sessions exist | |
| 11.6 | `:switch-client -t other-session` | UI switches to the other session | |
| 11.7 | `:list-sessions` | Both sessions listed | |
| 11.8 | `:list-clients` | Both browser tabs listed as clients | |

---

## 12. Options System

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 12.1 | `:set-option -g base-index 1` | Window indexing starts at 1 | |
| 12.2 | `:set-option -w monitor-activity on` | Activity monitoring enabled for window | |
| 12.3 | `:show-options -g` | Lists all global options | |
| 12.4 | `:show-options -w` | Lists window-scoped options | |
| 12.5 | `:set-option prefix C-a` | Prefix key changes to Ctrl+A | |
| 12.6 | Press `C-a c` | New window created (prefix changed) | |
| 12.7 | `:set-option -u prefix` | Unset option, reverts to default (C-b) | |

---

## 13. Paste Buffers

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 13.1 | `:set-buffer "first"` | Buffer 0 set to "first" | |
| 13.2 | `:set-buffer "second"` | Buffer stack now has 2 entries | |
| 13.3 | `:list-buffers` | Shows both buffers with sizes | |
| 13.4 | `:show-buffer` | Displays content of most recent buffer ("second") | |
| 13.5 | `:show-buffer -b 0` | Displays "first" (or whichever is buffer 0) | |
| 13.6 | `:paste-buffer` | "second" pasted into terminal | |
| 13.7 | `:delete-buffer` | Most recent buffer removed | |
| 13.8 | `:list-buffers` | Only one buffer remains | |
| 13.9 | Copy text in copy mode (Section 7) | Text appears in buffer list | |

---

## 14. Key Binding Customization

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 14.1 | `:bind-key -T prefix M new-window` | Binds `C-b M` to new-window | |
| 14.2 | Press `C-b M` | New window created | |
| 14.3 | `:unbind-key -T prefix M` | Removes the binding | |
| 14.4 | Press `C-b M` | Nothing happens (binding removed) | |
| 14.5 | `:list-keys` | Shows all active bindings | |
| 14.6 | `:list-keys -T prefix` | Shows only prefix table bindings | |
| 14.7 | Reload page | Custom bindings persist (stored in SQLite) | |

---

## 15. Hooks & Events

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 15.1 | `:set-hook after-new-window 'display-message "Window created!"'` | Hook registered | |
| 15.2 | Create a new window | "Window created!" message appears | |
| 15.3 | `:show-hooks` | Lists the registered hook | |

---

## 16. Edge Cases & Error Handling

| # | Step | Expected | Pass? |
|---|------|----------|-------|
| 16.1 | Close all panes in a window | Window closes, switches to another or shows empty state | |
| 16.2 | Close all windows | Session ends or shows a recovery state | |
| 16.3 | Kill the backend process while frontend is open | Frontend shows disconnected state, attempts reconnect | |
| 16.4 | Restart backend | Frontend reconnects, session restored from SQLite | |
| 16.5 | Open 10+ panes in one window | All panes render (may be small), no crashes | |
| 16.6 | Open 10+ windows | Status bar shows all tabs, scrollable or truncated gracefully | |
| 16.7 | Run `cat /dev/urandom \| head -c 100000` in a pane | Terminal handles large output burst without freezing | |
| 16.8 | Rapidly press `C-b c` 20 times | Windows created without race conditions or duplicates | |
| 16.9 | Press `C-b :` then enter an extremely long command | No crash; error or truncation handled gracefully | |
| 16.10 | Disconnect WiFi / network | Frontend detects disconnection, shows status, buffers for reconnect | |

---

## Results Summary

| Section | Total | Passed | Failed | Skipped |
|---------|-------|--------|--------|---------|
| 0. Startup | 5 | | | |
| 1. Prefix Key | 4 | | | |
| 2. Pane Split & Focus | 9 | | | |
| 3. Pane Resize | 4 | | | |
| 4. Window Ops | 8 | | | |
| 5. Command Prompt | 9 | | | |
| 6a. Real Commands | 44 | | | |
| 6b. Stub Commands | 8 | | | |
| 7. Copy Mode | 22 | | | |
| 8. Mouse | 5 | | | |
| 9. Status Bar | 8 | | | |
| 10. Interactive Modes | 14 | | | |
| 11. Session Mgmt | 8 | | | |
| 12. Options | 7 | | | |
| 13. Paste Buffers | 9 | | | |
| 14. Key Bindings | 7 | | | |
| 15. Hooks | 3 | | | |
| 16. Edge Cases | 10 | | | |
| **TOTAL** | **188** | | | |

---

## Known Gaps Before Testing

These 8 commands are **confirmed stubs** in `command-service.ts` (they return success without performing any action):

1. `new-session`
2. `rename-session`
3. `new-window` (via `:` command — `C-b c` may work via direct WebSocket message)
4. `kill-window` (via `:` command — `C-b &` may work via direct WebSocket message)
5. `split-window` (via `:` command — `C-b %`/`"` may work via direct WebSocket message)
6. `kill-pane` (via `:` command — `C-b x` may work via direct WebSocket message)
7. `resize-pane` (via `:` command — `C-b C-arrows` may work via direct WebSocket message)
8. `clock-mode` (via `:` command — `C-b t` may work via direct keybinding action)

The keybinding shortcuts for these operations likely bypass the command service and use direct WebSocket messages, so the **keyboard shortcuts may work even though the `:` commands are stubs**.
