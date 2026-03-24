# Testing Patterns

**Analysis Date:** 2026-03-23

## Test Framework

**Runner:**
- Vitest 2.1.0 (used by both backend and frontend)
- Config: Vitest configured via package.json test scripts (no separate vitest.config.ts files)

**Assertion Library:**
- Vitest uses Node.js built-in assert + expect API (no separate assertion library required)

**E2E Testing:**
- Playwright 1.49.0 for frontend E2E tests
- Not yet implemented (framework installed but no tests written)

**Run Commands:**
```bash
npm test                              # Run all tests in all workspaces
npm run test -w @webterm/backend      # Run backend tests only
npm run test -w @webterm/frontend     # Run frontend tests only
npm run test:watch -w @webterm/backend # Watch mode (backend)
npm run test:watch -w @webterm/frontend # Watch mode (frontend)
npm run test:e2e -w @webterm/frontend # E2E tests with Playwright (not yet implemented)
```

## Test File Organization

**Current State:**
- NO TEST FILES EXIST in the codebase yet
- Test infrastructure installed and ready but no test suite written
- Shared package has no tests (types-only package)

**Planned Location (when tests are added):**
- Backend: `backend/src/**/*.test.ts` (co-located with source)
- Frontend: `frontend/src/**/*.test.tsx` (co-located with source)
- Example: `backend/src/services/session-service.test.ts` for service tests

**Naming Convention:**
- Test files use `.test.ts` or `.test.tsx` suffix (not `.spec.ts`)
- One test file per implementation file is the convention

**Directory Structure for Tests (when added):**
```
backend/
├── src/
│   ├── services/
│   │   ├── session-service.ts
│   │   └── session-service.test.ts
│   └── utils/
│       ├── errors.ts
│       └── errors.test.ts
frontend/
├── src/
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   └── useWebSocket.test.tsx
│   └── stores/
│       ├── session-store.ts
│       └── session-store.test.ts
```

## Test Structure

**Recommended Pattern (not yet implemented, but setup for):**
Following Vitest conventions:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('SessionService', () => {
  describe('createSession', () => {
    it('should create a new session with unique name', () => {
      // Arrange
      const sessionService = new SessionService();

      // Act
      const session = sessionService.createSession({ name: 'Test' });

      // Expect
      expect(session).toBeDefined();
      expect(session.name).toBe('Test');
    });

    it('should append counter to duplicate names', () => {
      // Setup
      const service = new SessionService();
      service.createSession({ name: 'test' });

      // Act
      const second = service.createSession({ name: 'test' });

      // Assert
      expect(second.name).toMatch(/test \d+/);
    });
  });
});
```

**Patterns to Use:**
- Arrange-Act-Assert (AAA) pattern for test structure
- `describe()` for grouping related tests by feature/method
- Nested describes for hierarchical organization
- `beforeEach()` / `afterEach()` for setup/teardown
- Descriptive test names: `should create session with unique name` (not `test1`)

## Mocking

**Framework:** Vitest has built-in mocking via `vi` module (no separate mocking library needed)

**Expected Patterns (when tests are written):**

**Module Mocking:**
```typescript
import { vi } from 'vitest';
import { getDatabase } from '../db/database';

vi.mock('../db/database', () => ({
  getDatabase: vi.fn(() => ({
    prepare: vi.fn().mockReturnValue({
      get: vi.fn(),
      run: vi.fn(),
    }),
  })),
}));
```

**Function Mocking:**
```typescript
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
};

vi.mocked(logger).info.mockClear();
```

**What to Mock:**
- External dependencies: database calls, file system operations, HTTP clients
- Services: PTY manager, database layer, shell utilities
- Time-based operations: `Date.now()`, `setTimeout()` for deterministic testing

**What NOT to Mock:**
- Custom error classes (test error behavior with real instances)
- Type definitions and interfaces (these are just types)
- Pure utility functions (parse, format, validation helpers)
- Core business logic that's being tested (defeats the purpose)

## Fixtures and Factories

**Test Data Patterns (when tests are added):**

Factory functions for consistent test data:

```typescript
// backend/src/__tests__/fixtures.ts (or similar)

export function createMockSession(overrides?: Partial<Session>): Session {
  return {
    id: 'test-session-1',
    name: 'Test Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    activeWindowId: null,
    lastWindowId: null,
    ...overrides,
  };
}

