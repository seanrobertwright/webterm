import { CommandRegistry } from './command-registry.js';

/** Pre-configured registry with all tmux-compatible commands */
export const defaultRegistry = new CommandRegistry();

// ============================================================================
// Session Commands (5)
// ============================================================================

defaultRegistry
  .register({
    name: 'new-session',
    aliases: ['new'],
    description: 'Create a new session',
    flags: [
      { short: 's', takesValue: true, description: 'Session name' },
      { short: 'n', takesValue: true, description: 'Initial window name' },
      { short: 'd', takesValue: false, description: 'Detached' },
      { short: 'P', takesValue: false, description: 'Print info' },
      { short: 'F', takesValue: true, description: 'Format string' },
      { short: 'c', takesValue: true, description: 'Working directory' },
      { short: 'A', takesValue: false, description: 'Attach or create' },
      { short: 'x', takesValue: true, description: 'Width' },
      { short: 'y', takesValue: true, description: 'Height' },
    ],
    args: [],
  })
  .register({
    name: 'rename-session',
    aliases: ['rename'],
    description: 'Rename current session',
    flags: [],
    args: [{ name: 'name', required: true }],
  })
  .register({
    name: 'detach-client',
    aliases: ['detach'],
    description: 'Detach from session',
    flags: [],
    args: [],
  })
  .register({
    name: 'switch-client',
    aliases: ['switchc'],
    description: 'Switch to another session',
    flags: [
      { short: 'n', takesValue: false, description: 'Next session' },
      { short: 'p', takesValue: false, description: 'Previous session' },
      { short: 't', takesValue: true, description: 'Target session' },
    ],
    args: [],
  })
  .register({
    name: 'list-sessions',
    aliases: ['ls'],
    description: 'List all sessions',
    flags: [],
    args: [],
  })
  .register({
    name: 'list-clients',
    aliases: ['lsc'],
    description: 'List connected clients',
    flags: [],
    args: [],
  })
  .register({
    name: 'has-session',
    aliases: ['has'],
    description: 'Check if a session exists',
    flags: [
      { short: 't', takesValue: true, description: 'Target session' },
    ],
    args: [],
  })
  .register({
    name: 'kill-session',
    aliases: [],
    description: 'Kill a session',
    flags: [
      { short: 't', takesValue: true, description: 'Target session' },
    ],
    args: [],
  })
  .register({
    name: 'send-keys',
    aliases: ['send'],
    description: 'Send keys to a pane',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'l', takesValue: false, description: 'Literal keys' },
    ],
    args: [],
  });

// ============================================================================
// Window Commands (10)
// ============================================================================

defaultRegistry
  .register({
    name: 'new-window',
    aliases: ['neww'],
    description: 'Create a new window',
    flags: [
      { short: 'n', takesValue: true, description: 'Window name' },
      { short: 't', takesValue: true, description: 'Target window' },
      { short: 'P', takesValue: false, description: 'Print pane info' },
      { short: 'F', takesValue: true, description: 'Format string' },
      { short: 'c', takesValue: true, description: 'Working directory' },
      { short: 'd', takesValue: false, description: 'Do not make active' },
    ],
    args: [],
  })
  .register({
    name: 'kill-window',
    aliases: ['killw'],
    description: 'Kill current window',
    flags: [
      { short: 't', takesValue: true, description: 'Target window' },
    ],
    args: [],
  })
  .register({
    name: 'rename-window',
    aliases: ['renamew'],
    description: 'Rename current window',
    flags: [
      { short: 't', takesValue: true, description: 'Target window' },
    ],
    args: [{ name: 'name', required: true }],
  })
  .register({
    name: 'select-window',
    aliases: ['selectw'],
    description: 'Select window by index',
    flags: [
      { short: 't', takesValue: true, description: 'Target window' },
      { short: 'n', takesValue: false, description: 'Next window' },
      { short: 'p', takesValue: false, description: 'Previous window' },
    ],
    args: [],
  })
  .register({
    name: 'last-window',
    aliases: ['last'],
    description: 'Switch to last-active window',
    flags: [],
    args: [],
  })
  .register({
    name: 'next-window',
    aliases: ['next'],
    description: 'Switch to next window',
    flags: [],
    args: [],
  })
  .register({
    name: 'previous-window',
    aliases: ['prev'],
    description: 'Switch to previous window',
    flags: [],
    args: [],
  })
  .register({
    name: 'swap-window',
    aliases: ['swapw'],
    description: 'Swap two windows',
    flags: [
      { short: 's', takesValue: true, description: 'Source window' },
      { short: 't', takesValue: true, description: 'Target window' },
    ],
    args: [],
  })
  .register({
    name: 'move-window',
    aliases: ['movew'],
    description: 'Move window to new index',
    flags: [
      { short: 's', takesValue: true, description: 'Source window' },
      { short: 't', takesValue: true, description: 'Target window' },
    ],
    args: [],
  })
  .register({
    name: 'find-window',
    aliases: ['findw'],
    description: 'Search for window by content',
    flags: [],
    args: [{ name: 'match-string', required: true }],
  });

// ============================================================================
// Pane Commands (10)
// ============================================================================

