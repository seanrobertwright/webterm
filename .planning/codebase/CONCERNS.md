# Codebase Concerns

**Analysis Date:** 2026-03-23

## Tech Debt

**Incomplete Health Check Implementation:**
- Issue: Health endpoint returns hardcoded zeros for active sessions and panes counts
- Files: `backend/src/api/routes/health.ts:28-29`
- Impact: Health monitoring cannot track actual server load or resource utilization
- Fix approach: Integrate with session service and PTY manager to report actual counts

**Scrollback Buffer Hardcoded:**
- Issue: Terminal scrollback lines fixed at 10,000 with TODO comment to make configurable
- Files: `backend/src/api/routes/system.ts:192`
- Impact: No way to adjust for different use cases (memory-constrained vs. high-volume scenarios)
- Fix approach: Add scrollback configuration to config system, expose via API

**Help Overlay Unimplemented:**
- Issue: Keybinding action 'showHelp' has empty handler with TODO comment
- Files: `frontend/src/App.tsx:195`
- Impact: Users cannot access help system via keyboard shortcut
- Fix approach: Create KeybindingsHelp component overlay (partially designed but not wired)

## Fragile Areas

**WebSocket Buffering Logic - Potential Memory Leak:**
- Files: `backend/src/api/websocket-server.ts:1019-1040`
- Why fragile:
  - Output buffers accumulate indefinitely per session without size limits
  - Disconnected buffer cleanup only occurs after 5-second timeout (line 1036)
  - If many large panes buffer simultaneously, heap memory grows unchecked
  - No maximum buffer size enforcement or eviction policy
- Safe modification:
  - Add configurable maximum buffer size per pane
  - Implement LRU eviction or sampling strategy for old output
  - Add metrics/monitoring for buffer memory usage
- Test coverage: No tests exist for buffer lifecycle

**Command Service - Massive Single File (2,405 lines):**
- Files: `backend/src/services/command-service.ts`
- Why fragile:
  - Contains 100+ handler methods with shared state (windowLayoutIndex map)
  - No class-level organization or separation of concerns
  - Handler methods range from stub stubs (1 line) to complex logic (100+ lines)
  - Global windowLayoutIndex map can have stale entries if windows are deleted
  - Layout preset cycling (next-layout/previous-layout) maintains client-side state in server
- Safe modification:
  - Refactor into domain-specific handler classes (SessionHandler, WindowHandler, PaneHandler, LayoutHandler)
  - Move windowLayoutIndex to per-window state stored in database
  - Add integration tests for complex commands
  - Document stub commands and implementation status
- Test coverage: No tests exist

**Silent Timeout Handling:**
- Files: `backend/src/api/websocket-server.ts:1053-1070`
- Why fragile:
  - Heartbeat interval set globally (not per-client-set)
  - Clients marked dead after 30 seconds without pong, but cleanup happens in the heartbeat loop
  - If heartbeat interval is stopped or delayed, dead clients persist indefinitely
  - Multiple setTimeout calls (lines 175, 786, 1036, 1771, 2200) in different scopes could cause reference leaks
- Safe modification:
  - Use session-level cleanup tracker
  - Add explicit timeout handler disposal on server shutdown
  - Log when clients are reaped so connection management is visible
- Test coverage: No tests for heartbeat/timeout logic

**Shell Detection via execSync/exec:**
- Files: `backend/src/api/routes/system.ts:9-46`
- Why fragile:
  - Uses `execSync` and shell-dependent commands (Windows: `where`, Unix: `which`)
  - PowerShell script execution for folder picker (line 225) could fail on restricted execution policies
  - Git Bash path hardcoded (lines 79-82) — will fail if installed elsewhere
  - macOS `osascript` command timeout of 60 seconds (line 234) could deadlock frontend
  - No exception handling for shell errors in isShellAvailable (caught globally at line 43)
- Safe modification:
  - Check PATH programmatically instead of shell execution
  - Make Git Bash paths configurable via environment variable
  - Reduce folder picker timeouts, add progress indicator
  - Add logging for all shell detection failures