export function createMockPane(overrides?: Partial<Pane>): Pane {
  return {
    id: 'test-pane-1',
    windowId: 'test-window-1',
    shell: 'bash',
    cwd: '/tmp',
    cols: 80,
    rows: 24,
    connectionState: 'connected',
    exitCode: null,
    createdAt: Date.now(),
    title: 'bash',
    marked: false,
    currentCommand: null,
    ...overrides,
  };
}
```

**Location:**
- `backend/src/__tests__/fixtures.ts` for backend fixtures
- `frontend/src/__tests__/fixtures.ts` for frontend fixtures
- Co-locate with test files or in shared fixtures directory

## Coverage

**Requirements:** Not enforced (no coverage thresholds configured)

**View Coverage:**
```bash
npm run test -- --coverage          # Show coverage report (command for when tests exist)
```

**Expected Coverage Targets (recommendations):**
- Aim for 70%+ overall
- 100% for critical paths (error handling, data validation, session lifecycle)
- 50%+ for utility/helper functions
- E2E tests for user workflows once test suite is established

## Test Types

**Unit Tests:**
- Scope: Individual functions/methods in isolation
- Approach: Test service methods with mocked dependencies
- Example targets:
  - `SessionService.createSession()` — Create and validate session
  - `parseLayout()` — Verify layout parsing and validation
  - `findAdjacentPaneId()` — Test directional pane navigation
  - Error class instantiation — Verify error codes and messages

**Integration Tests:**
- Scope: Multiple components working together
- Approach: Test database + service interactions, or REST route + handler
- Example targets (when written):
  - Session creation → database write → retrieval
  - Window split operation → layout update → pane resize
  - WebSocket message → handler → database write

**E2E Tests:**
- Framework: Playwright 1.49.0 (installed, not yet used)
- Scope: Full user workflows in browser
- Example targets (when written):
  - User creates session → sees pane → types command → output appears
  - Session restore on reconnect
  - Split panes, resize, navigate with keyboard

## Async Testing

**Pattern for async operations:**
```typescript
describe('WebSocket', () => {
  it('should handle async connection', async () => {
    const client = new WebSocketClient();

    // Await async operations
    const result = await client.connect();

    expect(result).toBe(true);
  });
});
```

**Handling Promises:**
- Always `await` async operations or return the promise
- Use `async` / `await` syntax over `.then()` for readability
- Vitest auto-detects unresolved promises in tests

## Error Testing

**Pattern for testing errors:**
```typescript
describe('Error Handling', () => {
  it('should throw NotFoundError when session not found', () => {
    const service = new SessionService();

    expect(() => {
      service.getSession('non-existent-id');
    }).toThrow(NotFoundError);
  });

  it('should set correct error code and status', () => {
    const error = new ValidationError('Invalid input', 'sessionName');

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.field).toBe('sessionName');
  });
});
```

**Testing custom errors:**
- Instantiate real error classes, don't mock them
- Verify error properties: `code`, `statusCode`, `message`
- Test `toJSON()` serialization for API responses
- Use `toThrow()` or `expect(() => fn()).toThrow(ErrorClass)`

## Database Testing

**Pattern for database operations (when tests are written):**

Mock the database module since it's a singleton:

```typescript
import { vi } from 'vitest';
import { getDatabase } from '../db/database';

vi.mock('../db/database', () => {
  const mockPrepare = vi.fn();
  return {
    getDatabase: vi.fn(() => ({
      prepare: mockPrepare,
    })),
    mockPrepare, // Export for assertions
  };
});

describe('SessionService', () => {
  it('should call database.prepare with correct query', () => {
    sessionService.createSession({ name: 'test' });

    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO sessions')
    );
  });
});
```

## Zustand Store Testing

**Pattern for store testing (frontend, when written):**

```typescript
import { renderHook, act } from '@testing-library/react';
import { useSessionStore } from '../stores/session-store';

describe('Session Store', () => {
  it('should set session', () => {
    const { result } = renderHook(() => useSessionStore());

    act(() => {
      result.current.setSession(mockSession);
    });

    expect(result.current.currentSession).toEqual(mockSession);
  });
});
```

**Notes:**
- Zustand stores are sync by default
- Test both getters and setters
- Use `act()` from React Testing Library for state updates
- Verify persistence behavior if using persist middleware

## React Component Testing

**Pattern for component testing (when written):**

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TerminalPane } from '../TerminalPane';

describe('TerminalPane', () => {
  it('should render terminal container', () => {
    render(<TerminalPane paneId="test-1" />);

    expect(screen.getByTestId('terminal-container')).toBeInTheDocument();
  });

  it('should handle resize events', async () => {
    const user = userEvent.setup();
    const onResize = vi.fn();

    render(<TerminalPane paneId="test-1" onResize={onResize} />);

    await user.keyboard('{Ctrl>}{c<}');
    expect(onResize).toHaveBeenCalled();
  });
});
```

**Notes:**
- Use `@testing-library/react` for component testing
- Prefer user-centric tests over implementation details
- Add `data-testid` attributes for component elements
- Test props and event handlers

---

*Testing analysis: 2026-03-23*

**Status Note:** The test framework and all necessary dependencies are installed and configured, but no actual test suite exists yet. This document describes the recommended patterns to follow when adding tests to the project, based on the installed framework versions and project structure.
