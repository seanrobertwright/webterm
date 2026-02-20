import { useEffect } from 'react';
import type { SessionListItem } from '@webterm/shared/models';

export interface RestoreSessionProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Session to restore */
  session: SessionListItem | null;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Callback to confirm restore */
  onConfirm: (sessionId: string) => void;
  /** Whether restore is in progress */
  isRestoring?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/** Format date for display */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Confirmation dialog before restoring a session */
export function RestoreSession({
  isOpen,
  session,
  onClose,
  onConfirm,
  isRestoring = false,
  className = '',
}: RestoreSessionProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRestoring) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isRestoring, onClose]);

  if (!isOpen || !session) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-session-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => !isRestoring && onClose()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isRestoring) {
            onClose();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div
        className={`
          relative
          w-full max-w-md
          m-4 p-6
          bg-gray-900 border border-gray-700
          rounded-lg shadow-2xl
          ${className}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            id="restore-session-title"
            className="text-xl font-bold text-green-400"
          >
            Restore Session
          </h2>
          <button
            onClick={onClose}
            disabled={isRestoring}
            className="
              p-2
              text-gray-400 hover:text-white
              rounded-md
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-green-500
              disabled:opacity-50 disabled:cursor-not-allowed
            "
            type="button"
            aria-label="Close"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Session details */}
        <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200 mb-3">
            {session.name}
          </h3>
          
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-300">{formatDate(session.createdAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Last updated</dt>
              <dd className="text-gray-300">{formatDate(session.updatedAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Windows</dt>
              <dd className="text-gray-300">{session.windowCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Panes</dt>
              <dd className="text-gray-300">{session.paneCount}</dd>
            </div>
          </dl>
        </div>

        {/* Warning */}
        <div className="mb-6 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-md">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-yellow-200">
              This will close your current session and restore the saved layout.
              Any unsaved work will be lost.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            className="
              px-4 py-2
              bg-gray-700 hover:bg-gray-600
              text-gray-200
              rounded-md
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(session.id)}
            disabled={isRestoring}
            className="
              flex items-center gap-2
              px-4 py-2
              bg-green-600 hover:bg-green-500
              text-white font-medium
              rounded-md
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            {isRestoring && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            <span>{isRestoring ? 'Restoring...' : 'Restore Session'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default RestoreSession;