defaultRegistry
  .register({
    name: 'split-window',
    aliases: ['splitw'],
    description: 'Split active pane',
    flags: [
      { short: 'h', takesValue: false, description: 'Horizontal split' },
      { short: 'v', takesValue: false, description: 'Vertical split' },
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'l', takesValue: true, description: 'Size' },
      { short: 'P', takesValue: false, description: 'Print pane info' },
      { short: 'F', takesValue: true, description: 'Format string' },
      { short: 'c', takesValue: true, description: 'Working directory' },
      { short: 'd', takesValue: false, description: 'Do not make active' },
    ],
    args: [],
  })
  .register({
    name: 'kill-pane',
    aliases: ['killp'],
    description: 'Kill active pane',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
    ],
    args: [],
  })
  .register({
    name: 'select-pane',
    aliases: ['selectp'],
    description: 'Select pane by direction or index',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'L', takesValue: false, description: 'Select left' },
      { short: 'R', takesValue: false, description: 'Select right' },
      { short: 'U', takesValue: false, description: 'Select up' },
      { short: 'D', takesValue: false, description: 'Select down' },
      { short: 'm', takesValue: false, description: 'Mark pane' },
      { short: 'M', takesValue: false, description: 'Unmark pane' },
    ],
    args: [],
  })
  .register({
    name: 'swap-pane',
    aliases: ['swapp'],
    description: 'Swap two panes',
    flags: [
      { short: 's', takesValue: true, description: 'Source pane' },
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'U', takesValue: false, description: 'Swap up' },
      { short: 'D', takesValue: false, description: 'Swap down' },
    ],
    args: [],
  })
  .register({
    name: 'break-pane',
    aliases: ['breakp'],
    description: 'Move pane to new window',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'n', takesValue: true, description: 'Window name' },
    ],
    args: [],
  })
  .register({
    name: 'join-pane',
    aliases: ['joinp'],
    description: 'Move pane into another window',
    flags: [
      { short: 's', takesValue: true, description: 'Source pane' },
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'h', takesValue: false, description: 'Horizontal join' },
      { short: 'v', takesValue: false, description: 'Vertical join' },
    ],
    args: [],
  })
  .register({
    name: 'resize-pane',
    aliases: ['resizep'],
    description: 'Resize pane',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'L', takesValue: false, description: 'Resize left' },
      { short: 'R', takesValue: false, description: 'Resize right' },
      { short: 'U', takesValue: false, description: 'Resize up' },
      { short: 'D', takesValue: false, description: 'Resize down' },
      { short: 'x', takesValue: true, description: 'Width' },
      { short: 'y', takesValue: true, description: 'Height' },
      { short: 'Z', takesValue: false, description: 'Toggle zoom' },
    ],
    args: [],
  })
  .register({
    name: 'rotate-window',
    aliases: ['rotatew'],
    description: 'Rotate pane positions',
    flags: [
      { short: 'D', takesValue: false, description: 'Rotate forward/down' },
      { short: 'U', takesValue: false, description: 'Rotate backward/up' },
    ],
    args: [],
  })
  .register({
    name: 'display-panes',
    aliases: ['displayp'],
    description: 'Show pane numbers',
    flags: [],
    args: [],
  })
  .register({
    name: 'respawn-pane',
    aliases: ['respawnp'],
    description: 'Restart pane process',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'k', takesValue: false, description: 'Kill existing process' },
    ],
    args: [],
  });

// ============================================================================
// Layout Commands (3)
// ============================================================================

defaultRegistry
  .register({
    name: 'select-layout',
    aliases: ['selectl'],
    description: 'Apply a named layout',
    flags: [
      { short: 't', takesValue: true, description: 'Target window' },
    ],
    args: [{ name: 'layout-name', required: false }],
  })
  .register({
    name: 'next-layout',
    aliases: ['nextl'],
    description: 'Cycle to next layout',
    flags: [],
    args: [],
  })
  .register({
    name: 'previous-layout',
    aliases: ['prevl'],
    description: 'Cycle to previous layout',
    flags: [],
    args: [],
  });

// ============================================================================
// Key Binding Commands (3)
// ============================================================================

defaultRegistry
  .register({
    name: 'bind-key',
    aliases: ['bind'],
    description: 'Bind a key to a command',
    flags: [
      { short: 'T', takesValue: true, description: 'Key table' },
      { short: 'n', takesValue: false, description: 'Root table shorthand' },
      { short: 'r', takesValue: false, description: 'Repeat' },
    ],
    args: [
      { name: 'key', required: true },
      { name: 'command', required: true, completionKind: 'command' },
    ],
  })
  .register({
    name: 'unbind-key',
    aliases: ['unbind'],
    description: 'Remove a key binding',
    flags: [
      { short: 'T', takesValue: true, description: 'Key table' },
      { short: 'n', takesValue: false, description: 'Root table shorthand' },
    ],
    args: [{ name: 'key', required: true }],
  })
  .register({
    name: 'list-keys',
    aliases: ['lsk'],
    description: 'List all key bindings',
    flags: [
      { short: 'T', takesValue: true, description: 'Filter by key table' },
    ],
    args: [],
  });

