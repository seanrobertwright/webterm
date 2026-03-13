import { useCallback, useState } from 'react';
import type { SessionListItem } from '@webterm/shared/models';
import { exportSession } from '../../services/export-service';

export interface SessionListProps {
  /** Array of sessions to display */
  sessions: SessionListItem[];
  /** Whether the list is loading */
  isLoading?: boolean;
  /** Callback when restore button is clicked */
  onRestore: (sessionId: string) => void;
  /** Callback when delete button is clicked */
  onDelete: (sessionId: string) => void;
  /** ID of the currently active session (cannot be deleted) */
  currentSessionId?: string | undefined;
  /** Additional CSS classes */
  className?: string;
}

/** Format date for display */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Session list with restore and delete actions */
export function SessionList({
  sessions,
  isLoading = false,
  onRestore,
  onDelete,
  currentSessionId,
  className = '',
}: SessionListProps) {
  const handleRestore = useCallback(
    (sessionId: string) => {
      onRestore(sessionId);
    },
    [onRestore]
  );

  const handleDelete = useCallback(
    (sessionId: string) => {
      onDelete(sessionId);
    },
    [onDelete]
  );

  const [exportingId, setExportingId] = useState<string | null>(null);

  const handleExport = useCallback(async (sessionId: string) => {
    setExportingId(sessionId);
    try {
      await exportSession(sessionId);
    } catch (err) {
      console.error('[SessionList] Export failed:', err);
    } finally {
      setExportingId(null);
    }
  }, []);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-500 border-t-green-500 rounded-full animate-spin" />
          <span>Loading sessions...</span>
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <svg
          className="w-16 h-16 text-gray-700 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
        <p className="text-gray-500">No saved sessions</p>
        <p className="text-sm text-gray-600 mt-1">
          Save a session to access it later
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {sessions.map((session) => {
        const isActive = session.id === currentSessionId;
        return (
        <div
          key={session.id}
          className={`
            flex items-center justify-between
            p-4
            ${isActive ? 'bg-green-900/30 border-green-600/70' : 'bg-gray-800/50 hover:bg-gray-800 border-gray-700 hover:border-green-600/50'}
            border
            rounded-lg
            transition-colors
          `}
        >
          {/* Session info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-medium text-gray-200 truncate">
              {session.name}
              {isActive && (
                <span className="ml-2 text-xs font-normal text-green-400 bg-green-900/50 px-2 py-0.5 rounded">
                  active
                </span>
              )}
            </h3>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span>{formatDate(session.createdAt)}</span>
              <span className="flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h7"
                  />
                </svg>
                {session.windowCount} window{session.windowCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                  />
                </svg>
                {session.paneCount} pane{session.paneCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => handleRestore(session.id)}
              className="
                px-4 py-2
                bg-green-600 hover:bg-green-500
                text-white font-medium
                rounded-md
                transition-colors
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900
              "
              type="button"
              aria-label={`Restore session ${session.name}`}
            >
              Restore
            </button>
            <button
              onClick={() => void handleExport(session.id)}
              disabled={exportingId === session.id}
              className={`
                p-2
                rounded-md
                transition-colors
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900
                ${exportingId === session.id ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-blue-400'}
              `}
              type="button"
              title={`Export session ${session.name}`}
              aria-label={`Export session ${session.name}`}
            >
              <svg
                className={`w-5 h-5 ${exportingId === session.id ? 'animate-pulse' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </button>
            <button
              onClick={() => handleDelete(session.id)}
              disabled={isActive}
              className={`
                p-2
                rounded-md
                transition-colors
                focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900
                ${isActive ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-red-400'}
              `}
              type="button"
              title={isActive ? 'Cannot delete active session' : `Delete session ${session.name}`}
              aria-label={isActive ? 'Cannot delete active session' : `Delete session ${session.name}`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

export default SessionList;
