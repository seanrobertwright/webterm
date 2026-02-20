import { useEffect, useCallback } from 'react';

export interface Keybinding {
  keys: string;
  description: string;
  category?: string;
}

const defaultKeybindings: Keybinding[] = [
  // Pane management
  { keys: 'Ctrl+B %', description: 'Split pane vertically', category: 'Panes' },
  { keys: 'Ctrl+B "', description: 'Split pane horizontally', category: 'Panes' },
  { keys: 'Ctrl+B x', description: 'Close current pane', category: 'Panes' },
  { keys: 'Ctrl+B z', description: 'Toggle pane zoom', category: 'Panes' },
  
  // Navigation
  { keys: 'Ctrl+B ←', description: 'Focus pane left', category: 'Navigation' },
  { keys: 'Ctrl+B →', description: 'Focus pane right', category: 'Navigation' },
  { keys: 'Ctrl+B ↑', description: 'Focus pane up', category: 'Navigation' },
  { keys: 'Ctrl+B ↓', description: 'Focus pane down', category: 'Navigation' },
  
  // Windows
  { keys: 'Ctrl+B c', description: 'Create new window', category: 'Windows' },
  { keys: 'Ctrl+B n', description: 'Next window', category: 'Windows' },
  { keys: 'Ctrl+B p', description: 'Previous window', category: 'Windows' },
  { keys: 'Ctrl+B 0-9', description: 'Switch to window N', category: 'Windows' },
  
  // Session
  { keys: 'Ctrl+B s', description: 'Save session', category: 'Session' },
  { keys: 'Ctrl+B r', description: 'Restore session', category: 'Session' },
  
  // Other
  { keys: 'Ctrl+B ?', description: 'Show this help', category: 'Help' },
  { keys: 'Ctrl+B b', description: 'Toggle broadcast mode', category: 'Other' },
];

export interface KeybindingsHelpProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Custom keybindings to display */
  keybindings?: Keybinding[];
  /** Additional CSS classes */
  className?: string;
}

/** Modal overlay showing keyboard shortcuts */
export function KeybindingsHelp({
  isOpen,
  onClose,
  keybindings = defaultKeybindings,
  className = '',
}: KeybindingsHelpProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
    return undefined;
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Group keybindings by category
  const groupedBindings = keybindings.reduce<Record<string, Keybinding[]>>(
    (acc, binding) => {
      const category = binding.category ?? 'Other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(binding);
      return acc;
    },
    {}
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keybindings-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            onClose();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Close dialog"
      />

      {/* Modal */}
      <div
        className={`
          relative
          w-full max-w-2xl max-h-[80vh]
          m-4 p-6
          bg-gray-900 border border-gray-700
          rounded-lg shadow-2xl
          overflow-y-auto
          ${className}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2
            id="keybindings-title"
            className="text-xl font-bold text-green-400 glitch-text"
          >
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            className="
              p-2
              text-gray-400 hover:text-white
              rounded-md
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-green-500
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

        {/* Prefix key notice */}
        <div className="mb-6 p-3 bg-gray-800 rounded-md text-sm text-gray-300">
          <span className="text-yellow-400 font-semibold">Note:</span> All shortcuts use{' '}
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-green-400 font-mono">
            Ctrl+B
          </kbd>{' '}
          as a prefix key, similar to tmux.
        </div>

        {/* Keybinding categories */}
        <div className="space-y-6">
          {Object.entries(groupedBindings).map(([category, bindings]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {bindings.map((binding, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 px-3 bg-gray-800/50 rounded"
                  >
                    <span className="text-gray-300">{binding.description}</span>
                    <kbd className="px-2 py-1 bg-gray-700 rounded text-green-400 font-mono text-sm">
                      {binding.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-700 text-center text-xs text-gray-500">
          Press <kbd className="px-1 bg-gray-700 rounded">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
}

export default KeybindingsHelp;
