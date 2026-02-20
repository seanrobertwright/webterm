# WebTerm - Web Terminal Multiplexer

A web-based terminal multiplexer inspired by tmux. Run multiple terminal sessions in your browser with split panes, session persistence, and AI CLI tool support.

![WebTerm Screenshot](docs/screenshot.png)

## Features

- 🖥️ **Multi-pane terminal** - Split horizontally/vertically, resize by dragging
- ⌨️ **tmux-like keybindings** - Familiar Ctrl+B prefix shortcuts
- 🎨 **Cyberpunk theme** - Beautiful terminal aesthetic with GlitchCN/UI
- 💾 **Session persistence** - Save and restore your terminal layouts
- 📡 **Real-time communication** - WebSocket with binary protocol for low latency
- 🤖 **AI CLI support** - Optimized for Claude Code, Gemini CLI, Codex
- 🔄 **Broadcast mode** - Type in multiple panes simultaneously

## Quick Start

### Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+ or pnpm
- Windows 10+, macOS, or Linux

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/webterm.git
cd webterm

# Install dependencies
npm install

# Build shared types
npm run build:shared

# Start development servers
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- WebSocket: ws://localhost:3000/ws

### Production Build

```bash
# Build all packages
npm run build

# Start backend server
cd backend && npm start
```

## Keybindings

All keybindings use the `Ctrl+B` prefix (press Ctrl+B, release, then press the command key):

| Keybinding | Action |
|------------|--------|
| `Ctrl+B %` | Split pane vertically |
| `Ctrl+B "` | Split pane horizontally |
| `Ctrl+B ←↑↓→` | Navigate between panes |
| `Ctrl+B x` | Close current pane |
| `Ctrl+B z` | Zoom/unzoom pane |
| `Ctrl+B c` | Create new window |
| `Ctrl+B n` | Next window |
| `Ctrl+B p` | Previous window |
| `Ctrl+B S` | Save session |
| `Ctrl+B ?` | Show keybindings help |

Copy/paste shortcuts (no prefix needed):
- `Ctrl+Shift+C` - Copy selected text
- `Ctrl+Shift+V` - Paste from clipboard

## Project Structure

```
webterm/
├── backend/               # Node.js backend
│   └── src/
│       ├── api/           # WebSocket & REST handlers
│       ├── db/            # SQLite database
│       ├── models/        # Data models
│       ├── services/      # Business logic
│       └── utils/         # Utilities
├── frontend/              # React frontend
│   └── src/
│       ├── components/    # React components
│       ├── hooks/         # Custom hooks
│       ├── services/      # API clients
│       ├── stores/        # Zustand stores
│       └── styles/        # CSS & Tailwind
├── shared/                # Shared TypeScript types
│   └── types/
└── specs/                 # Feature specifications
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Terminal | xterm.js with WebGL renderer |
| Backend | Node.js, TypeScript |
| PTY | node-pty (powers VS Code terminal) |
| Database | SQLite (better-sqlite3) |
| WebSocket | ws |
| UI | GlitchCN/UI (shadcn-based) |

## API

### WebSocket Protocol

Connect to `ws://localhost:3000/ws?sessionId={optional}` for real-time terminal I/O.

**Binary messages** (for terminal I/O):
- Format: `[type:1][paneIdLength:1][paneId:N][payload:M]`
- Types: `0x01` INPUT, `0x02` OUTPUT

**JSON messages** (for control):
- `resize`, `create`, `close`, `split`, `focus`, `broadcast`

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/v1/sessions` | GET | List sessions |
| `/api/v1/sessions` | POST | Create session |
| `/api/v1/sessions/:id` | GET | Get session |
| `/api/v1/sessions/:id` | PATCH | Update session |
| `/api/v1/sessions/:id` | DELETE | Delete session |
| `/api/v1/sessions/:id/save` | POST | Save session |
| `/api/v1/system/info` | GET | System info |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Backend server port |
| `HOST` | localhost | Backend bind address |
| `WEBTERM_DB_PATH` | ./data/webterm.db | SQLite database path |
| `LOG_LEVEL` | info | Logging level |
| `MAX_PANES_PER_WINDOW` | 16 | Maximum panes per window |

## Development

```bash
# Run linting
npm run lint

# Run type checking
npm run typecheck

# Run tests
npm test

# Format code
npm run format
```

## Performance

WebTerm is optimized for low-latency terminal interaction:

- **Input latency**: < 50ms (binary WebSocket protocol)
- **Render**: 60fps (WebGL renderer)
- **Scrollback**: 10,000 lines per pane
- **Bundle size**: ~400KB gzipped
- **Memory**: < 200MB typical usage

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [xterm.js](https://xtermjs.org/) - Terminal emulation
- [node-pty](https://github.com/microsoft/node-pty) - PTY management
- [GlitchCN/UI](https://glitchcn.dev) - UI components
- [tmux](https://github.com/tmux/tmux) - Inspiration for keybindings
