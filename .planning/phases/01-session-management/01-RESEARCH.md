# Phase 1: Session Management — Clear All & Export/Import — Research

**Researched:** 2026-03-13
**Domain:** Session CRUD, xterm.js serialization, JSON file download/upload, React confirmation dialogs
**Confidence:** HIGH

---

## Summary

This phase adds three features to the sessions panel: a "Clear All Sessions" button (bulk delete with confirmation, preserving the active session), per-session JSON export (structure + xterm scrollback), and session import (JSON file upload restoring structure and spawning fresh PTYs). The codebase is already well-structured for all three: the backend's `sessionService.deleteSession` works pane-by-pane today and needs a simple `deleteAllSessions(excludeId)` wrapper; the frontend's `TerminalHandle` needs a `serialize()` method added (the `SerializeAddon` from `@xterm/addon-serialize` is already loaded in `useTerminal` but not yet exposed); and file download/upload in a browser is pure DOM with no extra libraries.

All three features are fully self-contained within the existing stack. No new npm packages are required. The most nuanced problem is scrollback serialization: `SerializeAddon.serialize()` must be called on the live xterm.js instance in the frontend — the backend has no scrollback. Scrollback is therefore collected in the browser and submitted as part of the export, which means the frontend drives the export endpoint or does the export client-side. Both approaches are viable; client-side export (no round-trip) is simpler and preferable.

The import flow creates a fresh session via existing `POST /api/v1/sessions`, then recreates windows/panes from the JSON structure — scrollback is written back into xterm after reconnection. The layout JSON format already exists in the database (`Layout` type, serialized as JSON in `windows.layout`), so the export/import schema maps 1:1 to existing models.

**Primary recommendation:** Export is done entirely client-side (serialize xterm state + session data already in frontend store → download JSON). Import calls existing session/window/pane create APIs then replays scrollback strings into xterm instances after connection. No new backend endpoints are needed for export; import needs only standard session-creation REST calls.

---

## Standard Stack

### Core (already in project — no new installs required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@xterm/addon-serialize` | `^0.13.0` | Serialize xterm scrollback to a string | Already loaded in `useTerminal`; official xterm.js addon |
| `better-sqlite3` | `^12.6.2` | SQLite transactions for bulk delete | Already used; synchronous API fits the existing service pattern |
| `uuid` | `^11.0.0` | Generate IDs for imported sessions/windows/panes | Already used in `session-service.ts` |
| `zustand` | `^5.0.0` | Frontend state for confirmation dialog visibility | Already used |
| React 19 | `^19.0.0` | Confirmation dialog component | Already used |

### Supporting (browser built-ins, no install)

| API | Purpose | When to Use |
|-----|---------|-------------|
| `URL.createObjectURL` + `<a download>` | Trigger file download | Export JSON to disk |
| `<input type="file" accept=".json">` | File picker for import | Import JSON from disk |
| `FileReader.readAsText` | Parse uploaded file | Import JSON parsing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side export | New `GET /api/v1/sessions/:id/export` backend endpoint | Backend endpoint can't capture live xterm scrollback (it's only in-browser memory) — client-side is correct |
| `<input type="file">` | File System Access API (`showOpenFilePicker`) | FSAPI is not universally supported and adds complexity; `<input>` works everywhere |
| Custom confirmation dialog | `window.confirm()` | `window.confirm()` is synchronous/blocking and can't be styled; custom React component is correct for this UI |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended File Structure for New Code

```
backend/src/
├── api/routes/sessions.ts        # Add handleClearAllSessions handler
├── services/session-service.ts   # Add deleteAllSessions(excludeId) method

frontend/src/
├── components/session/
│   ├── SessionPanel.tsx           # Add "Clear All" button + wire ClearAllDialog
│   ├── SessionList.tsx            # Add Export/Import buttons per row
│   ├── ClearAllDialog.tsx         # New: confirmation modal
│   └── ImportSessionDialog.tsx    # New: file picker + progress feedback
├── services/session-api.ts        # Add clearAllSessions(), importSession() API calls
├── components/terminal/Terminal.tsx  # Expose serialize() in TerminalHandle
```

### Pattern 1: Bulk Delete with Active Session Guard (Backend)

