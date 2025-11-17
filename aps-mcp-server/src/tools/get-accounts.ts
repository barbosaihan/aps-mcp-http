import { getAccessToken, fetchWithTimeout, type Session } from "./common.js";
import type { Tool } from "./common.js";

const schema = {};

/**
 * Get Hubs using Autodesk Construction Cloud API (ACC API v1)
 * Following the official documentation: https://aps.autodesk.com/en/docs/acc/v1/tutorials/getting-started/retrieve-account-and-project-id/
 * 
 * The ACC API endpoint is: GET https://developer.api.autodesk.com/project/v1/hubs
 */
export const getAccounts: Tool<typeof schema> = {
    title: "get-accounts",
    description: "List all available Autodesk Construction Cloud accounts (hubs) using ACC API v1",
    schema,
    callback: async ({}, context?: { session?: Session }) => {
        const { logger } = await import("../utils/logger.js");
        
        try {
            logger.info("get-accounts: Starting", {
                sessionId: context?.session?.id,
                hasSession: !!context?.session,
                hasOAuth2: !!context?.session?.oauth2,
                oauth2Scopes: context?.session?.oauth2?.scopes,
            });
            
            // Obter access token - tentar com account:read primeiro (mais apropriado para listar accounts)
            let accessToken: string;
            try {
                // Tentar account:read primeiro (como recomenda a documentação)
                accessToken = await getAccessToken(["account:read"], context?.session);
                logger.info("get-accounts: Got access token with account:read", {
                    sessionId: context?.session?.id,
                });
            } catch (error: any) {
                // Se falhar com account:read, tentar com data:read
                logger.warn("get-accounts: Failed with account:read, trying data:read", { 
                    error: error.message,
                    sessionId: context?.session?.id,
                });
                accessToken = await getAccessToken(["data:read"], context?.session);
                logger.info("get-accounts: Got access token with data:read", {
                    sessionId: context?.session?.id,
                });
            }
            
            // Endpoint oficial ACC API v1 conforme documentação: https://aps.autodesk.com/en/docs/acc/v1/tutorials/getting-started/retrieve-account-and-project-id/
            const url = "https://developer.api.autodesk.com/project/v1/hubs";
            
            logger.info("get-accounts: Calling ACC API v1 endpoint", {
                sessionId: context?.session?.id,
                endpoint: url,
            });
            
            const response = await fetchWithTimeout(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }, 30000, 0);
            
            if (!response.ok) {
                const errorText = await response.text();
                logger.error("get-accounts: ACC API request failed", new Error(errorText), {
                    sessionId: context?.session?.id,
                    status: response.status,
                    statusText: response.statusText,
                    errorPreview: errorText.substring(0, 500),
                });
                throw new Error(`ACC API request failed: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
            }
            
            const result = await response.json() as any;
            
            logger.info("get-accounts: ACC API response received", {
                sessionId: context?.session?.id,
                hasData: !!result.data,
                dataLength: Array.isArray(result.data) ? result.data.length : 'N/A',
                hasWarnings: !!result.meta?.warnings,
                warningsCount: result.meta?.warnings?.length || 0,
            });
            
            // Verificar warnings na resposta (podem indicar problemas de permissão)
            if (result.meta?.warnings && Array.isArray(result.meta.warnings) && result.meta.warnings.length > 0) {
                const warnings = result.meta.warnings.filter((w: any) => w.HttpStatusCode === "403");
                if (warnings.length > 0) {
                    logger.warn("get-accounts: Permission warnings in response", {
                        sessionId: context?.session?.id,
                        warnings: warnings.map((w: any) => w.Title || w.Detail),
                    });
                }
            }
            
            // Extrair hubs da resposta
            const hubs = result.data || [];
            
            if (!Array.isArray(hubs) || hubs.length === 0) {
                logger.warn("get-accounts: No hubs found in response", {
                    sessionId: context?.session?.id,
                    hasData: !!result.data,
                    dataLength: Array.isArray(result.data) ? result.data.length : 'N/A',
                    fullResponse: JSON.stringify(result, null, 2).substring(0, 2000),
                });
                // Retornar array vazio ao invés de erro, para que o frontend possa lidar
                return {
                    content: []
                };
            }
            
            // Mapear hubs para o formato esperado
            // A estrutura da resposta ACC API v1 pode variar, então vamos tentar diferentes formatos
            const mappedHubs = hubs.map((hub: any) => {
                // Tentar diferentes caminhos para ID e nome
                const hubId = hub.id || hub.attributes?.id || hub.data?.id || hub.relationships?.hub?.data?.id;
                const hubName = hub.attributes?.name || hub.name || hub.data?.name || null;
                
                return {
                    type: "text" as const,
                    text: JSON.stringify({
                        id: hubId,
                        name: hubName,
                    })
                };
            }).filter((hub: any) => hub.text && hub.text !== '{"id":null,"name":null}'); // Filtrar hubs inválidos
            
            logger.info("get-accounts: Successfully mapped hubs", {
                sessionId: context?.session?.id,
                hubCount: mappedHubs.length,
                hubIds: mappedHubs.map((h: any) => {
                    try {
                        const parsed = JSON.parse(h.text);
                        return parsed.id;
                    } catch {
                        return 'parse-error';
                    }
                }).join(', '),
            });
            
            return {
                content: mappedHubs
            };
        } catch (error: any) {
            logger.error("get-accounts: Error", error as Error, {
                sessionId: context?.session?.id,
                errorMessage: error.message,
                errorStack: error.stack,
                errorCode: error.code,
            });
            throw error;
        }
    }
};