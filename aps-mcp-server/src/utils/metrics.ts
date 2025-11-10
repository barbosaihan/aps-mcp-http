/**
 * Sistema de Métricas de Performance
 * 
 * Coleta métricas de performance para monitoramento:
 * - Tempo de execução de operações
 * - Contadores de chamadas de API
 * - Taxa de sucesso/erro
 * - Uso de cache
 */

interface MetricEntry {
    name: string;
    value: number;
    timestamp: number;
    tags?: Record<string, string>;
}

interface Counter {
    count: number;
    total: number;
    errors: number;
}

// Armazenamento de métricas em memória
const metrics: MetricEntry[] = [];
const counters: Map<string, Counter> = new Map();

// Limitar tamanho do array de métricas (mantém apenas últimas 1000)
const MAX_METRICS = 1000;

/**
 * Adiciona uma métrica de tempo
 */
export function recordTiming(name: string, duration: number, tags?: Record<string, string>) {
    metrics.push({
        name,
        value: duration,
        timestamp: Date.now(),
        tags,
    });

    // Manter apenas as últimas métricas
    if (metrics.length > MAX_METRICS) {
        metrics.shift();
    }
}

/**
 * Incrementa um contador
 */
export function incrementCounter(name: string, tags?: Record<string, string>) {
    const key = tags ? `${name}:${JSON.stringify(tags)}` : name;
    const counter = counters.get(key) || { count: 0, total: 0, errors: 0 };
    counter.count++;
    counter.total++;
    counters.set(key, counter);
}

/**
 * Incrementa contador de erros
 */
export function incrementErrorCounter(name: string, tags?: Record<string, string>) {
    const key = tags ? `${name}:${JSON.stringify(tags)}` : name;
    const counter = counters.get(key) || { count: 0, total: 0, errors: 0 };
    counter.errors++;
    counter.total++;
    counters.set(key, counter);
}

/**
 * Wrapper para medir tempo de execução de uma função
 */
export async function measureTiming<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
): Promise<T> {
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        recordTiming(name, duration, { ...tags, success: "true" });
        incrementCounter(name, tags);
        return result;
    } catch (error) {
        const duration = Date.now() - start;
        recordTiming(name, duration, { ...tags, success: "false" });
        incrementErrorCounter(name, tags);
        throw error;
    }
}

/**
 * Obtém estatísticas de um contador
 */
export function getCounterStats(name: string): Counter | null {
    // Buscar contador exato ou por prefixo
    for (const [key, counter] of counters.entries()) {
        if (key.startsWith(name)) {
            return counter;
        }
    }
    return null;
}

/**
 * Obtém métricas de timing agregadas
 */
export function getTimingStats(name: string, windowMs: number = 60000): {
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
} | null {
    const now = Date.now();
    const windowStart = now - windowMs;
    const relevantMetrics = metrics.filter(
        (m) => m.name === name && m.timestamp >= windowStart
    );

    if (relevantMetrics.length === 0) {
        return null;
    }

    const values = relevantMetrics.map((m) => m.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = values[0];
    const max = values[values.length - 1];
    const p50 = values[Math.floor(count * 0.5)];
    const p95 = values[Math.floor(count * 0.95)];
    const p99 = values[Math.floor(count * 0.99)];

    return { count, avg, min, max, p50, p95, p99 };
}

/**
 * Obtém todas as métricas resumidas
 */
export function getAllMetrics(): {
    timings: Record<string, ReturnType<typeof getTimingStats>>;
    counters: Record<string, Counter>;
} {
    const timingNames = new Set(metrics.map((m) => m.name));
    const timings: Record<string, ReturnType<typeof getTimingStats>> = {};
    
    for (const name of timingNames) {
        timings[name] = getTimingStats(name) || null;
    }

    const countersObj: Record<string, Counter> = {};
    for (const [key, counter] of counters.entries()) {
        countersObj[key] = counter;
    }

    return { timings, counters: countersObj };
}

/**
 * Limpa métricas antigas (útil para liberar memória)
 */
export function clearOldMetrics(olderThanMs: number = 3600000) {
    const cutoff = Date.now() - olderThanMs;
    const initialLength = metrics.length;
    
    // Remover métricas antigas
    while (metrics.length > 0 && metrics[0].timestamp < cutoff) {
        metrics.shift();
    }
    
    return initialLength - metrics.length;
}

/**
 * Reseta todas as métricas (útil para testes)
 */
export function resetMetrics() {
    metrics.length = 0;
    counters.clear();
}