**What:** Single SQL `DELETE FROM sessions WHERE id != ?` wrapped in a transaction; kills PTYs first.
**When to use:** The "Clear All" action.

```typescript
// Source: existing session-service.ts deleteSession pattern
deleteAllSessions(excludeId: string): number {
  const db = getDatabase();

  // Get all sessions except the excluded one
  const toDelete = db.prepare(
    'SELECT id FROM sessions WHERE id != ?'
  ).all(excludeId) as Array<{ id: string }>;

  // Kill PTYs for all sessions being deleted
  for (const row of toDelete) {
    const session = this.getSession(row.id);
    if (session) {
      for (const window of session.windows) {
        for (const pane of window.panes) {
          if (ptyManager.hasPty(pane.id)) {
            ptyManager.kill(pane.id);
          }
        }
      }
    }
  }

  // Bulk delete — CASCADE handles windows/panes
  const result = db.prepare(
    'DELETE FROM sessions WHERE id != ?'
  ).run(excludeId);

  return result.changes;
}
```

**Backend route:** `DELETE /api/v1/sessions` with body `{ keepSessionId: string }` (or `?keep=<id>` query param). Register in `rest-router.ts` before the `:id` route to avoid pattern collision. Return `{ deleted: number }`.

### Pattern 2: Client-Side Export

**What:** Collect session structure from frontend store + serialize each pane's xterm scrollback → JSON blob → download.
**When to use:** The "Export" action on a session row.

```typescript
// Source: browser File/Blob APIs (no library needed)
// The TerminalHandle.serialize() must first be added to Terminal.tsx

interface SessionExport {
  version: 1;
  exportedAt: number;
  session: SessionWithWindows;          // full structure from API
  scrollback: Record<string, string>;   // paneId -> serialized xterm string
}

async function exportSession(
  sessionId: string,
  getSerializedPane: (paneId: string) => string | null
): Promise<void> {
  const session = await fetchSession(sessionId);

  const scrollback: Record<string, string> = {};
  for (const window of session.windows) {
    for (const pane of window.panes) {
      const text = getSerializedPane(pane.id);
      if (text) scrollback[pane.id] = text;
    }
  }

  const data: SessionExport = {
    version: 1,
    exportedAt: Date.now(),
    session,
    scrollback,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${session.name}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Key constraint:** Export of a *non-active* session (one not currently open in the terminal) will have empty scrollback — PTY output only lives in the xterm.js instance for the currently connected session. The export JSON should still be valid (scrollback simply omitted for inactive panes). This is acceptable behavior and should be documented in UI.

### Pattern 3: Import Session

**What:** Parse uploaded JSON → create session/windows/panes via existing REST APIs → replay scrollback after WebSocket connection.
**When to use:** The "Import" action.

```typescript
// Source: session-api.ts createSession pattern

