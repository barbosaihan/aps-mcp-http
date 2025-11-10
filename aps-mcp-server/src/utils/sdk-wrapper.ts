/**
 * Wrapper para SDKs da APS com retry logic e logging
 * 
 * Fornece retry automático para operações de leitura (GET) usando SDKs
 * e integração com sistema de logging e métricas
 */

import { logger } from "./logger.js";
import { measureTiming, incrementCounter, incrementErrorCounter } from "./metrics.js";

/**
 * Opções para retry de SDK
 */
interface RetryOptions {
    maxRetries?: number;
    retryDelay?: number;
    retryableErrors?: number[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    retryDelay: 1000,
    retryableErrors: [429, 500, 502, 503, 504], // Rate limit e erros de servidor
};

/**
 * Verifica se um erro é retryable
 */
function isRetryableError(error: any): boolean {
    // Verificar se é um erro de status HTTP
    if (error?.response?.status) {
        const status = error.response.status;
        return DEFAULT_RETRY_OPTIONS.retryableErrors?.includes(status) || false;
    }
    
    // Verificar se é um erro de timeout ou rede
    if (error?.code === "ETIMEDOUT" || error?.code === "ECONNRESET" || error?.code === "ENOTFOUND") {
        return true;
    }
    
    // Verificar se a mensagem de erro indica problema temporário
    const message = error?.message?.toLowerCase() || "";
    if (message.includes("timeout") || message.includes("network") || message.includes("temporary")) {
        return true;
    }
    
    return false;
}

/**
 * Wrapper para operações de SDK com retry automático
 * 
 * Apenas para operações de leitura (GET) - nunca para POST/PATCH/DELETE
 */
export async function withSdkRetry<T>(
    operationName: string,
    operation: () => Promise<T>,
    options: RetryOptions = {},
    isReadOperation: boolean = true
): Promise<T> {
    const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
    const maxRetries = isReadOperation ? opts.maxRetries || 0 : 0;
    
    return measureTiming(
        `sdk.${operationName}`,
        async () => {
            let lastError: any;
            
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    const result = await operation();
                    
                    if (attempt > 0) {
                        logger.info(`SDK operation succeeded after retry`, {
                            operation: operationName,
                            attempt: attempt + 1,
                        });
                    }
                    
                    incrementCounter(`sdk.${operationName}`, { success: "true" });
                    return result;
                } catch (error: any) {
                    lastError = error;
                    
                    // Não fazer retry se não for operação de leitura
                    if (!isReadOperation) {
                        logger.error(`SDK operation failed (no retry for write operations)`, error, {
                            operation: operationName,
                        });
                        incrementErrorCounter(`sdk.${operationName}`, { type: "write" });
                        throw error;
                    }
                    
                    // Verificar se é um erro retryable
                    if (!isRetryableError(error)) {
                        logger.error(`SDK operation failed (non-retryable error)`, error, {
                            operation: operationName,
                            attempt: attempt + 1,
                        });
                        incrementErrorCounter(`sdk.${operationName}`, { type: "non-retryable" });
                        throw error;
                    }
                    
                    // Se não é a última tentativa, fazer retry
                    if (attempt < maxRetries) {
                        const delay = opts.retryDelay! * Math.pow(2, attempt); // Exponential backoff
                        logger.warn(`SDK operation failed, retrying...`, {
                            operation: operationName,
                            attempt: attempt + 1,
                            maxRetries,
                            delayMs: delay,
                            error: error?.message || error?.toString(),
                        });
                        
                        await new Promise((resolve) => setTimeout(resolve, delay));
                        continue;
                    }
                    
                    // Última tentativa falhou
                    logger.error(`SDK operation failed after all retries`, error, {
                        operation: operationName,
                        attempts: attempt + 1,
                    });
                    incrementErrorCounter(`sdk.${operationName}`, { type: "max-retries" });
                    throw error;
                }
            }
            
            // Nunca deve chegar aqui, mas TypeScript precisa
            throw lastError || new Error(`SDK operation failed: ${operationName}`);
        },
        { operation: operationName }
    );
}

/**
 * Wrapper simples sem retry (para operações de escrita)
 */
export async function withSdkLogging<T>(
    operationName: string,
    operation: () => Promise<T>
): Promise<T> {
    return measureTiming(
        `sdk.${operationName}`,
        async () => {
            try {
                const result = await operation();
                incrementCounter(`sdk.${operationName}`, { success: "true" });
                return result;
            } catch (error: any) {
                logger.error(`SDK operation failed`, error, {
                    operation: operationName,
                });
                incrementErrorCounter(`sdk.${operationName}`, { type: "error" });
                throw error;
            }
        },
        { operation: operationName }
    );
}