// ============================================================================
// Option Commands (3)
// ============================================================================

defaultRegistry
  .register({
    name: 'set-option',
    aliases: ['set'],
    description: 'Set an option value',
    flags: [
      { short: 'g', takesValue: false, description: 'Global scope' },
      { short: 's', takesValue: false, description: 'Session scope' },
      { short: 'w', takesValue: false, description: 'Window scope' },
      { short: 'p', takesValue: false, description: 'Pane scope' },
      { short: 'u', takesValue: false, description: 'Unset option' },
    ],
    args: [
      { name: 'option-name', required: true, completionKind: 'option' },
      { name: 'value', required: false },
    ],
  })
  .register({
    name: 'show-options',
    aliases: ['show'],
    description: 'Display option values',
    flags: [
      { short: 'g', takesValue: false, description: 'Global scope' },
      { short: 's', takesValue: false, description: 'Session scope' },
      { short: 'w', takesValue: false, description: 'Window scope' },
      { short: 'p', takesValue: false, description: 'Pane scope' },
      { short: 'v', takesValue: false, description: 'Value only' },
    ],
    args: [],
  })
  .register({
    name: 'source-file',
    aliases: ['source'],
    description: 'Load configuration file',
    flags: [],
    args: [{ name: 'file-path', required: true, completionKind: 'file' }],
  });

// ============================================================================
// Buffer Commands (4)
// ============================================================================

defaultRegistry
  .register({
    name: 'list-buffers',
    aliases: ['lsb'],
    description: 'List paste buffers',
    flags: [],
    args: [],
  })
  .register({
    name: 'show-buffer',
    aliases: ['showb'],
    description: 'Display buffer contents',
    flags: [
      { short: 'b', takesValue: true, description: 'Buffer name' },
    ],
    args: [],
  })
  .register({
    name: 'delete-buffer',
    aliases: ['deleteb'],
    description: 'Delete a paste buffer',
    flags: [
      { short: 'b', takesValue: true, description: 'Buffer name' },
    ],
    args: [],
  })
  .register({
    name: 'paste-buffer',
    aliases: ['pasteb'],
    description: 'Paste buffer into pane',
    flags: [
      { short: 'b', takesValue: true, description: 'Buffer name' },
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'd', takesValue: false, description: 'Delete buffer after paste' },
    ],
    args: [],
  })
  .register({
    name: 'set-buffer',
    aliases: ['setb'],
    description: 'Set buffer content',
    flags: [
      { short: 'b', takesValue: true, description: 'Buffer name' },
    ],
    args: [{ name: 'data', required: true }],
  });

// ============================================================================
// Hook Commands (2)
// ============================================================================

defaultRegistry
  .register({
    name: 'set-hook',
    aliases: [],
    description: 'Set an event hook',
    flags: [
      { short: 'g', takesValue: false, description: 'Global scope' },
      { short: 'u', takesValue: false, description: 'Unregister hook' },
    ],
    args: [
      { name: 'event', required: true },
      { name: 'command', required: true, completionKind: 'command' },
    ],
  })
  .register({
    name: 'show-hooks',
    aliases: [],
    description: 'List registered hooks',
    flags: [
      { short: 'g', takesValue: false, description: 'Global scope' },
    ],
    args: [],
  });

// ============================================================================
// Display Commands (3)
// ============================================================================

defaultRegistry
  .register({
    name: 'display-message',
    aliases: ['display'],
    description: 'Show a status message',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'p', takesValue: false, description: 'Print to stdout' },
    ],
    args: [{ name: 'message', required: false }],
  })
  .register({
    name: 'clock-mode',
    aliases: [],
    description: 'Show clock in pane',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
    ],
    args: [],
  })
  .register({
    name: 'capture-pane',
    aliases: ['capturep'],
    description: 'Capture pane content to buffer',
    flags: [
      { short: 't', takesValue: true, description: 'Target pane' },
      { short: 'b', takesValue: true, description: 'Buffer name' },
      { short: 'S', takesValue: true, description: 'Start line' },
      { short: 'E', takesValue: true, description: 'End line' },
      { short: 'p', takesValue: false, description: 'Print to stdout' },
    ],
    args: [],
  })
  .register({
    name: 'display-popup',
    aliases: ['popup'],
    description: 'Display popup window',
    flags: [
      { short: 'w', takesValue: true, description: 'Width' },
      { short: 'h', takesValue: true, description: 'Height' },
      { short: 'E', takesValue: false, description: 'Close on exit' },
    ],
    args: [{ name: 'command', required: false }],
  });

// ============================================================================
// Interactive Mode Commands (2)
// ============================================================================

defaultRegistry
  .register({
    name: 'choose-tree',
    aliases: [],
    description: 'Interactive session/window/pane browser',
    flags: [
      { short: 's', takesValue: false, description: 'Show sessions' },
      { short: 'w', takesValue: false, description: 'Show windows' },
    ],
    args: [],
  })
  .register({
    name: 'choose-buffer',
    aliases: [],
    description: 'Interactive buffer picker',
    flags: [],
    args: [],
  });
