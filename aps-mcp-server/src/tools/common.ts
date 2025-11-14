import { ZodRawShape } from "zod";
import { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import fetch, { RequestInit, Response } from "node-fetch";
import { APS_CLIENT_ID, APS_CLIENT_SECRET, APS_SA_ID, APS_SA_KEY_ID, APS_SA_PRIVATE_KEY } from "../config.js";
import { getServiceAccountAccessToken, getClientCredentialsAccessToken } from "../auth.js";
import { logger } from "../utils/logger.js";
import { measureTiming, incrementCounter, incrementErrorCounter } from "../utils/metrics.js";

// Export Session type from http-server (will be defined there)
export type Session = {
    id: string;
    createdAt: number;
    lastActivity: number;
    streams: Set<string>;
    oauth2?: {
        accessToken: string;
        refreshToken?: string;
        expiresAt: number;
        userId?: string;
        email?: string;
        scopes?: string[];
    };
    pkce?: {
        codeVerifier: string;
        state: string;
        createdAt: number;
    };
};

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
 * Resolve projectId: se for GUID válido, retorna ele; se for nome, busca o projeto na conta e retorna GUID
 * 
 * @param projectId - GUID do projeto ou nome do projeto
 * @param accountId - ID da conta (obrigatório se projectId for nome)
 * @param accessToken - Token de acesso
 * @returns GUID válido do projeto
 */
export async function resolveProjectId(
    projectId: string,
    accountId: string | undefined,
    accessToken: string
): Promise<string> {
    // Limpar projectId (remover prefixo "b." se presente)
    let cleanedProjectId = cleanProjectId(projectId);
    
    // Verificar se é um GUID válido
    if (isValidGuid(cleanedProjectId)) {
        return cleanedProjectId;
    }
    
    // Se não é um GUID válido, pode ser um nome de projeto
    // Nesse caso, precisamos do accountId para buscar o projeto
    if (!accountId) {
        throw new Error(`Invalid project ID: "${projectId}" is not a valid GUID. Please provide accountId when using project name.`);
    }
    
    // Buscar projeto pelo nome
    const { DataManagementClient } = await import("@aps_sdk/data-management");
    const dataManagementClient = new DataManagementClient();
    const accountIdClean = cleanProjectId(accountId);
    const projects = await dataManagementClient.getHubProjects(accountIdClean, { accessToken });
    
    if (!projects.data || projects.data.length === 0) {
        throw new Error(`No projects found in account ${accountIdClean}`);
    }
    
    // Procurar projeto pelo nome (case-insensitive)
    const projectName = cleanedProjectId;
    const foundProject = projects.data.find((project) => {
        const projectNameFromData = project.attributes?.name || (project as any).name || "";
        return projectNameFromData.toLowerCase() === projectName.toLowerCase();
    });
    
    if (!foundProject) {
        throw new Error(`Project "${projectName}" not found in account ${accountIdClean}. Available projects: ${projects.data.map(p => p.attributes?.name || p.id).join(", ")}`);
    }
    
    // Extrair GUID do projeto encontrado
    const extractedGuid = extractProjectGuid(foundProject);
    
    if (!extractedGuid || !isValidGuid(extractedGuid)) {
        throw new Error(`Failed to extract valid GUID from project "${projectName}". Project ID: ${foundProject.id}`);
    }
    
    return extractedGuid;
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
    
    const errorDetails: any = {
        error: `Failed to ${context.operation}`,
        message: errorMessage,
        statusCode: response.status,
        ...context
    };

    // Adicionar dicas específicas para erros 401 (não autorizado)
    if (response.status === 401) {
        errorDetails.hint = "Erro de autenticação/autorização. Verifique:";
        errorDetails.suggestions = [
            "As credenciais APS_CLIENT_ID e APS_CLIENT_SECRET estão configuradas corretamente no arquivo .env",
            "A aplicação APS tem permissões necessárias (scopes) para executar esta operação",
            "O token de acesso não expirou ou foi invalidado",
            "A aplicação está registrada como uma 'Custom Integration' no Autodesk Construction Cloud",
            "A aplicação tem acesso à conta especificada"
        ];
    }
    
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
 * Obtém access token usando OAuth2 da sessão (OAuth2 OBRIGATÓRIO)
 * @param scopes - Scopes necessários para o token
 * @param session - Sessão OBRIGATÓRIA contendo tokens OAuth2
 * @returns Access token
 * @throws Error se não houver token OAuth2 válido
 */
export async function getAccessToken(
    scopes: string[],
    session?: Session
): Promise<string> {
    return measureTiming(
        "auth.getAccessToken",
        async () => {
            // OAuth2 é OBRIGATÓRIO - não há fallback para service account
            if (!session?.oauth2?.accessToken) {
                const error = new Error(
                    "OAuth2 authentication required. Please authenticate with Autodesk first using the get-token tool."
                );
                logger.error("OAuth2 token not available", error, {
                    sessionId: session?.id,
                    hasSession: !!session,
                });
                incrementErrorCounter("auth.missingOAuth2Token", {
                    scopes: scopes.join(","),
                });
                throw error;
            }

            const expiresAt = session.oauth2.expiresAt;
            const now = Date.now();

            // Se token ainda é válido (com margem de 1 minuto)
            if (expiresAt > now + 60000) {
                // Verificar se tem scopes necessários
                const hasScopes = scopes.every(
                    (scope) => session.oauth2?.scopes?.includes(scope)
                );

                if (hasScopes) {
                    logger.debug("Using OAuth2 token from session", {
                        sessionId: session.id,
                        scopes,
                    });
                    incrementCounter("auth.tokenCache", {
                        type: "hit",
                        auth: "oauth2",
                    });
                    return session.oauth2.accessToken;
                } else {
                    logger.warn("OAuth2 token missing required scopes", {
                        sessionId: session.id,
                        required: scopes,
                        available: session.oauth2.scopes,
                    });
                    throw new Error(
                        `OAuth2 token missing required scopes. Required: ${scopes.join(", ")}, Available: ${session.oauth2.scopes?.join(", ")}`
                    );
                }
            }

            // Token expirado, tentar refresh
            if (session.oauth2.refreshToken) {
                try {
                    logger.debug("Refreshing OAuth2 token", {
                        sessionId: session.id,
                    });
                    const { refreshAccessToken } = await import("../auth/oauth2.js");
                    const newTokens = await refreshAccessToken(
                        APS_CLIENT_ID!,
                        session.oauth2.refreshToken
                    );

                    // Atualizar sessão
                    session.oauth2 = {
                        accessToken: newTokens.access_token,
                        refreshToken:
                            newTokens.refresh_token || session.oauth2.refreshToken,
                        expiresAt: Date.now() + newTokens.expires_in * 1000,
                        userId: session.oauth2.userId,
                        email: session.oauth2.email,
                        scopes: newTokens.scope?.split(" ") || [],
                    };

                    logger.debug("OAuth2 token refreshed", {
                        sessionId: session.id,
                        expiresIn: newTokens.expires_in,
                    });
                    incrementCounter("auth.tokenCache", {
                        type: "refresh",
                        auth: "oauth2",
                    });
                    return session.oauth2.accessToken;
                } catch (error) {
                    logger.error("Failed to refresh OAuth2 token", error, {
                        sessionId: session.id,
                    });
                    throw new Error(
                        "OAuth2 token expired and refresh failed. Please re-authenticate using the get-token tool."
                    );
                }
            }

            // Token expirado e sem refresh token
            throw new Error(
                "OAuth2 token expired and no refresh token available. Please re-authenticate using the get-token tool."
            );
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
            // Validar que as credenciais estão configuradas
            if (!APS_CLIENT_ID || !APS_CLIENT_SECRET) {
                const missingVars = [];
                if (!APS_CLIENT_ID) missingVars.push("APS_CLIENT_ID");
                if (!APS_CLIENT_SECRET) missingVars.push("APS_CLIENT_SECRET");
                throw new Error(JSON.stringify({
                    error: "Missing credentials",
                    message: `As seguintes variáveis de ambiente não estão configuradas: ${missingVars.join(", ")}. Por favor, configure-as no arquivo .env`,
                    statusCode: 401,
                    missingVariables: missingVars
                }));
            }

            const cacheKey = scopes.join("+");
            let credentials = clientCredentialsCache.get(cacheKey);
            
            // Verifica se o token está válido (com margem de 1 minuto)
            if (!credentials || credentials.expiresAt < Date.now() + 60000) {
                logger.debug("Fetching new client credentials token", { scopes });
                try {
                    const { access_token, expires_in } = await getClientCredentialsAccessToken(
                        APS_CLIENT_ID,
                        APS_CLIENT_SECRET,
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
                } catch (error: any) {
                    // Capturar erros de autenticação e fornecer mensagem mais clara
                    const errorMessage = error?.message || error?.toString() || "Unknown error";
                    logger.error("Failed to get client credentials token", error, { scopes });
                    throw new Error(JSON.stringify({
                        error: "Authentication failed",
                        message: `Não foi possível obter token de autenticação: ${errorMessage}. Verifique se APS_CLIENT_ID e APS_CLIENT_SECRET estão corretos no arquivo .env`,
                        statusCode: 401,
                        originalError: errorMessage,
                        scopes: scopes
                    }));
                }
            } else {
                incrementCounter("auth.tokenCache", { type: "hit", auth: "client-credentials" });
            }
            return credentials.accessToken;
        },
        { scopes: scopes.join(",") }
    );
}