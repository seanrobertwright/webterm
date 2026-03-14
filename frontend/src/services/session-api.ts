/**
 * REST API client for session management
 * Handles all session-related HTTP requests
 */

import type {
  Session,
  SessionWithWindows,
  SessionListItem,
} from '@webterm/shared/index';
import type { ApiResponse, UpdateSessionPayload } from '../types';

/** API base URL */
const API_BASE = '/api/v1';

/** API Error class with structured error info */
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ============================================================================
// Session API Functions
// ============================================================================

/**
 * Fetch all sessions
 * GET /api/v1/sessions
 */
export async function fetchSessions(): Promise<SessionListItem[]> {
  const response = await fetch(`${API_BASE}/sessions`);
  return handleResponse<SessionListItem[]>(response);
}

/**
 * Fetch a single session by ID
 * GET /api/v1/sessions/:id
 */
export async function fetchSession(id: string): Promise<SessionWithWindows> {
  const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}`);
  return handleResponse<SessionWithWindows>(response);
}

/**
 * Create a new session
 * POST /api/v1/sessions
 */
export async function createSession(name?: string): Promise<SessionWithWindows> {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  });
  return handleResponse<SessionWithWindows>(response);
}

/**
 * Update an existing session
 * PATCH /api/v1/sessions/:id
 */
export async function updateSession(
  id: string,
  data: UpdateSessionPayload
): Promise<Session> {
  const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<Session>(response);
}

/**
 * Delete a session
 * DELETE /api/v1/sessions/:id
 */
export async function deleteSession(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    await handleErrorResponse(response);
  }
}

/**
 * Clear all sessions except the active one
 * DELETE /api/v1/sessions
 */
export async function clearAllSessions(
  keepSessionId: string
): Promise<{ deleted: number }> {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ keepSessionId }),
  });
  return handleResponse<{ deleted: number }>(response);
}

/**
 * Save session state (persist to disk)
 * POST /api/v1/sessions/:id/save
 */
export async function saveSession(id: string): Promise<Session> {
  const response = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(id)}/save`,
    {
      method: 'POST',
    }
  );
  return handleResponse<Session>(response);
}

/**
 * Import a session from an export payload
 * POST /api/v1/sessions/import
 */
export async function importSessionApi(
  data: import('@webterm/shared/index').SessionExport
): Promise<{
  session: SessionWithWindows;
  paneIdMap: Record<string, string>;
}> {
  const response = await fetch(`${API_BASE}/sessions/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<{
    session: SessionWithWindows;
    paneIdMap: Record<string, string>;
  }>(response);
}

// ============================================================================
// Window API Functions
// ============================================================================

/**
 * Create a new window in a session
 * POST /api/v1/sessions/:sessionId/windows
 */
export async function createWindow(
  sessionId: string,
  name?: string
): Promise<import('@webterm/shared/index').WindowWithPanes> {
  const response = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/windows`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    }
  );
  return handleResponse<import('@webterm/shared/index').WindowWithPanes>(response);
}

/**
 * Delete a window
 * DELETE /api/v1/windows/:windowId
 */
export async function deleteWindow(windowId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/windows/${encodeURIComponent(windowId)}`,
    {
      method: 'DELETE',
    }
  );
  
  if (!response.ok) {
    await handleErrorResponse(response);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Handle API response with proper error handling
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    await handleErrorResponse(response);
  }

  const data = await response.json();
  return data as T;
}

/**
 * Handle error response and throw appropriate error
 */
async function handleErrorResponse(response: Response): Promise<never> {
  let errorData: ApiResponse<unknown>['error'];
  
  try {
    const body = await response.json();
    errorData = body.error || body;
  } catch {
    errorData = {
      code: 'UNKNOWN_ERROR',
      message: response.statusText || 'An unknown error occurred',
    };
  }

  throw new ApiError(
    errorData?.message || 'Request failed',
    errorData?.code || 'UNKNOWN_ERROR',
    response.status
  );
}

/**
 * Check if an error is an API error
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}
