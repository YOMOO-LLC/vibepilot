import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Create a structured logger with pino
 */
export const createLogger = (name: string) => {
  return pino({
    name,
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        }
      : undefined,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
};

/**
 * Default logger for the agent
 */
export const logger = createLogger('@vibepilot/agent');

/**
 * Logger type for convenience
 */
export type Logger = ReturnType<typeof createLogger>;
