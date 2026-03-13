/**
 * Confirmation dialog for clearing all sessions except the active one.
 */

export interface ClearAllDialogProps {
  /** Number of sessions that will be deleted */
  sessionCount: number;
  /** Called when user confirms deletion */
  onConfirm: () => void;
  /** Called when user cancels */
  onCancel: () => void;
}

export function ClearAllDialog({ sessionCount, onConfirm, onCancel }: ClearAllDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCancel();
        }}
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
      />

      {/* Dialog card */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-6">
        <h3 className="text-lg font-bold text-gray-200 mb-2">Clear All Sessions</h3>
        <p className="text-sm text-gray-400 mb-6">
          This will permanently delete{' '}
          <span className="font-semibold text-gray-200">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''}
          </span>
          . Your active session will be kept.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 rounded-md"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            type="button"
          >
            Delete All
          </button>
        </div>
      </div>
    </div>
  );
}
