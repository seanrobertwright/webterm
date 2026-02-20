import type { ConnectionState } from '@webterm/shared/models';
import { ConnectionStatus } from '../terminal/ConnectionStatus';

export interface HeaderProps {
  /** Session name to display */
  sessionName: string;
  /** Current WebSocket connection state */
  connectionState: ConnectionState;
  /** Callback when menu button is clicked */
  onMenuClick?: () => void;
  /** Callback when session name is clicked (for editing) */
  onSessionNameClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

/** Application header with session name and status */
export function Header({
  sessionName,
  connectionState,
  onMenuClick,
  onSessionNameClick,
  className = '',
}: HeaderProps) {
  return (
    <header
      className={`
        flex items-center justify-between
        h-10 px-4
        bg-gray-950 border-b border-gray-800
        ${className}
      `}
    >
      {/* Left: Menu button */}
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="
            p-2 -ml-2
            text-gray-400 hover:text-green-400
            rounded
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-green-500/50
          "
          type="button"
          aria-label="Open menu"
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
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      {/* Center: Session name with glitch effect */}
      <button
        onClick={onSessionNameClick}
        className="
          glitch-text
          text-lg font-bold 
          text-green-400
          hover:text-green-300
          cursor-pointer
          transition-colors
          focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:rounded
        "
        type="button"
        aria-label={`Session: ${sessionName}. Click to edit.`}
      >
        {sessionName}
      </button>

      {/* Right: Connection status */}
      <div className="flex items-center">
        <div className="relative">
          <ConnectionStatus state={connectionState} className="static" />
        </div>
      </div>
    </header>
  );
}

export default Header;
