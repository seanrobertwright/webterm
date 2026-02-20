/**
 * Simple logger utility
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env['LOG_LEVEL'] as LogLevel) ?? 'info';

function formatMessage(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  if (entry.data !== undefined) {
    return `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`;
  }
  return `${prefix} ${entry.message}`;
}

function log(level: LogLevel, message: string, data?: unknown): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) {
    return;
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    data,
  };

  const formatted = formatMessage(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      // Using console.info for info/debug since console.log triggers lint warning
      // eslint-disable-next-line no-console
      console.info(formatted);
  }
}

export const logger = {
  debug: (message: string, data?: unknown): void => log('debug', message, data),
  info: (message: string, data?: unknown): void => log('info', message, data),
  warn: (message: string, data?: unknown): void => log('warn', message, data),
  error: (message: string, data?: unknown): void => log('error', message, data),
};
