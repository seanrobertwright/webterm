import { useEffect, useState } from 'react';

export interface DisconnectionOverlayProps {
  /** Whether the overlay is visible */
  isVisible: boolean;
  /** Seconds until next retry attempt */
  retryInSeconds?: number;
  /** Number of retry attempts made */
  attemptNumber?: number;
  /** Callback to manually trigger reconnect */
  onReconnect?: () => void;
}

/** Full-screen overlay shown when WebSocket is disconnected */
export function DisconnectionOverlay({
  isVisible,
  retryInSeconds = 0,
  attemptNumber = 0,
  onReconnect,
}: DisconnectionOverlayProps) {
  const [dots, setDots] = useState('');

  // Animate the dots
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 text-center p-8 max-w-md">
        {/* Animated icon */}
        <div className="relative">
          <div className="w-16 h-16 border-4 border-yellow-500/30 rounded-full" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        </div>

        {/* Main message */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-yellow-400">
            Connection Lost
          </h2>
          <p className="text-gray-400">
            Reconnecting{dots}
          </p>
        </div>

        {/* Retry info */}
        {retryInSeconds > 0 && (
          <div className="text-sm text-gray-500">
            Retrying in <span className="text-yellow-400 font-mono">{retryInSeconds}</span> seconds
            {attemptNumber > 0 && (
              <span className="text-gray-600"> (attempt #{attemptNumber})</span>
            )}
          </div>
        )}

        {/* Manual reconnect button */}
        {onReconnect && (
          <button
            onClick={onReconnect}
            className="
              px-6 py-2 mt-4
              bg-yellow-600 hover:bg-yellow-500
              text-black font-semibold
              rounded-lg
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 focus:ring-offset-black
            "
            type="button"
          >
            Reconnect Now
          </button>
        )}

        {/* Status indicators */}
        <div className="flex items-center gap-2 text-xs text-gray-600 mt-4">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span>WebSocket disconnected</span>
        </div>
      </div>
    </div>
  );
}

export default DisconnectionOverlay;
