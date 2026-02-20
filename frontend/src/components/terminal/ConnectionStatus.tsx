import type { ConnectionState } from '@webterm/shared/models';

export interface ConnectionStatusProps {
  /** Current connection state */
  state: ConnectionState;
  /** Additional CSS classes */
  className?: string;
}

const stateConfig: Record<
  ConnectionState,
  { label: string; colorClass: string; dotClass: string }
> = {
  connected: {
    label: 'Connected',
    colorClass: 'bg-green-900/50 text-green-400 border-green-600',
    dotClass: 'bg-green-500',
  },
  connecting: {
    label: 'Connecting',
    colorClass: 'bg-yellow-900/50 text-yellow-400 border-yellow-600',
    dotClass: 'bg-yellow-500 animate-pulse',
  },
  disconnected: {
    label: 'Disconnected',
    colorClass: 'bg-red-900/50 text-red-400 border-red-600',
    dotClass: 'bg-red-500',
  },
  exited: {
    label: 'Exited',
    colorClass: 'bg-gray-900/50 text-gray-400 border-gray-600',
    dotClass: 'bg-gray-500',
  },
};

/** Connection status indicator badge */
export function ConnectionStatus({ state, className = '' }: ConnectionStatusProps) {
  const config = stateConfig[state];
  if (!config) {
    return (
      <div
        className={`absolute top-1 right-1 z-20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border bg-gray-900/50 text-gray-400 border-gray-600 ${className}`}
        role="status"
        aria-label="Connection status: Unknown"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
        <span>Unknown</span>
      </div>
    );
  }

  return (
    <div
      className={`
        absolute top-1 right-1 z-20
        flex items-center gap-1.5
        px-2 py-0.5
        text-[10px] font-semibold uppercase tracking-wider
        rounded border
        ${config.colorClass}
        ${className}
      `}
      role="status"
      aria-label={`Connection status: ${config.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      <span>{config.label}</span>
    </div>
  );
}

export default ConnectionStatus;
