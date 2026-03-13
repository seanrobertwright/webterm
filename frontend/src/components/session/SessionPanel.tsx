/**
 * Slide-out session panel for managing saved sessions
 */

import { useState, useEffect, useCallback } from 'react';
import { SessionList } from './SessionList';
import { ClearAllDialog } from './ClearAllDialog';
import {
  fetchSessions,
  deleteSession as apiDeleteSession,
  clearAllSessions,
} from '../../services/session-api';
import { importSession } from '../../services/import-service';
import type { SessionListItem } from '@webterm/shared/models';

export interface SessionPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (sessionId: string) => void;
  onNewSession: () => void;
  currentSessionId?: string | undefined;
}

export function SessionPanel({ isOpen, onClose, onRestore, onNewSession, currentSessionId }: SessionPanelProps) {
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);

  const refreshSessions = useCallback(() => {
    setIsLoading(true);
    fetchSessions()
      .then(setSessions)
      .catch((err) => console.error('[SessionPanel] Failed to fetch sessions:', err))
      .finally(() => setIsLoading(false));
  }, []);

  // Fetch sessions when panel opens
  useEffect(() => {
    if (!isOpen) return;
    refreshSessions();
  }, [isOpen, refreshSessions]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleDelete = useCallback(async (sessionId: string) => {
    try {
      await apiDeleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('[SessionPanel] Failed to delete session:', err);
    }
  }, []);

  const handleRestore = useCallback((sessionId: string) => {
    onRestore(sessionId);
    onClose();
  }, [onRestore, onClose]);

  const handleClearAll = useCallback(async () => {
    if (!currentSessionId) return;
    try {
      await clearAllSessions(currentSessionId);
      setShowClearAll(false);
      refreshSessions();
    } catch (err) {
      console.error('[SessionPanel] Failed to clear all sessions:', err);
    }
  }, [currentSessionId, refreshSessions]);

  const handleImport = useCallback(async () => {
    setIsImporting(true);
    try {
      const result = await importSession();
      if (result) {
        // Switch to the imported session (scrollback replay is already scheduled)
        onRestore(result.sessionId);
        refreshSessions();
      }
    } catch (err) {
      console.error('[SessionPanel] Failed to import session:', err);
    } finally {
      setIsImporting(false);
    }
  }, [onRestore, refreshSessions]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Enter') onClose(); }}
        role="button"
        tabIndex={0}
        aria-label="Close session panel"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 left-0 z-50 w-96 max-w-[85vw] bg-gray-900 border-r border-gray-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-green-400">Sessions</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleImport()}
              disabled={isImporting}
              className="px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 border border-blue-800/50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              type="button"
            >
              {isImporting ? 'Importing...' : 'Import'}
            </button>
            {sessions.length >= 2 && (
              <button
                onClick={() => setShowClearAll(true)}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 border border-red-800/50 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
                type="button"
              >
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white rounded transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
              type="button"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* New Session button */}
        <div className="p-4 border-b border-gray-800">
          <button
            onClick={() => { onNewSession(); onClose(); }}
            className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500"
            type="button"
          >
            + New Session
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto p-4">
          <SessionList
            sessions={sessions}
            isLoading={isLoading}
            onRestore={handleRestore}
            onDelete={handleDelete}
            currentSessionId={currentSessionId}
          />
        </div>
      </div>

      {/* Clear All confirmation dialog */}
      {showClearAll && (
        <ClearAllDialog
          sessionCount={sessions.length - 1}
          onConfirm={() => void handleClearAll()}
          onCancel={() => setShowClearAll(false)}
        />
      )}
    </>
  );
}
