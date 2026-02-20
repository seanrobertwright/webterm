# Quickstart: WebTerm Development Setup

**Time to first terminal**: ~5 minutes  
**Prerequisites**: Node.js 20+, npm 10+

---

## 1. Clone and Install

```bash
# Clone the repository
git clone <repo-url>
cd webterm

# Install dependencies (backend + frontend)
npm install
```

---

## 2. Project Structure

```
webterm/
├── backend/           # Node.js terminal server
│   ├── src/
│   │   ├── api/       # WebSocket handlers
│   │   ├── db/        # SQLite database
│   │   ├── models/    # TypeScript interfaces
│   │   └── services/  # PTY, session management
│   └── tests/
├── frontend/          # React terminal UI
│   ├── src/
│   │   ├── components/  # Terminal, layout components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── services/    # WebSocket client
│   │   └── stores/      # State management
│   └── tests/
├── shared/            # Shared types
│   └── types/
└── specs/             # Feature specifications
```

---

## 3. Development Commands

```bash
# Start both backend and frontend in development mode
npm run dev

# Start backend only (port 3001)
npm run dev:backend

# Start frontend only (port 5173)
npm run dev:frontend

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck

# Lint and format
npm run lint
npm run format
```

---

## 4. Environment Configuration

Create `.env` files as needed (defaults work for local development):

**backend/.env**
```env
PORT=3001
DATABASE_PATH=./data/sessions.db
DEFAULT_SHELL=default
LOG_LEVEL=debug
```

**frontend/.env**
```env
VITE_WS_URL=ws://localhost:3001/ws
VITE_API_URL=http://localhost:3001/api/v1
```

---

## 5. First Run Checklist

1. **Start the dev server**
   ```bash
   npm run dev
   ```

2. **Open browser** at `http://localhost:5173`

3. **Verify terminal works**
   - Type `echo "Hello WebTerm"` and press Enter
   - Should see output in terminal

4. **Test pane splitting**
   - Press `Ctrl+B %` for vertical split
   - Press `Ctrl+B "` for horizontal split

5. **Test pane navigation**
   - Press `Ctrl+B ←/→/↑/↓` to move between panes

---

## 6. Key Keybindings

| Keybinding | Action |
|------------|--------|
| `Ctrl+B %` | Split vertical |
| `Ctrl+B "` | Split horizontal |
| `Ctrl+B ←→↑↓` | Navigate panes |
| `Ctrl+B x` | Close pane |
| `Ctrl+B z` | Toggle zoom |
| `Ctrl+B c` | New window |
| `Ctrl+B n/p` | Next/prev window |

---

## 7. Tech Stack Reference

| Component | Technology | Documentation |
|-----------|------------|---------------|
| Terminal Emulator | xterm.js | https://xtermjs.org/ |
| PTY Management | node-pty | https://github.com/microsoft/node-pty |
| WebSocket | ws | https://github.com/websockets/ws |
| Database | better-sqlite3 | https://github.com/WiseLibs/better-sqlite3 |
| Build Tool | Vite | https://vitejs.dev/ |
| UI Components | GlitchCN/UI | https://glitchcn-ui.vercel.app/ |
| Testing | Vitest + Playwright | https://vitest.dev/ |

---

## 8. Common Development Tasks

### Add a new GlitchCN component

```bash
cd frontend
npx shadcn@latest add @glitchcn/button
```

### Add a new backend service

1. Create file in `backend/src/services/my-service.ts`
2. Export from `backend/src/services/index.ts`
3. Add unit tests in `backend/tests/unit/my-service.test.ts`

### Modify WebSocket protocol

1. Update `shared/types/messages.ts`
2. Update handler in `backend/src/api/handlers/`
3. Update client in `frontend/src/services/websocket-client.ts`
4. Update contract in `specs/001-tmux-web-terminal/contracts/websocket-protocol.md`

### Run E2E tests

```bash
# Start the app in test mode
npm run dev

# In another terminal
npm run test:e2e
```

---

## 9. Troubleshooting

### Terminal doesn't appear

- Check browser console for WebSocket errors
- Verify backend is running: `curl http://localhost:3001/health`
- Check if port 3001 is in use: `netstat -an | grep 3001`

### Shell not spawning (Windows)

- Ensure PowerShell is in PATH
- Check `SystemRoot` environment variable is set
- Try running with `cmd` shell instead

### WebSocket connection fails

- Check firewall settings
- Verify CORS configuration
- Check browser network tab for WS handshake errors

### Tests failing

- Run `npm install` to ensure dependencies are up to date
- Check Node.js version: `node --version` (should be 20+)
- Clear test cache: `npm run test -- --clearCache`

---

## 10. Next Steps

- Review [spec.md](spec.md) for feature requirements
- Review [data-model.md](data-model.md) for entity relationships
- Review [contracts/](contracts/) for API specifications
- Run `/speckit.tasks` to generate implementation tasks
