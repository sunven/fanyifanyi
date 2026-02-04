import { debug, error, info, trace, warn } from '@tauri-apps/plugin-log'

/**
 * Logger utility for the application.
 * Wraps tauri-plugin-log with additional error context extraction.
 */
export const logger = {
  /**
   * Log an error message with optional error context.
   * The error's stack trace will be included if available.
   */
  error: (message: string, err?: unknown): void => {
    const context = err instanceof Error
      ? `\n${err.stack || err.message}`
      : String(err ?? '')
    error(`${message}:${context}`)
  },

  /**
   * Log a warning message.
   */
  warn: (message: string): void => {
    warn(message)
  },

  /**
   * Log an informational message.
   */
  info: (message: string): void => {
    info(message)
  },

  /**
   * Log a debug message.
   */
  debug: (message: string): void => {
    debug(message)
  },

  /**
   * Log a trace message.
   */
  trace: (message: string): void => {
    trace(message)
  },
}
