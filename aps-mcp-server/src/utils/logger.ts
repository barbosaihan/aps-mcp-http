/**
 * Sistema de Logging Estruturado
 * 
 * Fornece logging estruturado com níveis (info, error, debug, warn)
 * e formatação consistente para debugging em produção
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

// Nível de log atual (pode ser configurado via env)
const currentLogLevel: LogLevel = process.env.LOG_LEVEL
    ? (LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO)
    : LogLevel.INFO;

interface LogEntry {
    level: string;
    message: string;
    timestamp: string;
    context?: Record<string, any>;
    error?: {
        message: string;
        stack?: string;
        code?: string;
    };
}

/**
 * Formata entrada de log como JSON estruturado
 */
function formatLogEntry(level: string, message: string, context?: Record<string, any>, error?: Error): string {
    const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
    };

    if (context && Object.keys(context).length > 0) {
        entry.context = context;
    }

    if (error) {
        entry.error = {
            message: error.message,
            stack: error.stack,
            ...(error as any).code && { code: (error as any).code },
        };
    }

    return JSON.stringify(entry);
}

/**
 * Logger principal
 */
export const logger = {
    /**
     * Log de debug (apenas em desenvolvimento)
     */
    debug: (message: string, context?: Record<string, any>) => {
        if (currentLogLevel <= LogLevel.DEBUG) {
            console.log(formatLogEntry("DEBUG", message, context));
        }
    },

    /**
     * Log de informação
     */
    info: (message: string, context?: Record<string, any>) => {
        if (currentLogLevel <= LogLevel.INFO) {
            console.log(formatLogEntry("INFO", message, context));
        }
    },

    /**
     * Log de aviso
     */
    warn: (message: string, context?: Record<string, any>) => {
        if (currentLogLevel <= LogLevel.WARN) {
            console.warn(formatLogEntry("WARN", message, context));
        }
    },

    /**
     * Log de erro
     */
    error: (message: string, error?: Error, context?: Record<string, any>) => {
        if (currentLogLevel <= LogLevel.ERROR) {
            console.error(formatLogEntry("ERROR", message, context, error));
        }
    },

    /**
     * Define o nível de log (útil para testes)
     */
    setLevel: (level: LogLevel) => {
        (currentLogLevel as any) = level;
    },
};