- Test coverage: No tests for shell detection on different platforms

**JSON Parsing Without Schema Validation:**
- Files:
  - `backend/src/api/websocket-server.ts:660` (message parsing)
  - `backend/src/api/rest-router.ts:144` (REST body parsing)
  - `frontend/src/hooks/useCommandPrompt.ts:46` (command parsing)
- Why fragile:
  - Try-catch is present but doesn't validate message structure
  - Could receive unexpected message types or missing required fields silently
  - Frontend command prompt parses user JSON without validation
- Safe modification:
  - Add runtime schema validation (zod, io-ts, or similar)
  - Narrow message type before processing
  - Add detailed error logging with message structure
- Test coverage: No tests for malformed input

**PTY Spawn Failure Handling:**
- Files: `backend/src/services/pty-service.ts:114-200`
- Why fragile:
  - If PTY spawn fails, error is not caught — would crash handler
  - cwd fallback only checks fs.existsSync but not actual accessibility (read + execute permissions)
  - No retry logic if spawn fails due to transient issues
  - Shell path resolution happens synchronously, could block event loop on slow filesystem
- Safe modification:
  - Wrap spawn in try-catch, return error result to handler
  - Test actual directory permissions with fs.accessSync
  - Add configurable spawn retry with exponential backoff
  - Consider async shell resolution
- Test coverage: No tests for PTY spawn scenarios

## Known Bugs

**Window Layout Index Stale State:**
- Symptoms: next-layout/previous-layout commands may cycle through wrong presets if windows are killed and recreated
- Files: `backend/src/services/command-service.ts:42`, `handleNextLayout`, `handlePreviousLayout`
- Trigger: Kill window with preset layout, create new window in same session, try next/previous layout
- Workaround: Close and reopen session to reset state

**Activity/Silence Monitoring Race Condition:**
- Symptoms: Activity/silence alerts may not fire or may fire multiple times for the same event
- Files: `backend/src/api/websocket-server.ts:331-346` (activity monitoring), line 177 (silence timer reset)
- Trigger: Pane generates output while multiple clients are connected, then close one client
- Root cause: windowFlags state (activity/bell/silence booleans) is not per-client, only per-window; cleared on window switch but not reset when alert fires
- Workaround: Switch away and back to window to reset flags

**Folder Picker Cancellation Not Consistent Across Platforms:**
- Symptoms: User cancels folder picker dialog but function returns error instead of { path: null, cancelled: true }
- Files: `backend/src/api/routes/system.ts:268-276`
- Trigger: User cancels osascript/zenity dialog on macOS/Linux
- Root cause: error message detection is fuzzy ("User canceled" vs "cancelled"), Linux zenity may have different error messages
- Workaround: Check error detail to distinguish cancel from actual error

## Security Considerations

**Command Injection via Shell Execution:**
- Risk: Shell detection and folder picker use platform-specific shell commands which could be injection vectors
- Files: `backend/src/api/routes/system.ts:37`, `225`, `241`
- Current mitigation:
  - `execSync` / `exec` called with literal command names, not user input
  - PowerShell script uses double-quoted string (safer than eval)
  - No shell metacharacters in paths
- Recommendations:
  - Validate shell paths against whitelist before execution
  - Use spawn instead of exec for folder picker (no shell parsing)
  - Add sandbox/capability restrictions if running in untrusted environment

**Directory Traversal in Static File Serving:**
- Risk: Production frontend serving uses path normalization but could be bypassed with symlinks
- Files: `backend/src/index.ts:76-77`
- Current mitigation:
  - Checks `normalizedPath.startsWith(frontendDistDir)` after path.resolve()
  - Only serves from built frontend directory
- Recommendations:
  - Add realpath resolution to eliminate symlink attacks
  - Test with symlinks in frontend dist directory
  - Consider serving with readonly filesystem flag in production

**Missing Rate Limiting on REST/WebSocket:**
- Risk: No rate limiting on API endpoints or WebSocket connections
- Files:
  - `backend/src/api/routes/system.ts` (no rate limit)
  - `backend/src/api/websocket-server.ts:273` (connection handler accepts all)
