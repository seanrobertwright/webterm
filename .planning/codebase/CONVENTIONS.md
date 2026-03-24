# Coding Conventions

**Analysis Date:** 2026-03-23

## Naming Patterns

**Files:**
- Kebab-case for all filenames: `session-service.ts`, `rest-router.ts`, `layout-navigation.ts`
- Service files: `*-service.ts` (e.g., `session-service.ts`, `pty-service.ts`, `layout-service.ts`)
- Handler files: `*-handler.ts` (e.g., `session-handler.ts`, `terminal-handler.ts`)
- Utility files: `*.ts` with descriptive name (e.g., `logger.ts`, `errors.ts`, `protocol.ts`)
- Component files: `*.tsx` with PascalCase component name (e.g., `TerminalPane.tsx`, `PaneContainer.tsx`, `ContextMenu.tsx`)

**Functions:**
- camelCase for all functions and methods
- Verb-prefixed for functions that perform actions: `createSession()`, `handleListSessions()`, `registerRoute()`, `findAdjacentPaneId()`
- Getter/checker prefixed functions: `getDatabase()`, `isValidLayout()`, `isSplitLayout()`, `isLeafLayout()`
- Export named functions or class methods: `export async function handleListSessions(...)`

**Variables:**
- camelCase for all variables and constants
- SCREAMING_SNAKE_CASE for module-level constants: `DEFAULT_COLS`, `DEFAULT_ROWS`, `TMUX_SHIM_DIR`, `TMUX_COLOR_MAP`
- Descriptive names for state variables in React: `connectionState`, `activeWindowId`, `showSaveDialog`, `isLoading`
- Boolean variables prefixed with `is` or `has`: `isProduction`, `isLeafLayout()`, `hasChildren`, `isLoading`

**Types:**
- PascalCase for all type names, interfaces, and classes: `Session`, `SessionWithWindows`, `PtyInstance`, `RouteHandler`, `WebTermError`
- Export types with `export interface` or `export type`: `export interface CreateSessionOptions`
- Union types and type aliases descriptive: `type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'exited'`
- Type imports always use `import type`: `import type { Session, Window, Pane } from '@webterm/shared/models'`

## Code Style

