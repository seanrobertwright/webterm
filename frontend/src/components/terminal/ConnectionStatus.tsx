import type { ConnectionState } from '@webterm/shared/models';

export interface ConnectionStatusProps {
  /** Current connection state */
  state: ConnectionState;
  /** Additional CSS classes */
  className?: string;
}

const stateConfig: Record<
  ConnectionState,
  { label: string; dotClass: string }
> = {
  connected: {
    label: 'Connected',
    dotClass: 'bg-green-500',
  },
  connecting: {
    label: 'Connecting',
    dotClass: 'bg-yellow-500 animate-pulse',
  },
  disconnected: {
    label: 'Disconnected',
    dotClass: 'bg-destructive',
  },
  exited: {
    label: 'Exited',
    dotClass: 'bg-destructive',
  },
};

/** Connection status indicator badge */
export function ConnectionStatus({ state, className = '' }: ConnectionStatusProps) {
  const config = stateConfig[state];
  if (!config) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded border border-border bg-card text-muted-foreground ${className}`}
        role="status"
        aria-label="Connection status: Unknown"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
        <span>Unknown</span>
      </div>
    );
  }

  return (
    <div
      className={`
        flex items-center gap-1.5
        px-2 py-0.5
        text-[10px] font-semibold uppercase tracking-wider
        rounded border border-border bg-card text-primary
        glow-border
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
