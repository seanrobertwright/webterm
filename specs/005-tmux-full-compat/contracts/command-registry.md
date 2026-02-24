# Command Registry Contract: tmux Compatibility

**Phase 1 Output** | **Date**: 2026-02-22

## Overview

The command registry defines all tmux-compatible commands available via the command prompt (`Prefix :`), key bindings, hooks, and configuration files. Each command has a canonical name, optional aliases, flag definitions, and positional argument definitions.

## Command Parser Interface

```typescript
// Tokenizer
function tokenize(input: string): string[];

// Target specifier
interface TmuxTarget {
  session: string | null;
  window: string | null;
  pane: string | null;
}
function parseTarget(raw: string): TmuxTarget | null;

// Parse result
interface ParsedCommand {
  command: string;
  flags: Map<string, boolean | string>;
  positional: string[];
  target: TmuxTarget | null;
}

type ParseResult =
  | { ok: true; value: ParsedCommand }
  | { ok: false; error: ParseError };

// Registry
class CommandRegistry {
  register(def: CommandDef): this;
  resolve(nameOrAlias: string): CommandDef | null;
  commandNames(): string[];
  complete(partial: string): CompletionResult;
}
```

## Initial Command Set (40 commands for SC-002)

### Session Commands (5)

| Command | Aliases | Description |
|---------|---------|-------------|
| `new-session` | `new` | Create a new session |
| `rename-session` | `rename` | Rename current session |
| `detach-client` | `detach` | Detach from session |
| `switch-client` | `switchc` | Switch to another session |
| `list-sessions` | `ls` | List all sessions |

### Window Commands (10)

| Command | Aliases | Description |
|---------|---------|-------------|
| `new-window` | `neww` | Create a new window |
| `kill-window` | `killw` | Kill current window |
| `rename-window` | `renamew` | Rename current window |
| `select-window` | `selectw` | Select window by index |
| `last-window` | `last` | Switch to last-active window |
| `next-window` | `next` | Switch to next window |
| `previous-window` | `prev` | Switch to previous window |
| `swap-window` | `swapw` | Swap two windows |
| `move-window` | `movew` | Move window to new index |
| `find-window` | `findw` | Search for window by content |

### Pane Commands (10)

| Command | Aliases | Description |
|---------|---------|-------------|
| `split-window` | `splitw` | Split active pane |
| `kill-pane` | `killp` | Kill active pane |
| `select-pane` | `selectp` | Select pane by direction or index |
| `swap-pane` | `swapp` | Swap two panes |
| `break-pane` | `breakp` | Move pane to new window |
| `join-pane` | `joinp` | Move pane into another window |
| `resize-pane` | `resizep` | Resize pane |
| `rotate-window` | `rotatew` | Rotate pane positions |
| `display-panes` | `displayp` | Show pane numbers |
| `respawn-pane` | `respawnp` | Restart pane process |

### Layout Commands (3)

| Command | Aliases | Description |
|---------|---------|-------------|
| `select-layout` | `selectl` | Apply a named layout |
| `next-layout` | `nextl` | Cycle to next layout |
| `previous-layout` | `prevl` | Cycle to previous layout |

### Key Binding Commands (3)

| Command | Aliases | Description |
|---------|---------|-------------|
| `bind-key` | `bind` | Bind a key to a command |
| `unbind-key` | `unbind` | Remove a key binding |
| `list-keys` | `lsk` | List all key bindings |

### Option Commands (3)

| Command | Aliases | Description |
|---------|---------|-------------|
| `set-option` | `set` | Set an option value |
| `show-options` | `show` | Display option values |
| `source-file` | `source` | Load configuration file |

### Buffer Commands (4)

| Command | Aliases | Description |
|---------|---------|-------------|
| `list-buffers` | `lsb` | List paste buffers |
| `show-buffer` | `showb` | Display buffer contents |
| `delete-buffer` | `deleteb` | Delete a paste buffer |
| `paste-buffer` | `pasteb` | Paste buffer into pane |

### Hook Commands (2)

| Command | Aliases | Description |
|---------|---------|-------------|
| `set-hook` | | Set an event hook |
| `show-hooks` | | List registered hooks |

### Display Commands (3)

| Command | Aliases | Description |
|---------|---------|-------------|
| `display-message` | `display` | Show a status message |
| `clock-mode` | | Show clock in pane |
| `capture-pane` | `capturep` | Capture pane content to buffer |

### Interactive Mode Commands (2)

| Command | Aliases | Description |
|---------|---------|-------------|
| `choose-tree` | | Interactive session/window/pane browser |
| `choose-buffer` | | Interactive buffer picker |

---

## Default Key Bindings (tmux-compatible)

### Prefix Table (Prefix = Ctrl+B)

| Key | Command |
|-----|---------|
| `"` | `split-window` |
| `%` | `split-window -h` |
| `!` | `break-pane` |
| `,` | (rename-window prompt) |
| `.` | (move-window prompt) |
| `0`-`9` | `select-window -t :N` |
| `:` | (command prompt) |
| `;` | `last-pane` |
| `[` | `copy-mode` |
| `]` | `paste-buffer` |
| `c` | `new-window` |
| `d` | `detach-client` |
| `l` | `last-window` |
| `m` | `select-pane -m` |
| `M` | `select-pane -M` |
| `n` | `next-window` |
| `o` | `select-pane -t :.+` |
| `p` | `previous-window` |
| `q` | `display-panes` |
| `s` | `choose-tree -s` |
| `t` | `clock-mode` |
| `w` | `choose-tree -w` |
| `x` | (kill-pane with confirm) |
| `z` | `resize-pane -Z` |
| `{` | `swap-pane -U` |
| `}` | `swap-pane -D` |
| `Space` | `next-layout` |
| `(` | `switch-client -p` |
| `)` | `switch-client -n` |
| `?` | `list-keys` |
| `=` | `choose-buffer` |
| `#` | `list-buffers` |
| Arrow keys | `select-pane -L/R/U/D` |
| `C-Arrow` | `resize-pane -L/R/U/D 1` |
| `M-Arrow` | `resize-pane -L/R/U/D 5` |
| `M-1` | `select-layout even-horizontal` |
| `M-2` | `select-layout even-vertical` |
| `M-3` | `select-layout main-horizontal` |
| `M-4` | `select-layout main-vertical` |
| `M-5` | `select-layout tiled` |
| `C-o` | `rotate-window` |

### Copy Mode Vi Table

| Key | Action |
|-----|--------|
| `q` / `Escape` | Cancel and exit copy mode |
| `h`/`j`/`k`/`l` | Cursor movement |
| `w`/`b`/`e` | Word motion |
| `0`/`$`/`^` | Line position |
| `g`/`G` | History top/bottom |
| `Ctrl+U`/`Ctrl+D` | Half page up/down |
| `Ctrl+B`/`Ctrl+F` | Full page up/down |
| `Space` | Begin selection |
| `v` | Toggle rectangle selection |
| `V` | Select line |
| `Enter` / `y` | Copy selection and exit |
| `/` | Search forward |
| `?` | Search backward |
| `n`/`N` | Next/previous search match |
| `H`/`M`/`L` | Top/middle/bottom of viewport |
