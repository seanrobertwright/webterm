import { useState, useCallback, useEffect, useRef } from 'react';

export interface SaveSessionDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Callback when session is saved */
  onSave: (name: string) => void;
  /** Default session name */
  defaultName?: string;
  /** Whether save is in progress */
  isSaving?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Additional CSS classes */
  className?: string;
}

/** Dialog for saving a session with a name */
export function SaveSessionDialog({
  isOpen,
  onClose,
  onSave,
  defaultName = '',
  isSaving = false,
  error = null,
  className = '',
}: SaveSessionDialogProps) {
  const [name, setName] = useState(defaultName);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setValidationError(null);
      // Focus input after render
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, defaultName]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const validateName = useCallback((value: string): string | null => {
    if (!value.trim()) {
      return 'Session name is required';
    }
    if (value.length > 50) {
      return 'Session name must be 50 characters or less';
    }
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(value)) {
      return 'Session name can only contain letters, numbers, spaces, hyphens, and underscores';
    }
    return null;
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const error = validateName(name);
      if (error) {
        setValidationError(error);
        return;
      }

      onSave(name.trim());
    },
    [name, validateName, onSave]
  );

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setName(value);
      if (validationError) {
        setValidationError(validateName(value));
      }
    },
    [validationError, validateName]
  );

  if (!isOpen) return null;

  const displayError = error ?? validationError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-session-title"
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
            id="save-session-title"
            className="text-xl font-bold text-green-400"
          >
            Save Session
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
            disabled={isSaving}
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

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Session name input */}
            <div>
              <label
                htmlFor="session-name"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Session Name
              </label>
              <input
                ref={inputRef}
                id="session-name"
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="Enter session name..."
                disabled={isSaving}
                className={`
                  w-full
                  px-4 py-2
                  bg-gray-800 
                  border rounded-md
                  text-gray-200 placeholder-gray-500
                  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors
                  ${displayError
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-gray-700 focus:ring-green-500 focus:border-green-500'
                  }
                `}
                aria-invalid={!!displayError}
                aria-describedby={displayError ? 'name-error' : undefined}
              />
              {displayError && (
                <p
                  id="name-error"
                  className="mt-2 text-sm text-red-400"
                  role="alert"
                >
                  {displayError}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
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
              type="submit"
              disabled={isSaving || !!validationError}
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
              {isSaving && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SaveSessionDialog;
