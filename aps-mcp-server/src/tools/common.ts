import { ZodRawShape } from "zod";
import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import fetch, { RequestInit, Response } from "node-fetch";
import { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SA_ID, APS_SA_KEY_ID, APS_SA_PRIVATE_KEY } from "../config.js";
import { getServiceAccountAccessToken, getClientCredentialsAccessToken } from "../auth.js";
import { logger } from "../utils/logger.js";
import { measureTiming, incrementCounter, incrementErrorCounter } from "../utils/metrics.js";

export interface Tool<Args extends ZodRawShape> {
    title: string;
    description: string;
    schema: Args;
    callback: ToolCallback<Args>;
}

// Cache de tokens para service account
const credentialsCache = new Map<string, { accessToken: string, expiresAt: number }>();

// Cache de tokens para client credentials
const clientCredentialsCache = new Map<string, { accessToken: string, expiresAt: number }>();

// Timeout padrão para requisições HTTP (30 segundos)
const DEFAULT_TIMEOUT = 30000;

// Limpar cache expirado periodicamente (a cada 5 minutos)
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of credentialsCache.entries()) {
        if (value.expiresAt < now) {
            credentialsCache.delete(key);
        }
    }
    for (const [key, value] of clientCredentialsCache.entries()) {
        if (value.expiresAt < now) {
            clientCredentialsCache.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Remove o prefixo "b." de projectId se presente
 */
export function cleanProjectId(projectId: string): string {
    return projectId.replace(/^b\./, "").trim();
}

/**
 * Remove o prefixo "b." de accountId se presente
 */
export function cleanAccountId(accountId: string): string {
    return accountId.replace(/^b\./, "").trim();
}

/**
 * Valida se uma string é um GUID válido (UUID v4)
 */
export function isValidGuid(value: string): boolean {
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return guidRegex.test(value);
}

/**
 * Extrai GUID de uma string URN (ex: "urn:adsk.plm:projects.b.xxx-yyy-zzz")
 */
function extractGuidFromUrn(urn: string): string | null {
    // Padrão URN: urn:adsk.plm:projects.b.GUID ou similares
    const urnMatch = urn.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (urnMatch) {
        return urnMatch[0];
    }
    return null;
}

/**
 * Extrai o GUID de um projectId, validando que seja um GUID válido
 */
export function extractProjectGuid(project: any): string | null {
    // Tentar diferentes campos onde o GUID pode estar
    const possibleIds = [
        project.id,
        project.relationships?.project?.data?.id,
        project.attributes?.id,
        project.projectId,
        project.attributes?.projectId
    ].filter(Boolean);
    
    for (const id of possibleIds) {
        if (!id || typeof id !== 'string') continue;
        
        // Se for URN, extrair GUID
        if (id.startsWith('urn:')) {
            const guid = extractGuidFromUrn(id);
            if (guid && isValidGuid(guid)) {
                return guid;
            }
        }
        
        // Remover prefixo "b." se presente
        let cleanId = id.replace(/^b\./, "").trim();
        
        // Se ainda contém "b.", pode ser um URN sem "urn:" prefix
        if (cleanId.includes('b.')) {
            const guid = extractGuidFromUrn(cleanId);
            if (guid && isValidGuid(guid)) {
                return guid;
            }
        }
        
        // Validar se é um GUID válido direto
        if (isValidGuid(cleanId)) {
            return cleanId;
        }
    }
    
    return null;
}

/**
 * Constrói URL da API APS com base no endpoint
 */
export function buildApiUrl(endpoint: string, baseUrl: string = "https://developer.api.autodesk.com"): string {
    // Remove barra inicial se presente no endpoint
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
    return `${baseUrl}/${cleanEndpoint}`;
}

/**
 * Trata erros da API de forma consistente
 */
export async function handleApiError(response: Response, context: { operation: string; [key: string]: any }): Promise<Error> {
    let errorMessage = `Could not ${context.operation} (HTTP ${response.status})`;
    let errorText = "";
    
    try {
        errorText = await response.text();
        try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.developerMessage || errorJson.message || errorJson.error || errorMessage;
        } catch {
            errorMessage = errorText || errorMessage;
        }
    } catch {
        errorMessage = `Could not ${context.operation} (HTTP ${response.status})`;
    }
    
    const errorDetails = {
        error: `Failed to ${context.operation}`,
        message: errorMessage,
        statusCode: response.status,
        ...context
    };
    
    return new Error(JSON.stringify(errorDetails));
}

/**
 * Fetch com timeout e retry logic (apenas para GET requests)
 */
export async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout: number = DEFAULT_TIMEOUT,
    retries: number = 0
): Promise<Response> {
    return measureTiming(
        "http.fetch",
        async () => {
            const isGetRequest = !options.method || options.method === "GET";
            const maxRetries = isGetRequest ? retries : 0; // Apenas retry para GET
            const method = options.method || "GET";
            
            logger.debug("HTTP request", { 
                method, 
                url, 
                timeout, 
                retries: maxRetries 
            });
            
            // Node.js 15+ tem AbortController global
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
                const fetchOptions: RequestInit & { signal?: any } = {
                    ...options,
                    signal: controller.signal
                };
                const response = await fetch(url, fetchOptions);
                clearTimeout(timeoutId);
                
                // Log response
                if (!response.ok) {
                    logger.warn("HTTP request failed", {
                        method,
                        url,
                        status: response.status,
                        statusText: response.statusText,
                    });
                    incrementErrorCounter("http.fetch", { 
                        method, 
                        status: response.status.toString() 
                    });
                } else {
                    incrementCounter("http.fetch", { 
                        method, 
                        status: response.status.toString() 
                    });
                }
                
                // Retry apenas para GET requests com status 5xx ou timeout
                if (!response.ok && isGetRequest && maxRetries > 0) {
                    const status = response.status;
                    if (status >= 500 || status === 429) {
                        // Exponential backoff: espera 1s, 2s, 4s...
                        const delay = Math.pow(2, maxRetries - retries) * 1000;
                        logger.warn("HTTP request retrying", {
                            method,
                            url,
                            status,
                            attempt: maxRetries - retries + 1,
                            maxRetries,
                            delayMs: delay,
                        });
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return fetchWithTimeout(url, options, timeout, retries - 1);
                    }
                }
                
                return response;
            } catch (error: any) {
                clearTimeout(timeoutId);
                
                // Retry para timeout apenas em GET requests
                if ((error.name === "AbortError" || error.name === "TimeoutError") && isGetRequest && maxRetries > 0) {
                    const delay = Math.pow(2, maxRetries - retries) * 1000;
                    logger.warn("HTTP request timeout, retrying", {
                        method,
                        url,
                        attempt: maxRetries - retries + 1,
                        maxRetries,
                        delayMs: delay,
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return fetchWithTimeout(url, options, timeout, retries - 1);
                }
                
                logger.error("HTTP request error", error, {
                    method,
                    url,
                    timeout,
                });
                throw error;
            }
        },
        { method: options.method || "GET", url: new URL(url).pathname }
    );
}

/**
 * Obtém access token usando service account (com cache)
 */
export async function getAccessToken(scopes: string[]): Promise<string> {
    return measureTiming(
        "auth.getAccessToken",
        async () => {
            const cacheKey = scopes.join("+");
            let credentials = credentialsCache.get(cacheKey);
            
            // Verifica se o token está válido (com margem de 1 minuto)
            if (!credentials || credentials.expiresAt < Date.now() + 60000) {
                logger.debug("Fetching new service account token", { scopes });
                const { access_token, expires_in } = await getServiceAccountAccessToken(
                    APS_CLIENT_ID!,
                    APS_CLIENT_SECRET!,
                    APS_SA_ID!,
                    APS_SA_KEY_ID!,
                    APS_SA_PRIVATE_KEY!,
                    scopes
                );
                credentials = {
                    accessToken: access_token,
                    expiresAt: Date.now() + expires_in * 1000
                };
                credentialsCache.set(cacheKey, credentials);
                logger.debug("Service account token cached", { 
                    scopes, 
                    expiresIn: expires_in 
                });
                incrementCounter("auth.tokenCache", { type: "miss", auth: "service-account" });
            } else {
                incrementCounter("auth.tokenCache", { type: "hit", auth: "service-account" });
            }
            return credentials.accessToken;
        },
        { scopes: scopes.join(",") }
    );
}

/**
 * Obtém access token usando client credentials (com cache)
 */
export async function getCachedClientCredentialsAccessToken(scopes: string[]): Promise<string> {
    return measureTiming(
        "auth.getClientCredentialsAccessToken",
        async () => {
            const cacheKey = scopes.join("+");
            let credentials = clientCredentialsCache.get(cacheKey);
            
            // Verifica se o token está válido (com margem de 1 minuto)
            if (!credentials || credentials.expiresAt < Date.now() + 60000) {
                logger.debug("Fetching new client credentials token", { scopes });
                const { access_token, expires_in } = await getClientCredentialsAccessToken(
                    APS_CLIENT_ID!,
                    APS_CLIENT_SECRET!,
                    scopes
                );
                credentials = {
                    accessToken: access_token,
                    expiresAt: Date.now() + expires_in * 1000
                };
                clientCredentialsCache.set(cacheKey, credentials);
                logger.debug("Client credentials token cached", { 
                    scopes, 
                    expiresIn: expires_in 
                });
                incrementCounter("auth.tokenCache", { type: "miss", auth: "client-credentials" });
            } else {
                incrementCounter("auth.tokenCache", { type: "hit", auth: "client-credentials" });
            }
            return credentials.accessToken;
        },
        { scopes: scopes.join(",") }
    );
}