async function importSession(file: File): Promise<SessionWithWindows> {
  const text = await file.text();
  const data: SessionExport = JSON.parse(text);

  // Validate version
  if (data.version !== 1) throw new Error('Unsupported export format version');

  // Create the session (backend assigns new IDs)
  const created = await createSession(data.session.name);
  // Store old->new pane ID mapping for scrollback replay
  const paneIdMap: Record<string, string> = {};

  // Recreate windows/panes structure via WebSocket messages or REST
  // (existing WebSocket 'create'/'split' messages handle pane creation)
  // Simplest approach: use existing REST session creation + WebSocket split commands

  return created;
}
```

**Note on ID remapping:** Import must generate fresh IDs for all sessions/windows/panes (the old IDs in the JSON are stale). Map old pane IDs to new ones during creation to replay scrollback correctly.

**Scrollback replay:** After the WebSocket `connected` message is received for the new session, write the serialized scrollback strings back to each xterm instance using `terminal.write(scrollbackString)` before the PTY starts sending output. The `SerializeAddon.serialize()` output is a sequence of ANSI escape sequences that xterm can re-consume directly.

### Pattern 4: Confirmation Dialog

**What:** React modal with message, Cancel, and Confirm buttons. Follows existing `SessionPanel` inline modal style (no external dialog library).
**When to use:** Before "Clear All" action executes.

```tsx
// Source: matches existing SessionPanel backdrop pattern
function ClearAllDialog({ onConfirm, onCancel, sessionCount }: {
  onConfirm: () => void;
  onCancel: () => void;
  sessionCount: number;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 z-60 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">Clear All Sessions?</h3>
        <p className="text-gray-400 text-sm mb-6">
          This will permanently delete {sessionCount} session{sessionCount !== 1 ? 's' : ''}.
          Your active session will be kept.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} type="button"
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} type="button"
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md font-medium transition-colors">
            Delete All
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Doing export as a backend endpoint:** The backend does not have live xterm scrollback — it only has PTY bytes that have been sent out. Use client-side export.
- **Reusing old pane IDs during import:** Old IDs reference stale PTY processes that no longer exist. Always generate fresh UUIDs on import.
- **Calling `URL.createObjectURL` without `revokeObjectURL`:** Memory leak. Always revoke after the download is triggered.
- **Blocking the UI during multi-session delete:** Use async/await; show a loading state on the button.
- **Writing scrollback before xterm.js terminal is mounted:** Wait for the `onReady` callback before replaying scrollback.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Scrollback serialization | Manual xterm buffer walking | `@xterm/addon-serialize` (already installed) | The addon handles ANSI escape sequences, color attributes, cursor position — non-trivial to replicate |
| File download | Server-side streaming endpoint | `Blob` + `URL.createObjectURL` | Browser-native, no server involvement, works for any size up to memory limit |
| File parsing | Custom JSON stream parser | `JSON.parse(await file.text())` | Export files are bounded in size by the scrollback limit (10k lines); simple parse is fine |
| Modal/dialog | Third-party modal library (Radix, Headless UI) | Inline React component matching existing SessionPanel style | Codebase has no component library; existing pattern is inline modals with Tailwind |

**Key insight:** The xterm.js `SerializeAddon` handles all the complexity of turning a live terminal buffer into a replayable string. Without it you would need to understand VT100/ANSI state machines.

---

## Common Pitfalls

### Pitfall 1: Exporting Inactive Sessions Has No Scrollback

**What goes wrong:** User exports a session that is not currently active in the browser. The `globalThis.terminalHandles` map only contains handles for panes that are currently rendered. Inactive sessions have no live xterm instances.

**Why it happens:** xterm.js scrollback lives entirely in JavaScript memory inside `Terminal` instances. Inactive sessions are not mounted, so there are no `Terminal` instances to serialize.

**How to avoid:** In the export UI, show a notice: "Scrollback is only available for the currently active session." For non-active sessions, export the structure but with empty scrollback. The exported JSON is still valid for import — terminals just start fresh.

**Warning signs:** `globalThis.terminalHandles.get(paneId)` returns `undefined` for panes not currently mounted.

### Pitfall 2: `SerializeAddon` Not Exposed via `TerminalHandle`

**What goes wrong:** `useTerminal` loads `SerializeAddon` and has a `serialize()` method, but `Terminal.tsx` (which uses `useTerminal` internally) exposes `TerminalHandle` to parent components — and `TerminalHandle` does not currently include `serialize()`. Callers using `terminalRef.current?.serialize()` will get a TypeScript error.

**Why it happens:** `TerminalHandle` was defined before the serialize requirement existed.

**How to avoid:** Add `serialize: () => string | null` to `TerminalHandle` in `Terminal.tsx` and forward it from the `forwardRef` implementation via `useTerminal`'s `serialize` return value.

**Warning signs:** TypeScript compile error on `terminalRef.current.serialize`.

### Pitfall 3: Import Creates Windows on Top of the Auto-Created First Window

**What goes wrong:** `createSession` automatically creates one window + one pane. If import then creates the session's windows from the JSON, the session ends up with an extra unwanted window.

**Why it happens:** `SessionService.createSession` always creates an initial window as part of session setup (lines 96-165 of `session-service.ts`).

**How to avoid:** After creating the import session, delete the auto-created window before creating the windows from the JSON. OR: reuse the auto-created window for the first window in the import (rename it and update its layout/panes).

**Warning signs:** Imported sessions show one extra empty window.

### Pitfall 4: SQLite Unique Constraint on Session Name

**What goes wrong:** Importing a session with the same name as an existing session fails with a `DuplicateError`.

**Why it happens:** The `sessions` table has `name TEXT NOT NULL UNIQUE`. `handleCreateSession` throws `DuplicateError` if name exists.

