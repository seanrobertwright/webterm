import { useState, useRef, useEffect, useCallback } from 'react';
import type { ConnectionState } from '@webterm/shared/models';
import { ConnectionStatus } from '../terminal/ConnectionStatus';
import { ThemeSelector } from './ThemeSelector';

export interface HeaderProps {
  /** Session name to display */
  sessionName: string;
  /** Current WebSocket connection state */
  connectionState: ConnectionState;
  /** Callback when menu button is clicked */
  onMenuClick?: () => void;
  /** Callback when settings button is clicked */
  onSettingsClick?: () => void;
  /** Callback when session name is clicked (for editing) */
  onSessionNameClick?: () => void;
  /** Callback when session name is saved after inline edit */
  onSessionNameSave?: (newName: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/** Application header with session name and status */
export function Header({
  sessionName,
  connectionState,
  onMenuClick,
  onSettingsClick,
  onSessionNameClick,
  onSessionNameSave,
  className = '',
}: HeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(sessionName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  // Sync editValue when sessionName changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(sessionName);
    }
  }, [sessionName, isEditing]);

  const handleNameClick = useCallback(() => {
    if (onSessionNameSave) {
      setEditValue(sessionName);
      setIsEditing(true);
    }
    onSessionNameClick?.();
  }, [sessionName, onSessionNameClick, onSessionNameSave]);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== sessionName) {
      onSessionNameSave?.(trimmed);
    }
    setIsEditing(false);
  }, [editValue, sessionName, onSessionNameSave]);

  const handleCancel = useCallback(() => {
    setEditValue(sessionName);
    setIsEditing(false);
  }, [sessionName]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  return (
    <header
      className={`
        flex items-center justify-between
        h-10 px-4
        bg-card border-b border-border
        ${className}
      `}
    >
      {/* Left: Logo + Menu button */}
      <div className="flex items-center gap-1">
        <img
          src="/favicon.ico"
          alt="WebTerm"
          className="w-6 h-6"
        />
        <button
          onClick={onMenuClick}
          className="
            p-2
            text-muted-foreground hover:text-primary
            rounded
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-ring/50
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

      {/* Center: Session name (editable) */}
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          maxLength={50}
          className="
            text-lg font-bold text-primary
            bg-input border border-primary
            rounded px-2 py-0.5
            focus:outline-none focus:ring-2 focus:ring-ring
            text-center
            w-64 max-w-[50vw]
          "
          aria-label="Edit session name"
        />
      ) : (
        <button
          onClick={handleNameClick}
          className="
            glitch-text
            text-lg font-bold
            text-primary
            hover:brightness-125
            cursor-pointer
            transition-colors
            focus:outline-none focus:ring-2 focus:ring-ring/50 focus:rounded
          "
          type="button"
          aria-label={`Session: ${sessionName}. Click to edit.`}
        >
          {sessionName}
        </button>
      )}

      {/* Right: Theme selector + Settings + Connection status */}
      <div className="flex items-center gap-2">
        <ThemeSelector />
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="
              p-2
              text-muted-foreground hover:text-primary
              rounded
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-ring/50
            "
            type="button"
            aria-label="Open settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
        <div className="relative">
          <ConnectionStatus state={connectionState} className="static" />
        </div>
      </div>
    </header>
  );
}

export default Header;
