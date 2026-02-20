export interface BroadcastToggleProps {
  /** Whether broadcast mode is enabled */
  enabled: boolean;
  /** Callback when toggle is clicked */
  onToggle: (enabled: boolean) => void;
  /** Number of panes currently in broadcast mode */
  paneCount?: number;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/** Toggle button for broadcast mode */
export function BroadcastToggle({
  enabled,
  onToggle,
  paneCount = 0,
  disabled = false,
  className = '',
}: BroadcastToggleProps) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      disabled={disabled}
      className={`
        flex items-center gap-2
        px-3 py-1.5
        rounded-md
        text-sm font-medium
        transition-all
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
        ${enabled
          ? 'bg-purple-600 text-white hover:bg-purple-500 focus:ring-purple-500'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 focus:ring-gray-500'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      type="button"
      aria-pressed={enabled}
      aria-label={`Broadcast mode ${enabled ? 'enabled' : 'disabled'}`}
    >
      {/* Broadcast icon */}
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
          d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
        />
      </svg>

      <span>Broadcast</span>

      {/* Pane count badge */}
      {enabled && paneCount > 0 && (
        <span className="flex items-center justify-center min-w-5 h-5 px-1.5 bg-purple-800 text-xs rounded-full">
          {paneCount}
        </span>
      )}

      {/* Status indicator */}
      {enabled && (
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      )}
    </button>
  );
}

export default BroadcastToggle;