**Formatting:**
- Tool: Prettier 3.4.0
- Single quotes: `'hello'` not `"hello"`
- Semicolons: Required at statement ends
- 2-space indentation
- Line length: 100 characters max (printWidth: 100)
- Trailing commas: ES5 (objects/arrays get trailing commas, function params don't)
- Arrow function parens: Always included: `(x) => x * 2` not `x => x * 2`
- Line endings: LF only (no CRLF)
- Bracket spacing: `{ foo: 'bar' }` not `{foo: 'bar'}`

**Linting:**
- Tool: ESLint with flat config (`eslint.config.js`)
- Rules enforced:
  - `@typescript-eslint/no-explicit-any`: ERROR — Never use `any` type
  - `@typescript-eslint/explicit-function-return-type`: WARN — Prefer explicit return types
  - `@typescript-eslint/no-unused-vars`: ERROR — Ignore params starting with `_`
  - `@typescript-eslint/consistent-type-imports`: ERROR — All type imports use `import type { ... }`
  - `no-console`: WARN — Allow `console.warn()` and `console.error()` only
  - `prefer-const`: ERROR — Use `const` by default
  - `no-var`: ERROR — Never use `var`

## Import Organization

**Order:**
1. Node.js built-in modules: `import fs from 'node:fs'`
2. External dependencies: `import React from 'react'`, `import { create } from 'zustand'`
3. Type imports (grouped): `import type { Session } from '@webterm/shared/models'`
4. Relative imports: `import { logger } from '../utils/logger.js'`
5. Blank line between groups

**Path Aliases:**
- Backend: `@webterm/shared/*` maps to `shared/types/*` (via tsconfig `"@webterm/shared/*": ["shared/types/*"]`)
- Frontend: `@/*` maps to `frontend/src/*` and `@webterm/shared/*` maps to `../shared/types/*`
- All relative imports in backend use `.js` extensions for Node.js ESM compatibility: `import { logger } from '../utils/logger.js'`

**Example (backend):**
```typescript
import { randomUUID } from 'node:crypto';
import * as pty from '@lydell/node-pty';
import type { Layout, Pane, ShellType } from '@webterm/shared/models';
import { logger } from '../../utils/logger.js';
import { NotFoundError } from '../../utils/errors.js';
```

**Example (frontend):**
```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session, SessionWithWindows } from '@webterm/shared/index';
import { useSessionStore } from './stores/session-store';
import { Header } from './components/layout/Header';
```

## Error Handling

**Strategy:** Custom error class hierarchy with typed error codes

**Error Classes (in `backend/src/utils/errors.ts`):**
- Base: `WebTermError` — extends Error, includes `code` and `statusCode` properties
  - `NotFoundError(resource, id)` — 404, format: `"${resource} with id '${id}' not found"`
  - `ValidationError(message, field?, constraint?)` — 400, includes optional field/constraint details
  - `DuplicateError(resource, field, value)` — 409, for duplicate key violations
  - `PaneLimitError(limit)` — 400, when pane count exceeds max
  - `PtyError(message)` — 500, PTY spawn failures
  - `WebSocketError(message)` — 500, WebSocket protocol errors

**Error Handling Patterns:**
- Throw errors early: `if (!session) throw new NotFoundError('Session', id)`
- Type guard helper: `isWebTermError(error): error is WebTermError` for runtime checks
- Conversion helper: `toErrorResponse(error)` converts any error to JSON response format
- Route handlers wrap in try-catch and use `sendError(res, error)` for HTTP responses
- All WebTermError instances have `toJSON()` for serialization

**REST Error Response Format:**
```typescript
{
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid input',
    details?: { field?: string, constraint?: string }  // Optional, for ValidationError
  }
}
```

## Logging

**Framework:** Custom logger utility in `backend/src/utils/logger.ts`

**API:**
- `logger.debug(message, data?)` — Debug level
- `logger.info(message, data?)` — Info level
- `logger.warn(message, data?)` — Warning level
- `logger.error(message, data?)` — Error level

**Patterns:**
- Log level controlled via `LOG_LEVEL` env var (default: 'info')
- Format: `[ISO_TIMESTAMP] [LEVEL] message [JSON_data]`
- Always pass context as second param: `logger.info('Creating session', { sessionId, name })`
- No bare `console.log()` — Use `logger` or `console.warn()`/`console.error()`
- ESLint rule enforces: `no-console: ['warn', { allow: ['warn', 'error'] }]`

**Frontend Logging:**
- Same logger utility exported from `frontend/src/` (not used in browser, warnings only)
- Browser console only for development; no custom logger implementation for frontend yet

## Comments

**When to Comment:**
- JSDoc blocks for public functions/classes: `/** Comment describing purpose */`
- Inline comments for non-obvious logic: `// Ensure unique name — append counter if exists`
- Section dividers in files: `// ============================================================================`
- Type guard explanations: Comments on complex type predicates like `isValidLayout()`

**JSDoc/TSDoc Usage:**
- Used extensively in service files and type definitions
- Format: `/** Doc comment */` above function/class
- Include `@param` and `@returns` for complex functions
- Example from `session-service.ts`:
  ```typescript
  /**
   * Create a new session with an initial window and pane
   */
  createSession(options: CreateSessionOptions): SessionWithWindows { ... }
  ```

## Function Design

**Size:** Prefer small, single-purpose functions (most < 50 lines)

**Parameters:**
- Typed parameters always (no `any`)
- Use interfaces for multiple related params: `interface CreateSessionOptions { name: string; shell?: ShellType; cwd?: string; }`
- Callback params typed: `onData?: (paneId: string, data: string) => void`
- Options objects over positional params: `function spawn(shell, cwd, cols, rows)` → `function spawn(opts: PtySpawnOptions)`

**Return Values:**
- Explicit return types on all functions (ESLint warn)
- `void` for functions with side effects only
- Errors throw, don't return null/undefined (except parsing functions)
- Nullable returns documented: `parseLayout(json: string): Layout | null`
- Type unions for discriminated returns rare; use Result pattern instead if needed

**Async Functions:**
- Always return `Promise<T>` explicitly: `async function start(): Promise<void> { ... }`
- Handlers use async: `async function handleListSessions(...): Promise<void> { ... }`

## Module Design

**Exports:**
- Default exports rare; prefer named exports
- Single class per file: `export class SessionService { ... }`
- Singleton instances exported: `export const sessionService = new SessionService()`
- Types exported separately: `export interface CreateSessionOptions { ... }`

**Barrel Files:**
- Used in `frontend/src/components/layout/index.ts` to re-export components
- Example: `export { Header } from './Header'; export { WindowTabs } from './WindowTabs';`
- Not used in backend (prefer direct imports for clarity)

**Service Architecture:**
- Service classes manage business logic (session, pty, layout management)
- Instance exported at module level (e.g., `export const sessionService = new SessionService()`)
- Dependency injection via constructor or module-level imports
- Example from `session-service.ts`:
  ```typescript
  export class SessionService {
    createSession(options: CreateSessionOptions): SessionWithWindows { ... }
    getSession(id: string): SessionWithWindows | null { ... }
    deleteSession(id: string): void { ... }
  }
  export const sessionService = new SessionService();
  ```

## React Component Patterns

**Hooks:**
- Use React 19 hooks: `useState`, `useCallback`, `useEffect`, `useMemo`
- Custom hooks for reusable logic: `useWebSocket()`, `useMessageHandlers()`, `useClipboard()`
- Zustand for global state: `useSessionStore()`, `usePaneStore()`, `useSettingsStore()`
- Shallow selector for object comparisons: `useShallow((state) => [...state.windows])`

**Component Structure:**
```typescript
import type { Layout, Pane } from '@webterm/shared/models';

// Type definitions
interface Props { ... }

// Component
export function MyComponent(props: Props): JSX.Element {
  // Hooks first
  const [state, setState] = useState(...);
  const handleClick = useCallback(...);

  // Render
  return <div>...</div>;
}
```

---

*Convention analysis: 2026-03-23*
