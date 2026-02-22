/**
 * Brief toast notification for clipboard operations
 */

import { useEffect, useState } from 'react';

export interface ClipboardNotificationProps {
  message: string | null;
  duration?: number;
  onDismiss: () => void;
}

export function ClipboardNotification({
  message,
  duration = 2000,
  onDismiss,
}: ClipboardNotificationProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }

    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!visible || !message) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg shadow-lg text-sm text-gray-200 animate-fade-in">
      {message}
    </div>
  );
}