**How to avoid:** `SessionService.createSession` already handles this: it appends a numeric suffix (`name 2`, `name 3`, etc.) when a name collision is detected (lines 82-88). The REST route also throws `DuplicateError` before calling the service — the import path should call `sessionService.createSession` directly (or strip the duplicate check from the import route). Best approach: have the import endpoint call `sessionService.createSession` which already handles renaming.

**Warning signs:** 409 Conflict response from `POST /api/v1/sessions` on import.

### Pitfall 5: z-index Stacking for Nested Modals

**What goes wrong:** The `ClearAllDialog` and `ImportSessionDialog` open on top of `SessionPanel` (z-50). If the dialog z-index is not higher, it appears behind the panel.

**Why it happens:** `SessionPanel` uses `z-50`. A child dialog that is also `z-50` has undefined stacking.

**How to avoid:** Use `z-60` or higher for confirmation dialogs and import dialogs that open over the session panel.

**Warning signs:** Dialog backdrop is visible but dialog content appears behind the session panel.

### Pitfall 6: REST Body Parsing Limit for Large Import Files

**What goes wrong:** The REST router has a 1MB body limit (`maxSize = 1024 * 1024` in `rest-router.ts` line 117). A session with 10,000-line scrollback across many panes can exceed this.

**Why it happens:** The `parseJsonBody` function enforces a 1MB hard limit.

**How to avoid:** Either increase the body limit for the import endpoint, or implement import as a file upload using `multipart/form-data` with a higher limit. The simplest path: increase the limit to 10MB for the `/import` route specifically, or parse the body with a custom size limit in the import handler.

**Warning signs:** 400 VALIDATION_ERROR with `constraint: 'maxSize'` on large imports.

---

## Code Examples

### Adding `serialize()` to `TerminalHandle`

```typescript
// Source: frontend/src/components/terminal/Terminal.tsx
// Add to TerminalHandle interface:
export interface TerminalHandle {
  write: (data: string | Uint8Array) => void;
  focus: () => void;
  clear: () => void;
  getDimensions: () => { cols: number; rows: number };
  getSelection: () => string;
  hasSelection: () => boolean;
  serialize: () => string | null;  // ADD THIS
}

// Add to the useImperativeHandle implementation:
useImperativeHandle(ref, () => ({
  // ... existing methods ...
  serialize: () => serializeAddon?.serialize() ?? null,
}));
```

### Backend: Register Bulk Delete Route

```typescript
// Source: backend/src/api/rest-router.ts pattern
// Add BEFORE the /:id routes to avoid matching "sessions" as an ID:
registerRoute('DELETE', '/api/v1/sessions', handleClearAllSessions);
```

### Backend: Bulk Delete Handler

```typescript
// Source: matches handleDeleteSession pattern in sessions.ts
export async function handleClearAllSessions(
  _req: IncomingMessage,
  res: ServerResponse,
  _params: Record<string, string>,
  body: unknown
): Promise<void> {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('Request body required', 'body', 'required');
  }
  const { keepSessionId } = body as { keepSessionId?: string };
  if (!keepSessionId) {
    throw new ValidationError('keepSessionId is required', 'keepSessionId', 'required');
  }

  const deleted = sessionService.deleteAllSessions(keepSessionId);
  logger.info('Cleared all sessions', { keepSessionId, deleted });
  sendJson(res, 200, { deleted });
}
```

### Frontend: Collect Scrollback Across All Panes

```typescript
// Source: frontend global TerminalHandle map pattern (TerminalPane.tsx)
function collectScrollback(paneIds: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const paneId of paneIds) {
    const handle = globalThis.terminalHandles.get(paneId);
    if (handle) {
      const text = handle.serialize();
      if (text) result[paneId] = text;
    }
  }
  return result;
}
```

### Frontend: File Download

