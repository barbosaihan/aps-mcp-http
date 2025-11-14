import { z } from "zod";
import type { Tool } from "./common.js";
import type { Session } from "./common.js";
import {
    generateCodeVerifier,
    generateCodeChallenge,
    generateState,
} from "../auth/oauth2.js";
import { APS_CLIENT_ID, APS_OAUTH_REDIRECT_URI, APS_OAUTH_SCOPES } from "../config.js";
import { logger } from "../utils/logger.js";

const schema = {
    redirectUri: z.string().url().optional(),
    scopes: z.array(z.string()).optional(),
};

const zodSchema = z.object(schema);
type SchemaType = z.infer<typeof zodSchema>;

/**
 * Tool: get-token
 * 
 * Obtém um token OAuth2 PKCE para fazer requisições à API Autodesk.
 * Similar ao GetToken do repositório .NET de referência:
 * https://github.com/autodesk-platform-services/aps-aecdm-mcp-dotnet
 * 
 * Esta tool:
 * 1. Gera code_verifier, code_challenge e state (PKCE)
 * 2. Armazena PKCE na sessão
 * 3. Retorna authorizationUrl para redirecionar o usuário
 * 4. Após o usuário autorizar, o código será trocado por token automaticamente
 *    quando o callback for chamado (via endpoint /oauth/callback)
 * 
 * Fluxo completo:
 * 1. Cliente chama get-token → recebe authorizationUrl
 * 2. Cliente redireciona usuário para authorizationUrl (Autodesk)
 * 3. Autodesk redireciona para redirectUri com code e state
 * 4. Cliente chama /oauth/callback com code e state
 * 5. Servidor troca code por token e armazena na sessão
 * 6. Próximas chamadas de tools usam o token OAuth2 da sessão
 */
export const getToken: Tool<typeof schema> = {
    title: "get-token",
    description:
        "Get OAuth2 PKCE token for Autodesk API requests. Returns authorization URL to redirect user for authentication. After user authorizes, the code will be exchanged for a token automatically.",
    schema,
    callback: async ({ redirectUri, scopes }, extra?: any) => {
        const session = (extra as any)?.session as Session | undefined;
        
        try {
            if (!session) {
                throw new Error(
                    "Session not found. This tool requires a valid session context."
                );
            }

            if (!APS_CLIENT_ID) {
                throw new Error("APS_CLIENT_ID is not configured");
            }

            // 1. Gerar PKCE (code_verifier, code_challenge, state)
            const codeVerifier = generateCodeVerifier();
            const codeChallenge = generateCodeChallenge(codeVerifier);
            const state = generateState();

            logger.debug("Generated PKCE for OAuth2", {
                sessionId: session.id,
                state,
                hasCodeVerifier: !!codeVerifier,
                hasCodeChallenge: !!codeChallenge,
            });

            // 3. Construir URL de autorização
            const finalRedirectUri =
                redirectUri ||
                APS_OAUTH_REDIRECT_URI ||
                "http://localhost:5173/oauth/callback";

            const finalScopes =
                scopes && scopes.length > 0
                    ? scopes
                    : APS_OAUTH_SCOPES?.split(" ") ||
                      ["data:read", "data:write", "account:read", "account:write"];

            // 2. Armazenar PKCE na sessão (incluindo redirectUri e scopes)
            session.pkce = {
                codeVerifier,
                state,
                createdAt: Date.now(),
                redirectUri: finalRedirectUri,
                scopes: finalScopes,
            };

            const authUrl = new URL(
                "https://developer.api.autodesk.com/authentication/v2/authorize"
            );
            authUrl.searchParams.set("response_type", "code");
            authUrl.searchParams.set("client_id", APS_CLIENT_ID);
            authUrl.searchParams.set("redirect_uri", finalRedirectUri);
            authUrl.searchParams.set("scope", finalScopes.join(" "));
            authUrl.searchParams.set("code_challenge", codeChallenge);
            authUrl.searchParams.set("code_challenge_method", "S256");
            authUrl.searchParams.set("state", state);

            logger.info("OAuth2 authorization URL generated", {
                sessionId: session.id,
                redirectUri: finalRedirectUri,
                scopes: finalScopes,
                state,
            });

            // 4. Retornar authorizationUrl, state e sessionId
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                authorizationUrl: authUrl.toString(),
                                state,
                                sessionId: session.id,
                                redirectUri: finalRedirectUri,
                                scopes: finalScopes,
                                expiresIn: 10 * 60, // PKCE expira em 10 minutos
                                message:
                                    "Redirect the user to the authorizationUrl. After authorization, the callback will exchange the code for a token automatically.",
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error: any) {
            logger.error("Error in get-token tool", error, {
                hasSession: !!session,
                sessionId: session?.id,
            });
            
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            {
                                error: error.message || "Failed to generate OAuth2 authorization URL",
                                message:
                                    "Failed to get OAuth2 token. Please ensure APS_CLIENT_ID is configured.",
                            },
                            null,
                            2
                        ),
                    },
                ],
                isError: true,
            };
        }
    },
};