- Impact: Denial of service by creating many sessions/windows or flooding with messages
- Recommendations:
  - Add per-IP rate limiter for REST endpoints
  - Limit concurrent WebSocket connections per IP
  - Limit command execution rate per session
  - Consider CAPTCHA for session creation

**No Input Validation on Session/Window Names:**
- Risk: User-provided session/window names written directly to database and broadcast to UI
- Files: `backend/src/services/session-service.ts:82-88` (name collision check but no validation)
- Impact: XSS if frontend renders names unsanitized (low risk since React auto-escapes)
- Recommendations:
  - Validate names against whitelist or length/character restrictions
  - Sanitize before broadcasting to all clients
  - Document naming requirements

## Performance Bottlenecks

**Large File Reads in pty-service:**
- Problem: Shell resolution happens synchronously on every PTY spawn
- Files: `backend/src/services/pty-service.ts:132-139`
- Cause: Shell path resolution via execSync; cwd existence check via fs.existsSync
- Improvement path:
  - Cache shell paths after first lookup (config doesn't change during runtime)
  - Use fs.promises for async validation in non-critical spawn paths
  - Profile: measure time cost of shell resolution vs. overall spawn time

**Command Service Switch Statement (100+ cases):**
- Problem: Large switch statement with linear lookup, O(N) dispatch per command
- Files: `backend/src/services/command-service.ts:77-200+`
- Cause: No command registry or dispatch table
- Improvement path:
  - Create command handler registry as Map<string, CommandHandler>
  - Dynamically load handlers to reduce code size
  - Measure: impact is negligible for typical use (few commands per second) but adds cognitive load

**Database Write-Through Without Batching:**
- Problem: Each pane close, window create, etc. triggers individual database transactions
- Files: `backend/src/services/session-service.ts` (transaction per operation)
- Cause: ACID compliance but no bulk operation support
- Improvement path:
  - Batch related database operations (e.g., create window + create panes in one transaction)
  - Profile: measure transaction overhead vs. actual write latency
  - Consider write-ahead log for faster commits

**Layout Service Recursive Tree Operations:**
- Problem: Layout tree traversal is recursive, could stack overflow with deep nesting
- Files: `backend/src/services/layout-service.ts:40-88` (splitLayout recursion)
- Cause: Recursive approach is natural for tree structure but no depth limit
- Improvement path:
  - Add depth assertion to reject layouts deeper than 10 levels
  - Convert to iterative traversal if performance is critical
  - Measure: test with 100+ panes to see if recursion becomes limiting

## Test Coverage Gaps

**No Unit Tests for Core Services:**
- What's not tested:
  - Command service execution (all 100+ handlers)
  - Session service CRUD (create, delete, rename)
  - Layout service operations (split, remove, resize)
  - PTY service spawning and lifecycle
- Files: No test files exist in codebase (0 .test.ts or .spec.ts files)
- Risk: Regressions in core functionality go undetected; difficult to refactor services safely
- Priority: High — blocking safe refactoring of command-service

**No WebSocket Integration Tests:**
- What's not tested:
  - Multi-client connection lifecycle
  - Buffering and reconnection
  - Output broadcast to multiple clients
  - Heartbeat and timeout handling
- Files: `backend/src/api/websocket-server.ts` has no tests
- Risk: Connection loss and recovery logic is fragile (see Fragile Areas); bugs cause data loss
- Priority: High — directly impacts user experience

**No Frontend Component Tests:**
- What's not tested:
  - Terminal pane rendering and interaction
  - Keybinding dispatch
  - Clipboard copy/paste
  - Session switching
- Files: No .test.tsx files exist
- Risk: UI bugs (layout breaks, unresponsive controls) only found via manual testing
- Priority: Medium — E2E tests could provide some coverage

**No Cross-Browser Testing:**
- What's not tested:
  - xterm.js WebGL renderer on Firefox, Safari, Edge
  - WebSocket support across browsers
  - CSS grid layout edge cases
- Risk: Users on unsupported browsers get broken terminal
- Priority: Medium — can be mitigated with browser detection UI

**No Load/Stress Testing:**
- What's not tested:
  - Many concurrent sessions (100+)
  - Large output volume (100MB scrollback)
  - Rapid pane creation/destruction
  - Memory usage under load
- Risk: Application crashes or becomes unresponsive at scale
- Priority: Medium — depends on deployment scale

## Missing Critical Features

**Persistent Keybindings:**
- Problem: Keybindings stored in database but no UI to customize them; only defaults from shared registry
- Blocks: Users cannot rebind keys to their preferences
- Implementation: Add keybinding editor UI (mock exists in `frontend/src/components/layout/KeybindingsHelp.tsx`); wire to keybinding-service CRUD

**Session Auto-Save:**
- Problem: Sessions must be manually saved with "Save" button; no automatic checkpoint
- Blocks: Pane state lost if browser refreshes or crashes before manual save
- Implementation: Auto-save on significant layout changes (new/closed panes) or timer-based (every 5 minutes)

**Pane History Navigation:**
- Problem: No command to jump to previously focused pane or window (common in tmux)
- Blocks: Navigation is slow in large layouts
- Implementation: Maintain history stack in session state, add select-pane -l command

**Copy Mode Incomplete:**
- Problem: `useCopyMode.ts` (814 lines) implements selection but export/display logic is partial
- Blocks: Users cannot reliably copy terminal content
- Implementation: Complete export to clipboard (wrapped); handle large selections

## Dependencies at Risk

**node-pty (@lydell/node-pty):**
- Risk: Unmaintained fork (upstream node-pty has maintainer gaps); platform-specific binary compilation
- Impact: Node version upgrades may break PTY spawning; Windows/macOS PTY support may lag
- Migration plan: Monitor for alternatives (pty.js, xterm-addon-pty); plan migration if fork becomes unmaintained

**better-sqlite3:**
- Risk: Native module requiring compilation; not all build systems support it
- Impact: Docker builds could fail if SQLite3 dev headers missing; prebuild binaries may be stale
- Migration plan: Test on all target platforms; consider pure JS SQLite (sql.js) as fallback for constrained environments

**xterm.js (WebGL Renderer):**
- Risk: Complex WASM/canvas rendering; shader bugs could crash on certain GPUs
- Impact: Some users get black terminal screen
- Migration plan: Keep DOM renderer as fallback; add error boundary to detect WebGL failures

## Scaling Limits

**Session Persistence in SQLite:**
- Current capacity: SQLite performs well up to ~100 concurrent sessions in WAL mode
- Limit: Exceeds 1000 sessions, checkpoint operations block writes; hits 10GB database file size (practical limit on many filesystems)
- Scaling path:
  - For 1000+ sessions: migrate to PostgreSQL or MySQL
  - Implement session archival (move inactive sessions to cold storage)
  - Implement database sharding by session ID prefix

**In-Memory Buffering for Reconnection:**
- Current capacity: ~100MB total across all disconnected sessions (rough estimate, no metrics)
- Limit: 1GB+ heap usage with many disconnected sessions; garbage collection pauses
- Scaling path:
  - Implement configurable buffer size limits (per-pane or per-session)
  - Implement Redis backend for distributed buffering
  - Add LRU eviction or sampling strategy (keep recent 1000 lines per pane)

**WebSocket Connection Limits:**
- Current capacity: Node.js default ~1000 FDs per process; typical system ~65k FDs
- Limit: Exceeds 10,000 concurrent connections, system FD limits hit
- Scaling path:
  - Increase system FD limits (ulimit -n)
  - Implement load balancer with sticky sessions
  - Consider multiple Node.js processes with shared session store

**Pane Count Per Window:**
- Current capacity: 16 panes per window (hardcoded MAX_PANES_PER_WINDOW)
- Limit: Layout algorithms become quadratic at 30+ panes; UI becomes unusable
- Scaling path: Increase limit carefully with performance testing; consider tabbed pane groups for organizing many panes

---

*Concerns audit: 2026-03-23*