```typescript
// Source: browser Blob/URL APIs
function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### Frontend: File Upload Parsing

```typescript
// Source: browser File API
async function parseImportFile(file: File): Promise<SessionExport> {
  const text = await file.text();
  const data = JSON.parse(text) as unknown;
  // Validate top-level shape
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as Record<string, unknown>)['version'] !== 1
  ) {
    throw new Error('Invalid export file format');
  }
  return data as SessionExport;
}
```

---

## Export JSON Schema (Design)

```typescript
// Proposed type — to be placed in shared/types/ or local to frontend
interface SessionExport {
  version: 1;
  exportedAt: number;          // Unix ms timestamp
  session: {
    name: string;
    windows: Array<{
      name: string;
      index: number;
      layout: Layout;          // existing Layout type from shared/types/models.ts
      panes: Array<{
        id: string;            // OLD pane ID (used to look up scrollback)
        shell: ShellType;
        cwd: string | null;
        cols: number;
        rows: number;
        title: string;
      }>;
    }>;
  };
  scrollback: Record<string, string>;  // oldPaneId -> serialized xterm string
}
```

**Import ID remapping:** During import, create all new entities with fresh UUIDs. Maintain a `Map<oldPaneId, newPaneId>` to apply scrollback to the correct new pane after creation.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Server-side session file export (raw logs) | Client-side xterm SerializeAddon | Captures rendered terminal state (colors, cursor) not just raw bytes |
| `@xterm/xterm` Canvas renderer | WebGL renderer with canvas fallback | SerializeAddon works with both; no behavioral difference for export |

---

## Open Questions

1. **Should "Clear All" also close the session panel and switch to the active session?**
   - What we know: The button lives in SessionPanel. After delete, the list refreshes.
   - What's unclear: Whether the panel should auto-close.
   - Recommendation: Keep panel open and refresh the list; user decides when to close.

2. **What happens when importing a session and the current active session has the same structure?**
   - What we know: Import creates a new session with a unique name (suffix appended by `createSession`).
   - What's unclear: Whether the user should be warned that a same-named session exists.
   - Recommendation: No special warning; the auto-rename behavior is sufficient.

3. **How to handle the auto-created initial window when importing?**
   - What we know: `createSession` always creates one window+pane (described in Pitfall 3 above).
   - What's unclear: Best UI approach — delete and recreate vs. reuse.
   - Recommendation: Reuse the first auto-created window for the first imported window (rename + update layout), then create any additional windows. This avoids a delete-then-create round trip.

4. **Body size limit for import endpoint**
   - What we know: Current limit is 1MB (rest-router.ts line 117).
   - What's unclear: Typical export size for a heavily-used session.
   - Recommendation: Increase limit to 10MB for the import route specifically.

---

## Sources

### Primary (HIGH confidence)

- Codebase direct read: `backend/src/services/session-service.ts` — full session CRUD, `deleteSession` pattern, SQLite transaction usage
- Codebase direct read: `backend/src/api/routes/sessions.ts` — route handler patterns, error handling conventions
- Codebase direct read: `backend/src/api/rest-router.ts` — route registration, 1MB body limit
- Codebase direct read: `frontend/src/hooks/useTerminal.ts` — `SerializeAddon` already loaded, `serialize()` method available
- Codebase direct read: `frontend/src/components/terminal/Terminal.tsx` — `TerminalHandle` interface (serialize not yet exposed)
- Codebase direct read: `frontend/src/components/terminal/TerminalPane.tsx` — `globalThis.terminalHandles` map pattern
- Codebase direct read: `frontend/src/components/session/SessionPanel.tsx` — existing panel structure, styling conventions
- Codebase direct read: `frontend/src/components/session/SessionList.tsx` — session row action button patterns
- Codebase direct read: `shared/types/models.ts` — `Layout`, `SessionWithWindows`, `WindowWithPanes`, `Pane` types
- Codebase direct read: `backend/src/db/schema.sql` + `migrate.ts` — database schema, CASCADE delete behavior

### Secondary (MEDIUM confidence)

- `@xterm/addon-serialize` package present in `frontend/package.json` at `^0.13.0` — confirmed installed and in use
- Browser `Blob` + `URL.createObjectURL` + `<a download>` pattern: standard, widely documented, no library needed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are already in the project; no new dependencies
- Architecture: HIGH — patterns derived directly from reading the existing codebase
- Pitfalls: HIGH — most derive from specific code observations (body limit line 117, auto-window in createSession lines 82-165, TerminalHandle gaps)
- Export schema: MEDIUM — design proposal, needs planner to finalize and possibly add to shared types

**Research date:** 2026-03-13
**Valid until:** 2026-04-12 (stable codebase; 30-day window)
